const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  buildLaunchOptions,
  createUserDataProfile,
  getElectronExecutable,
  normalizeAppMetrics,
  collectEnvironment,
  collectProcessSamples,
  validatePerformanceOptions,
  summarizeRuns,
} = require('../tools/performance/electronRunner');

test('getElectronExecutable resolves the local Electron binary for Windows', () => {
  assert.equal(
    getElectronExecutable('C:/project', 'win32'),
    path.join('C:/project', 'node_modules', 'electron', 'dist', 'electron.exe'),
  );
});

test('createUserDataProfile preserves an explicit profile and removes a temporary one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-perf-test-'));
  const explicit = path.join(root, 'explicit');
  const named = createUserDataProfile({ profilePath: explicit, tempRoot: root });
  assert.equal(named.path, path.resolve(explicit));
  named.cleanup();
  assert.ok(fs.existsSync(explicit));

  const temporary = createUserDataProfile({ tempRoot: root });
  assert.ok(fs.existsSync(temporary.path));
  temporary.cleanup();
  assert.equal(fs.existsSync(temporary.path), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('buildLaunchOptions isolates user data and launches a dev build from the project root', () => {
  const options = buildLaunchOptions({
    projectRoot: 'C:/project',
    executablePath: 'C:/project/node_modules/electron/dist/electron.exe',
    userDataDir: 'C:/profile',
    disableGpu: true,
    buildType: 'dev',
    inheritedEnv: { ELECTRON_RUN_AS_NODE: '1', PATH: 'C:/bin' },
  });
  assert.deepEqual(options.args, ['--user-data-dir=C:/profile', '--disable-gpu', '.']);
  assert.equal(options.cwd, 'C:/project');
  assert.equal(options.executablePath, 'C:/project/node_modules/electron/dist/electron.exe');
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(options.env.PATH, 'C:/bin');
});

test('buildLaunchOptions does not add the project path for a packaged executable', () => {
  assert.deepEqual(
    buildLaunchOptions({
      projectRoot: 'C:/project', executablePath: 'C:/app/Desktop Pet.exe', userDataDir: 'C:/profile', buildType: 'packaged',
    }).args,
    ['--user-data-dir=C:/profile'],
  );
});

test('normalizeAppMetrics keeps only numeric process metrics', () => {
  assert.deepEqual(
    normalizeAppMetrics([
      { type: 'Browser', cpu: { percentCPUUsage: 4.5 }, memory: { workingSetSize: 20, privateBytes: 10 }, pid: 7 },
      { type: 'GPU', cpu: { percentCPUUsage: 'invalid' }, memory: { workingSetSize: null } },
    ]),
    [{ type: 'Browser', cpuPercent: 4.5, workingSetKiB: 20, privateKiB: 10, pid: 7 }, { type: 'GPU' }],
  );
});

test('collectEnvironment evaluates without renderer-side require and merges host OS details', async () => {
  const app = {
    getName: () => 'DeskPet',
    getVersion: () => '0.9.3',
    getGPUInfo: async () => ({ gpuDevice: [{ vendorId: 1 }] }),
  };
  const screen = {
    getPrimaryDisplay: () => ({ id: 7 }),
    getAllDisplays: () => [{
      id: 7,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1.25,
      displayFrequency: 75,
    }],
  };
  const electronApp = {
    evaluate: async (callback) => {
      const isolatedCallback = vm.runInNewContext(`(${callback.toString()})`, {
        process: {
          versions: { electron: '42.2.0' },
          platform: 'win32',
          arch: 'x64',
        },
      });
      return structuredClone(await isolatedCallback({ app, screen }));
    },
  };

  const environment = await collectEnvironment(electronApp, {
    buildType: 'dev',
    disableGpu: false,
    userDataDir: 'C:/profile',
  });

  assert.deepEqual(environment.app, {
    name: 'DeskPet',
    version: '0.9.3',
    electron: '42.2.0',
  });
  assert.equal(environment.os.platform, 'win32');
  assert.equal(environment.os.arch, 'x64');
  assert.equal(environment.os.release, os.release());
  assert.deepEqual(environment.os.cpus, os.cpus().map(({ model }) => model));
  assert.equal(environment.primaryDisplayId, 7);
  assert.equal(environment.displays[0].refreshRate, 75);
  assert.equal(environment.buildType, 'dev');
  assert.equal(environment.gpuDisabled, false);
  assert.equal(environment.userDataDir, 'C:/profile');
});

test('summarizeRuns retains summaries for each scenario as well as an overall summary', () => {
  const summary = summarizeRuns([
    { scenario: 'idle', renderer: { frameIntervalsMs: [16], longTaskDurationsMs: [] }, processSamples: [[]] },
    { scenario: 'rain', renderer: { frameIntervalsMs: [20], longTaskDurationsMs: [60] }, processSamples: [[]] },
  ], 60);
  assert.equal(summary.byScenario.idle.frameIntervals.count, 1);
  assert.equal(summary.byScenario.rain.longTasks.over50, 1);
  assert.equal(summary.overall.frameIntervals.count, 2);
});

test('collectProcessSamples records one sample after a short valid wait interval', async () => {
  let now = 0;
  let calls = 0;
  const samples = await collectProcessSamples({
    electronApp: { evaluate: async () => { calls += 1; return [{ type: 'Browser', cpu: { percentCPUUsage: 2 } }]; } },
    sampleMs: 10,
    intervalMs: 250,
    now: () => now,
    waitFn: async (milliseconds) => { now += milliseconds; },
  });
  assert.equal(calls, 1);
  assert.equal(samples.length, 1);
});

test('validatePerformanceOptions rejects invalid programmatic measurement options', () => {
  assert.throws(() => validatePerformanceOptions({ warmupMs: -1 }), /warmupMs/);
  assert.throws(() => validatePerformanceOptions({ sampleMs: 0 }), /sampleMs/);
  assert.throws(() => validatePerformanceOptions({ repetitions: 1.5 }), /repetitions/);
  assert.throws(() => validatePerformanceOptions({ refreshRate: 0 }), /refreshRate/);
  assert.doesNotThrow(() => validatePerformanceOptions({ warmupMs: 0, sampleMs: 1, repetitions: 1, refreshRate: 60 }));
});

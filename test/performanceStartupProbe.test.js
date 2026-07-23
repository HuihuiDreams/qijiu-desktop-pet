const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildStartupLaunchOptions,
  parseArgs,
  summarizeStartupRuns,
  validateStartupOptions,
} = require('../tools/performance/measureStartup');

test('startup probe launch options isolate user data, remove ELECTRON_RUN_AS_NODE, and target the wrapper', () => {
  const options = buildStartupLaunchOptions({
    projectRoot: 'C:/project',
    executablePath: 'C:/project/node_modules/electron/dist/electron.exe',
    userDataDir: 'C:/profile',
    inheritedEnv: { ELECTRON_RUN_AS_NODE: '1', PATH: 'C:/bin' },
  });
  assert.deepEqual(options.args, ['--user-data-dir=C:/profile', path.join('C:/project', 'tools', 'performance', 'startupProbeMain.js')]);
  assert.equal(options.cwd, 'C:/project');
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(options.env.PATH, 'C:/bin');
});

test('startup CLI requires a positive repetition count and output path', () => {
  assert.deepEqual(parseArgs(['--repetitions', '2', '--output', 'report.json']), {
    repetitions: 2,
    output: 'report.json',
    powerMode: null,
  });
  assert.throws(() => parseArgs(['--repetitions', '0', '--output', 'report.json']), /positive integer/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
  assert.throws(() => validateStartupOptions({ repetitions: 1.5 }), /positive integer/);
});

test('startup run summaries use nearest-rank p50 and p95 with maxima', () => {
  const summary = summarizeStartupRuns([
    { processToWindowMs: 10, windowToDidFinishLoadMs: 20, clearCacheMs: 30, launchToLoadMs: 40 },
    { processToWindowMs: 20, windowToDidFinishLoadMs: 30, clearCacheMs: 40, launchToLoadMs: 50 },
    { processToWindowMs: 30, windowToDidFinishLoadMs: 40, clearCacheMs: 50, launchToLoadMs: 60 },
  ]);
  assert.deepEqual(summary.processToWindowMs, { p50: 20, p95: 30, max: 30 });
  assert.deepEqual(summary.launchToLoadMs, { p50: 50, p95: 60, max: 60 });
});

test('startup probe installs listeners before loading main and wraps clearCache with bound original method', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'performance', 'startupProbeMain.js'), 'utf8');
  assert.ok(source.indexOf("app.on('browser-window-created'") < source.indexOf("require('../../main')"));
  assert.match(source, /clearCache\.bind\(session\)/);
  assert.match(source, /did-finish-load/);
  assert.match(source, /app\.__DESKPET_STARTUP_PROBE/);
});

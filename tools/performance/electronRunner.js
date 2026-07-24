const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

function getElectronExecutable(projectRoot, platform = process.platform) {
  const binary = platform === 'win32' ? 'electron.exe' : 'electron';
  const base = path.join(projectRoot, 'node_modules', 'electron', 'dist');
  return platform === 'darwin'
    ? path.join(base, 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : path.join(base, binary);
}

function createUserDataProfile({ profilePath, tempRoot = os.tmpdir() } = {}) {
  if (profilePath) {
    const explicitPath = path.resolve(profilePath);
    fs.mkdirSync(explicitPath, { recursive: true });
    return { path: explicitPath, temporary: false, cleanup() {} };
  }
  const temporaryPath = fs.mkdtempSync(path.join(tempRoot, 'desktop-pet-performance-'));
  return {
    path: temporaryPath,
    temporary: true,
    cleanup() { fs.rmSync(temporaryPath, { recursive: true, force: true }); },
  };
}

function buildLaunchOptions({
  projectRoot,
  executablePath,
  userDataDir,
  disableGpu = false,
  buildType = 'dev',
  inheritedEnv = process.env,
}) {
  const args = [`--user-data-dir=${userDataDir}`];
  if (disableGpu) args.push('--disable-gpu');
  args.push('--disable-dev-shm-usage', '--no-sandbox');
  if (buildType === 'dev') args.push('.');
  const launchEnv = { ...inheritedEnv, DESKTOP_PET_USER_DATA_DIR: userDataDir };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  return {
    executablePath,
    args,
    cwd: projectRoot,
    env: launchEnv,
    timeout: 30000,
  };
}

function finite(value) { return Number.isFinite(value) ? value : undefined; }

function normalizeAppMetrics(rawMetrics) {
  if (!Array.isArray(rawMetrics)) return [];
  return rawMetrics.map((metric) => {
    const normalized = {};
    if (metric && typeof metric.type === 'string') normalized.type = metric.type;
    const cpuPercent = finite(metric && (metric.cpu && metric.cpu.percentCPUUsage !== undefined ? metric.cpu.percentCPUUsage : metric.cpu));
    if (cpuPercent !== undefined) normalized.cpuPercent = cpuPercent;
    const pid = finite(metric && metric.pid);
    if (pid !== undefined) normalized.pid = pid;
    const workingSetSize = finite(metric && metric.memory && metric.memory.workingSetSize);
    if (workingSetSize !== undefined) normalized.workingSetKiB = workingSetSize;
    const privateBytes = finite(metric && metric.memory && metric.memory.privateBytes);
    if (privateBytes !== undefined) normalized.privateKiB = privateBytes;
    return normalized;
  });
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function validatePerformanceOptions(options = {}) {
  if (options.warmupMs !== undefined && (!Number.isFinite(options.warmupMs) || options.warmupMs < 0)) {
    throw new TypeError('warmupMs must be a finite number greater than or equal to zero');
  }
  if (options.sampleMs !== undefined && (!Number.isFinite(options.sampleMs) || options.sampleMs <= 0)) {
    throw new TypeError('sampleMs must be a positive finite number');
  }
  if (options.repetitions !== undefined && (!Number.isInteger(options.repetitions) || options.repetitions <= 0)) {
    throw new TypeError('repetitions must be a positive integer');
  }
  if (options.refreshRate !== undefined && options.refreshRate !== null && (!Number.isFinite(options.refreshRate) || options.refreshRate <= 0)) {
    throw new TypeError('refreshRate must be a positive finite number');
  }
}

async function collectProcessSamples({ electronApp, sampleMs, intervalMs, waitFn = wait, now = Date.now }) {
  const samples = [];
  const startedAt = now();
  while (true) {
    const remaining = sampleMs - (now() - startedAt);
    if (remaining <= 0) break;
    await waitFn(Math.min(intervalMs, remaining));
    samples.push(normalizeAppMetrics(await electronApp.evaluate(({ app }) => app.getAppMetrics())));
    if (now() - startedAt >= sampleMs) break;
  }
  return samples;
}

async function collectEnvironment(electronApp, { buildType, disableGpu, userDataDir }) {
  const appInfo = await electronApp.evaluate(async ({ app, screen }) => ({
    app: { name: app.getName(), version: app.getVersion(), electron: process.versions.electron },
    os: {
      platform: process.platform,
      arch: process.arch,
    },
    gpu: await app.getGPUInfo('basic').catch(() => null),
    primaryDisplayId: screen.getPrimaryDisplay().id,
    displays: screen.getAllDisplays().map(({
      id, bounds, workArea, scaleFactor, displayFrequency,
    }) => ({
      id,
      bounds,
      workArea,
      scaleFactor,
      refreshRate: displayFrequency,
    })),
  }));
  return {
    ...appInfo,
    os: {
      ...appInfo.os,
      release: os.release(),
      cpus: os.cpus().map(({ model }) => model),
    },
    buildType,
    gpuDisabled: Boolean(disableGpu),
    userDataDir,
  };
}

function summarizeRuns(runs, refreshRateHz) {
  const { summarizeFrameIntervals, summarizeLongTasks, summarizeProcessSamples } = require('./metrics');
  const summarize = (items) => ({
    frameIntervals: summarizeFrameIntervals(
      items.flatMap((run) => run.renderer.frameIntervalsMs || []),
      { refreshRateHz },
    ),
    longTasks: summarizeLongTasks(items.flatMap((run) => run.renderer.longTaskDurationsMs || [])),
    processes: summarizeProcessSamples(items.flatMap((run) => run.processSamples)),
  });
  const byScenario = {};
  for (const scenario of [...new Set(runs.map((run) => run.scenario))]) {
    byScenario[scenario] = summarize(runs.filter((run) => run.scenario === scenario));
  }
  return { byScenario, overall: summarize(runs) };
}

async function runPerformanceMeasurement(options = {}) {
  validatePerformanceOptions(options);
  const projectRoot = path.resolve(options.projectRoot || path.join(__dirname, '..', '..'));
  const buildType = options.executable ? 'packaged' : (options.buildType || 'dev');
  const executablePath = options.executable || options.executablePath || getElectronExecutable(projectRoot);
  const scenarios = options.scenarios || ['idle'];
  const warmupMs = options.warmupMs ?? 5000;
  const sampleMs = options.sampleMs ?? 30000;
  const repetitions = options.repetitions ?? 3;
  const waitFn = options.waitFn || wait;
  const profile = createUserDataProfile({ profilePath: options.profile, tempRoot: options.tempRoot });
  const { applyScenario, collectRendererSample } = require('./scenarios');
  let electronApp;
  try {
    electronApp = await (options.electron || electron).launch(buildLaunchOptions({
      projectRoot, executablePath, userDataDir: profile.path, disableGpu: options.disableGpu, buildType,
    }));
    const environment = await collectEnvironment(electronApp, { buildType, disableGpu: options.disableGpu, userDataDir: profile.path });
    environment.powerMode = options.powerMode ?? null;
    const primaryDisplay = environment.displays.find((display) => display.id === environment.primaryDisplayId);
    const primaryRefreshRate = primaryDisplay && finite(primaryDisplay.refreshRate);
    const effectiveRefreshRate = finite(options.refreshRate) || primaryRefreshRate || 60;
    const refreshRateSource = finite(options.refreshRate)
      ? 'explicit'
      : (primaryRefreshRate ? 'primary-display' : 'fallback-60');
    const runs = [];
    for (const scenario of scenarios) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const page = await electronApp.firstWindow({ timeout: 15000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await applyScenario(page, scenario);
        await waitFn(warmupMs);
        const interval = Math.max(250, Math.min(1000, sampleMs));
        await electronApp.evaluate(({ app }) => app.getAppMetrics());
        const rendererPromise = collectRendererSample(page, { durationMs: sampleMs });
        const processSamples = await collectProcessSamples({
          electronApp, sampleMs, intervalMs: interval, waitFn, now: options.now || Date.now,
        });
        const renderer = await rendererPromise;
        runs.push({ scenario, repetition, renderer, processSamples });
      }
    }
    return {
      schemaVersion: 1,
      environment,
      config: {
        scenarios, warmupMs, sampleMs, repetitions, disableGpu: Boolean(options.disableGpu), executablePath,
        effectiveRefreshRate, refreshRateSource, powerMode: options.powerMode ?? null,
      },
      runs,
      summaries: summarizeRuns(runs, effectiveRefreshRate),
    };
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    if (profile.temporary) profile.cleanup();
  }
}

module.exports = {
  getElectronExecutable, createUserDataProfile, buildLaunchOptions, normalizeAppMetrics,
  validatePerformanceOptions, collectProcessSamples, collectEnvironment, summarizeRuns,
  runPerformanceMeasurement,
};

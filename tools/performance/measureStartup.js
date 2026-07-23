const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const {
  createUserDataProfile,
  getElectronExecutable,
} = require('./electronRunner');

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return number;
}

function parseArgs(args) {
  const options = { repetitions: 5, output: null, powerMode: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--repetitions') {
      options.repetitions = positiveInteger(args[++index], 'repetitions');
    } else if (argument === '--output') {
      options.output = args[++index] || null;
    } else if (argument === '--power-mode') {
      options.powerMode = args[++index] || null;
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new TypeError(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function validateStartupOptions(options = {}) {
  if (options.repetitions !== undefined) positiveInteger(options.repetitions, 'repetitions');
}

function buildStartupLaunchOptions({
  projectRoot,
  executablePath,
  userDataDir,
  inheritedEnv = process.env,
}) {
  const env = { ...inheritedEnv, DESKTOP_PET_USER_DATA_DIR: userDataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    executablePath,
    args: [
      `--user-data-dir=${userDataDir}`,
      path.join(projectRoot, 'tools', 'performance', 'startupProbeMain.js'),
    ],
    cwd: projectRoot,
    env,
    timeout: 30000,
  };
}

function nearestRank(values, percentile) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1)];
}

function summarizeStartupRuns(runs) {
  const summarize = (field) => {
    const values = runs.map((run) => run[field]);
    return {
      p50: nearestRank(values, 50),
      p95: nearestRank(values, 95),
      max: nearestRank(values, 100),
    };
  };
  return {
    processToWindowMs: summarize('processToWindowMs'),
    windowToDidFinishLoadMs: summarize('windowToDidFinishLoadMs'),
    clearCacheMs: summarize('clearCacheMs'),
    launchToLoadMs: summarize('launchToLoadMs'),
  };
}

function assertCompleteProbe(probe) {
  const fields = [
    'probeStartedAtMs',
    'browserWindowCreatedAtMs',
    'didFinishLoadAtMs',
    'clearCacheMs',
  ];
  for (const field of fields) {
    if (!Number.isFinite(probe && probe[field])) {
      throw new Error(`Startup probe is missing a finite ${field}`);
    }
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCompleteProbe(electronApp, { timeoutMs = 30000, waitFn = wait } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const probe = await electronApp.evaluate(({ app }) => app.__DESKPET_STARTUP_PROBE || null);
    if (probe && Number.isFinite(probe.didFinishLoadAtMs) && Number.isFinite(probe.clearCacheMs)) {
      return probe;
    }
    await waitFn(25);
  }
  throw new Error('Timed out waiting for the startup probe to complete');
}

async function collectEnvironment(electronApp, powerMode) {
  const appInfo = await electronApp.evaluate(({ app }) => ({
    app: { name: app.getName(), version: app.getVersion(), electron: process.versions.electron },
    os: { platform: process.platform, arch: process.arch },
  }));
  return {
    ...appInfo,
    os: { ...appInfo.os, release: os.release() },
    buildType: 'dev',
    powerMode: powerMode ?? null,
  };
}

function elapsedMilliseconds(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

async function runStartupMeasurement(options = {}) {
  validateStartupOptions(options);
  const projectRoot = path.resolve(options.projectRoot || path.join(__dirname, '..', '..'));
  const executablePath = options.executablePath || getElectronExecutable(projectRoot);
  const repetitions = options.repetitions ?? 5;
  const runs = [];
  let environment;

  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const profile = createUserDataProfile({ tempRoot: options.tempRoot });
    let electronApp;
    try {
      const launchStartedAt = process.hrtime.bigint();
      electronApp = await (options.electron || electron).launch(buildStartupLaunchOptions({
        projectRoot,
        executablePath,
        userDataDir: profile.path,
        inheritedEnv: options.inheritedEnv,
      }));
      const page = await electronApp.firstWindow({ timeout: 30000 });
      await page.waitForLoadState('load', { timeout: 30000 });
      const launchToLoadMs = elapsedMilliseconds(launchStartedAt);
      const probe = await waitForCompleteProbe(electronApp, { waitFn: options.waitFn || wait });
      assertCompleteProbe(probe);
      if (!environment) environment = await collectEnvironment(electronApp, options.powerMode);
      runs.push({
        repetition,
        processToWindowMs: probe.browserWindowCreatedAtMs - probe.probeStartedAtMs,
        windowToDidFinishLoadMs: probe.didFinishLoadAtMs - probe.browserWindowCreatedAtMs,
        clearCacheMs: probe.clearCacheMs,
        launchToLoadMs,
      });
    } finally {
      if (electronApp) await electronApp.close().catch(() => {});
      profile.cleanup();
    }
  }

  return {
    schemaVersion: 1,
    environment,
    config: { repetitions, executablePath, powerMode: options.powerMode ?? null },
    runs,
    summaries: summarizeStartupRuns(runs),
  };
}

function usage() {
  return 'Usage: node tools/performance/measureStartup.js --repetitions 5 --output PATH [--power-mode LABEL]';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.output) throw new TypeError('--output PATH is required');
  const report = await runStartupMeasurement(options);
  fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Startup measurement written to ${path.resolve(options.output)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildStartupLaunchOptions,
  parseArgs,
  runStartupMeasurement,
  summarizeStartupRuns,
  validateStartupOptions,
  waitForCompleteProbe,
};

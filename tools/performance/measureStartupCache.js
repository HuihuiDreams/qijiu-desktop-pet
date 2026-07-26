const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { createUserDataProfile, getElectronExecutable } = require('./electronRunner');
const { buildStartupLaunchOptions, assertCompleteProbe } = require('./measureStartup');
const { waitForCompleteProbe } = require('./probeUtils');

function nearestRank(values, percentile) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1)];
}

async function runHotStartSequence(options, modeName, extraArgs = []) {
  const projectRoot = path.resolve(path.join(__dirname, '..', '..'));
  const executablePath = getElectronExecutable(projectRoot);
  const repetitions = 5;
  const runs = [];

  const profile = createUserDataProfile();
  try {
    // Preheat run
    let electronApp = await electron.launch(buildStartupLaunchOptions({
      projectRoot, executablePath, userDataDir: profile.path,
      inheritedEnv: { ...process.env, DESKTOP_PET_SIMULATE_PACKAGED: '1' }
    }));
    let probe = await waitForCompleteProbe(electronApp, { allowMissingClearCacheMs: true });
    await electronApp.close();

    // Actual measurement runs
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const launchOptions = buildStartupLaunchOptions({
        projectRoot, executablePath, userDataDir: profile.path,
        inheritedEnv: { ...process.env, DESKTOP_PET_SIMULATE_PACKAGED: '1' }
      });
      launchOptions.args.push(...extraArgs); // inject --clear-cache if needed

      electronApp = await electron.launch(launchOptions);
      try {
        probe = await waitForCompleteProbe(electronApp, { allowMissingClearCacheMs: true });
        runs.push({
          repetition,
          mode: modeName,
          processToWindowMs: probe.browserWindowCreatedAtMs - probe.probeStartedAtMs,
          windowToDidFinishLoadMs: probe.didFinishLoadAtMs - probe.browserWindowCreatedAtMs,
          clearCacheMs: probe.clearCacheMs,
        });
      } finally {
        await electronApp.close();
      }
    }
  } finally {
    profile.cleanup();
  }
  return runs;
}

async function main() {
  console.log('Measuring A (legacy clearCache) vs B (optimized hot start)...');

  // We alternate A and B to account for system load variations. Actually running them isolated is fine too.
  // We'll run A (with --clear-cache)
  const runsA = await runHotStartSequence({}, 'A (clearCache)', ['--clear-cache']);
  
  // We'll run B (without --clear-cache)
  const runsB = await runHotStartSequence({}, 'B (hot start)', []);

  const summarize = (runs) => {
    const w2d = runs.map(r => r.windowToDidFinishLoadMs);
    const cc = runs.map(r => r.clearCacheMs);
    return {
      windowToDidFinishLoadMs: {
        p50: nearestRank(w2d, 50),
      },
      clearCacheMs: {
        p50: nearestRank(cc, 50),
      }
    };
  };

  const summaryA = summarize(runsA);
  const summaryB = summarize(runsB);

  console.log('\n--- Results ---');
  console.log('Mode A (clearCache):');
  console.log(`  clearCacheMs P50: ${summaryA.clearCacheMs.p50.toFixed(2)} ms`);
  console.log(`  windowToDidFinishLoadMs P50: ${summaryA.windowToDidFinishLoadMs.p50.toFixed(2)} ms`);
  console.log('Mode B (hot start):');
  console.log(`  clearCacheMs P50: ${summaryB.clearCacheMs.p50.toFixed(2)} ms`);
  console.log(`  windowToDidFinishLoadMs P50: ${summaryB.windowToDidFinishLoadMs.p50.toFixed(2)} ms`);

  const diffMs = summaryA.windowToDidFinishLoadMs.p50 - summaryB.windowToDidFinishLoadMs.p50;
  const diffPct = (diffMs / summaryA.windowToDidFinishLoadMs.p50) * 100;
  console.log('\n--- Conclusion ---');
  console.log(`Improvement: ${diffMs.toFixed(2)} ms (${diffPct.toFixed(2)}%)`);
  
  if (diffMs >= 100 || diffPct >= 10) {
    console.log('✅ PASS: Improvement meets >= 10% or >= 100ms criteria.');
  } else {
    console.log('❌ FAIL: Improvement does not meet criteria.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

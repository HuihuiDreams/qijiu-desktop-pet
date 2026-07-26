const assert = require('node:assert/strict');
const test = require('node:test');

const { validateBaselineReport } = require('../tools/performance/validateBaseline');

function createReport(overrides = {}) {
  const scenarios = overrides.scenarios || ['idle', 'rain'];
  const repetitions = overrides.repetitions || 3;
  const runs = [];
  for (const scenario of scenarios) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      runs.push({
        scenario,
        repetition,
        renderer: {
          frameIntervalsMs: [16.7, 16.8],
          longTaskDurationsMs: [],
          domCount: 12,
          particleCount: scenario === 'rain' ? 20 : 0,
        },
        processSamples: [[{
          type: 'Browser', cpuPercent: 1, privateKiB: 100, workingSetKiB: 120,
        }]],
      });
    }
  }
  return {
    schemaVersion: 1,
    environment: {
      app: { name: 'DeskPet', version: '1.0.0', electron: '42.0.0' },
      os: { platform: 'win32', arch: 'x64', cpus: ['CPU'] },
      gpu: { gpuDevice: [] },
      buildType: 'dev',
      gpuDisabled: false,
      userDataDir: 'C:/temp/desktop-pet-performance',
      primaryDisplayId: 1,
      displays: [{ id: 1, refreshRate: 60 }],
    },
    config: {
      scenarios,
      warmupMs: 5000,
      sampleMs: 30000,
      repetitions,
      disableGpu: false,
      executablePath: 'C:/project/node_modules/electron/dist/electron.exe',
      effectiveRefreshRate: 60,
      refreshRateSource: 'primary-display',
      powerMode: 'balanced',
    },
    runs,
    summaries: {
      byScenario: Object.fromEntries(scenarios.map((scenario) => [scenario, {}])),
      overall: {},
    },
  };
}

test('accepts a complete formal baseline report', () => {
  assert.deepEqual(validateBaselineReport(createReport()), []);
});

test('rejects reports that do not meet the formal sampling protocol', () => {
  const report = createReport();
  report.schemaVersion = 2;
  report.config.warmupMs = 4999;
  report.config.sampleMs = 29999;
  report.config.repetitions = 2;

  const errors = validateBaselineReport(report);
  assert.match(errors.join('\n'), /schemaVersion/);
  assert.match(errors.join('\n'), /warmupMs/);
  assert.match(errors.join('\n'), /sampleMs/);
  assert.match(errors.join('\n'), /repetitions/);
});

test('rejects missing or duplicate scenario and repetition runs', () => {
  const report = createReport();
  report.runs = report.runs.filter((run) => !(run.scenario === 'rain' && run.repetition === 3));
  report.runs.push({ ...report.runs[0] });

  const errors = validateBaselineReport(report);
  assert.match(errors.join('\n'), /missing run rain#3/);
  assert.match(errors.join('\n'), /duplicate run idle#1/);
});

test('rejects incomplete raw renderer and process samples', () => {
  const report = createReport();
  report.runs[0].renderer.frameIntervalsMs = [];
  report.runs[0].renderer.domCount = -1;
  report.runs[0].renderer.particleCount = Number.NaN;
  report.runs[0].processSamples = [];

  const errors = validateBaselineReport(report);
  assert.match(errors.join('\n'), /frameIntervalsMs/);
  assert.match(errors.join('\n'), /domCount/);
  assert.match(errors.join('\n'), /particleCount/);
  assert.match(errors.join('\n'), /processSamples/);
});

test('rejects process samples without reviewable CPU and memory metrics', () => {
  const report = createReport();
  report.runs[0].processSamples = [[]];
  report.runs[1].processSamples = [{ type: 'Browser' }];
  report.runs[2].processSamples = [[{ cpuPercent: 1, privateKiB: 10 }]];

  const errors = validateBaselineReport(report);
  assert.match(errors.join('\n'), /runs\[0\]\.processSamples/);
  assert.match(errors.join('\n'), /runs\[1\]\.processSamples/);
  assert.match(errors.join('\n'), /runs\[2\]\.processSamples/);
});

test('rejects missing report metadata and scenario summaries', () => {
  const report = createReport();
  delete report.environment.buildType;
  delete report.environment.gpu;
  report.environment.userDataDir = '';
  report.config.effectiveRefreshRate = 0;
  delete report.config.refreshRateSource;
  delete report.summaries.byScenario.rain;

  const errors = validateBaselineReport(report);
  assert.match(errors.join('\n'), /environment.buildType/);
  assert.match(errors.join('\n'), /environment.gpu/);
  assert.match(errors.join('\n'), /environment.userDataDir/);
  assert.match(errors.join('\n'), /config.effectiveRefreshRate/);
  assert.match(errors.join('\n'), /config.refreshRateSource/);
  assert.match(errors.join('\n'), /summaries.byScenario.rain/);
});

test('rejects a report whose environment GPU mode differs from its configuration', () => {
  const report = createReport();
  report.environment.gpuDisabled = true;

  assert.match(validateBaselineReport(report).join('\n'), /gpuDisabled must match/);
});

test('accepts environment.gpu as null for environments that cannot provide it', () => {
  const report = createReport();
  report.environment.gpu = null;
  assert.deepEqual(validateBaselineReport(report), []);
});

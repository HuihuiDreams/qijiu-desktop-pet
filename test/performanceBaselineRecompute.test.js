const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { recomputeReport } = require('../tools/performance/recomputeBaseline');

function createReport() {
  return {
    environment: { buildType: 'dev', gpuDisabled: false },
    config: { effectiveRefreshRate: 60 },
    summaries: { byScenario: { idle: { frameIntervals: { p50Ms: 999 } } } },
    runs: [
      {
        scenario: 'idle', repetition: 1,
        renderer: { frameIntervalsMs: [10, 20, 30], longTaskDurationsMs: [49, 51] },
        processSamples: [[
          { type: 'Browser', cpuPercent: 1, privateKiB: 100, workingSetKiB: 200 },
          { type: 'Browser', cpuPercent: 2, privateKiB: 50, workingSetKiB: 60 },
        ], [
          { type: 'Browser', cpuPercent: 4, privateKiB: 120, workingSetKiB: 240 },
        ]],
      },
      {
        scenario: 'idle', repetition: 2,
        renderer: { frameIntervalsMs: [16, 17, 25], longTaskDurationsMs: [] },
        processSamples: [[{ type: 'Browser', cpuPercent: 8, privateKiB: 180, workingSetKiB: 300 }]],
      },
      {
        scenario: 'rain', repetition: 1,
        renderer: { frameIntervalsMs: [21, 22, 60], longTaskDurationsMs: [55] },
        processSamples: [[{ type: 'Browser', cpuPercent: 10, privateKiB: 200, workingSetKiB: 400 }]],
      },
      {
        scenario: 'rain', repetition: 2,
        renderer: { frameIntervalsMs: [18, 23, 24], longTaskDurationsMs: [60, 70] },
        processSamples: [[{ type: 'Browser', cpuPercent: 14, privateKiB: 220, workingSetKiB: 440 }]],
      },
    ],
  };
}

test('recomputeReport derives repetition and scenario summaries only from raw runs', () => {
  const result = recomputeReport(createReport(), 'baseline.json');
  const { idle, rain } = result.scenarios;

  assert.equal(result.source, 'baseline.json');
  assert.equal(result.buildType, 'dev');
  assert.equal(result.gpuDisabled, false);
  assert.equal(result.effectiveRefreshRate, 60);
  assert.equal(idle.repetitions[0].frame.p50Ms, 20);
  assert.equal(idle.repetitions[0].frame.overWarningCount, 1);
  assert.equal(idle.repetitions[0].frame.over20MsCount, 1);
  assert.equal(idle.repetitions[0].frame.over50MsCount, 0);
  assert.equal(idle.repetitions[0].longTaskCount, 2);
  assert.equal(idle.repetitions[0].processTotal.cpuPercentP50, 3);
  assert.equal(idle.aggregate.frame.p50Ms.median, 17);
  assert.deepEqual(idle.aggregate.frame.p50Ms.values, [20, 17]);
  assert.deepEqual(idle.aggregate.processTotal.cpuPercentP50, { values: [3, 8], median: 3, min: 3, max: 8 });
  assert.equal(rain.idleCpuComparison.absolutePercentagePoints, 7);
  assert.equal(rain.idleCpuComparison.relativePercent, 700 / 3);
});

test('CLI writes a JSON aggregate for each input file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-recompute-'));
  const reportPath = path.join(directory, 'baseline.json');
  fs.writeFileSync(reportPath, JSON.stringify(createReport()));
  const command = spawnSync(process.execPath, ['tools/performance/recomputeBaseline.js', reportPath], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
  });
  fs.rmSync(directory, { recursive: true, force: true });

  assert.equal(command.status, 0, command.stderr);
  const output = JSON.parse(command.stdout);
  assert.equal(output.sources.length, 1);
  assert.equal(output.sources[0].source, 'baseline.json');
  assert.equal(output.sources[0].scenarios.rain.idleCpuComparison.relativePercent, 700 / 3);
});

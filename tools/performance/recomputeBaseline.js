'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  percentile,
  summarizeFrameIntervals,
  summarizeLongTasks,
  summarizeProcessSamples,
} = require('./metrics');

const WEATHER_SCENARIOS = new Set(['rain', 'wind', 'heat', 'thunderstorm']);

function finiteValues(values) {
  return (Array.isArray(values) ? values : []).filter(Number.isFinite);
}

function aggregateValues(values) {
  const validValues = finiteValues(values);
  return {
    values: validValues,
    median: percentile(validValues, 0.5),
    min: validValues.length ? Math.min(...validValues) : null,
    max: validValues.length ? Math.max(...validValues) : null,
  };
}

function summarizeRun(run, refreshRateHz) {
  const renderer = run && run.renderer ? run.renderer : {};
  const frame = summarizeFrameIntervals(renderer.frameIntervalsMs, { refreshRateHz });
  const longTasks = summarizeLongTasks(renderer.longTaskDurationsMs);
  const processes = summarizeProcessSamples(run && run.processSamples);
  return {
    repetition: run && run.repetition,
    frame: {
      p50Ms: frame.p50Ms,
      p95Ms: frame.p95Ms,
      maxMs: frame.maxMs,
      overWarningCount: frame.overWarningCount,
      over20MsCount: frame.over20MsCount,
      over50MsCount: frame.over50MsCount,
    },
    longTaskCount: longTasks.count,
    processTotal: {
      cpuPercentP50: processes.total.cpuPercent.p50,
      privateKiBP50: processes.total.privateKiB.p50,
      workingSetKiBP50: processes.total.workingSetKiB.p50,
    },
  };
}

function aggregateScenario(repetitions) {
  const fields = {
    frame: ['p50Ms', 'p95Ms', 'maxMs', 'overWarningCount', 'over20MsCount', 'over50MsCount'],
    processTotal: ['cpuPercentP50', 'privateKiBP50', 'workingSetKiBP50'],
  };
  const aggregate = { frame: {}, longTaskCount: aggregateValues(repetitions.map((item) => item.longTaskCount)), processTotal: {} };
  for (const group of Object.keys(fields)) {
    for (const field of fields[group]) {
      aggregate[group][field] = aggregateValues(repetitions.map((item) => item[group][field]));
    }
  }
  return aggregate;
}

function recomputeReport(report, source) {
  if (!report || !Array.isArray(report.runs)) {
    throw new TypeError('Each input report must contain a runs array');
  }
  const refreshRate = Number.isFinite(report.config && report.config.effectiveRefreshRate)
    && report.config.effectiveRefreshRate > 0
    ? report.config.effectiveRefreshRate
    : 60;
  const scenarios = {};
  for (const run of report.runs) {
    if (!run || typeof run.scenario !== 'string' || !run.scenario) continue;
    const scenario = scenarios[run.scenario] || (scenarios[run.scenario] = { repetitions: [] });
    scenario.repetitions.push(summarizeRun(run, refreshRate));
  }
  for (const scenario of Object.values(scenarios)) {
    scenario.aggregate = aggregateScenario(scenario.repetitions);
  }
  const idleCpuMedian = scenarios.idle && scenarios.idle.aggregate.processTotal.cpuPercentP50.median;
  if (Number.isFinite(idleCpuMedian)) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      const cpuMedian = scenario.aggregate.processTotal.cpuPercentP50.median;
      if (!WEATHER_SCENARIOS.has(name) || !Number.isFinite(cpuMedian)) continue;
      const absolutePercentagePoints = cpuMedian - idleCpuMedian;
      scenario.idleCpuComparison = {
        absolutePercentagePoints,
        relativePercent: idleCpuMedian === 0 ? null : (absolutePercentagePoints / idleCpuMedian) * 100,
      };
    }
  }
  return {
    source: path.basename(source),
    buildType: report.environment && report.environment.buildType || null,
    gpuDisabled: report.environment && typeof report.environment.gpuDisabled === 'boolean'
      ? report.environment.gpuDisabled
      : null,
    effectiveRefreshRate: refreshRate,
    scenarios,
  };
}

function main(argv = process.argv.slice(2)) {
  if (!argv.length) throw new Error('Usage: node tools/performance/recomputeBaseline.js <json> [json...]');
  return {
    schemaVersion: 1,
    sources: argv.map((input) => recomputeReport(JSON.parse(fs.readFileSync(path.resolve(input), 'utf8')), input)),
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(main(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { aggregateValues, summarizeRun, aggregateScenario, recomputeReport, main };

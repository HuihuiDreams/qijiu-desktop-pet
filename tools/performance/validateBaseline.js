'use strict';

const fs = require('node:fs');
const path = require('node:path');

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function validateFormalConfig(config, errors) {
  if (!config || typeof config !== 'object') {
    errors.push('config must be an object');
    return [];
  }
  if (!Array.isArray(config.scenarios) || config.scenarios.length === 0
    || config.scenarios.some((scenario) => !isNonEmptyString(scenario))
    || new Set(config.scenarios).size !== config.scenarios.length) {
    errors.push('config.scenarios must be a non-empty unique string list');
  }
  if (!Number.isFinite(config.warmupMs) || config.warmupMs < 5000) errors.push('config.warmupMs must be at least 5000');
  if (!Number.isFinite(config.sampleMs) || config.sampleMs < 30000) errors.push('config.sampleMs must be at least 30000');
  if (!Number.isInteger(config.repetitions) || config.repetitions < 3) errors.push('config.repetitions must be at least 3');
  if (typeof config.disableGpu !== 'boolean') errors.push('config.disableGpu must be a boolean');
  if (!isNonEmptyString(config.executablePath)) errors.push('config.executablePath metadata is required');
  if (!Number.isFinite(config.effectiveRefreshRate) || config.effectiveRefreshRate <= 0) errors.push('config.effectiveRefreshRate metadata must be positive');
  if (!isNonEmptyString(config.refreshRateSource)) errors.push('config.refreshRateSource metadata is required');
  return Array.isArray(config.scenarios) ? config.scenarios : [];
}

function validateEnvironment(environment, errors) {
  if (!environment || typeof environment !== 'object') {
    errors.push('environment must be an object');
    return;
  }
  if (!isNonEmptyString(environment.buildType)) errors.push('environment.buildType metadata is required');
  if (typeof environment.gpuDisabled !== 'boolean') errors.push('environment.gpuDisabled metadata must be a boolean');
  if (!hasOwn(environment, 'gpu')) errors.push('environment.gpu metadata is required');
  if (!isNonEmptyString(environment.userDataDir)) errors.push('environment.userDataDir metadata is required');
}

function validateRun(run, index, scenarios, repetitions, errors, combinations) {
  const label = `runs[${index}]`;
  if (!run || typeof run !== 'object') {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!scenarios.includes(run.scenario)) errors.push(`${label}.scenario must be declared in config.scenarios`);
  if (!Number.isInteger(run.repetition) || run.repetition < 1 || run.repetition > repetitions) {
    errors.push(`${label}.repetition must be between 1 and config.repetitions`);
  } else if (scenarios.includes(run.scenario)) {
    const combination = `${run.scenario}#${run.repetition}`;
    if (combinations.has(combination)) errors.push(`duplicate run ${combination}`);
    combinations.add(combination);
  }

  const renderer = run.renderer;
  if (!renderer || typeof renderer !== 'object') {
    errors.push(`${label}.renderer must be an object`);
  } else {
    if (!Array.isArray(renderer.frameIntervalsMs) || renderer.frameIntervalsMs.length === 0
      || renderer.frameIntervalsMs.some((interval) => !Number.isFinite(interval) || interval < 0)) {
      errors.push(`${label}.renderer.frameIntervalsMs must contain finite non-negative values`);
    }
    if (!isFiniteNonNegative(renderer.domCount)) errors.push(`${label}.renderer.domCount must be finite and non-negative`);
    if (!isFiniteNonNegative(renderer.particleCount)) errors.push(`${label}.renderer.particleCount must be finite and non-negative`);
  }
  if (!Array.isArray(run.processSamples) || run.processSamples.length === 0) {
    errors.push(`${label}.processSamples must be non-empty`);
  } else if (!run.processSamples.every(Array.isArray)) {
    errors.push(`${label}.processSamples entries must be arrays`);
  } else {
    const processEntries = run.processSamples.flat();
    if (!processEntries.some((entry) => entry && Number.isFinite(entry.cpuPercent))) {
      errors.push(`${label}.processSamples must include a finite cpuPercent`);
    }
    if (!processEntries.some((entry) => entry && Number.isFinite(entry.privateKiB))) {
      errors.push(`${label}.processSamples must include a finite privateKiB`);
    }
    if (!processEntries.some((entry) => entry && Number.isFinite(entry.workingSetKiB))) {
      errors.push(`${label}.processSamples must include a finite workingSetKiB`);
    }
  }
}

function validateBaselineReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return ['report must be an object'];
  if (report.schemaVersion !== 1) errors.push('schemaVersion must be 1');

  const scenarios = validateFormalConfig(report.config, errors);
  validateEnvironment(report.environment, errors);
  if (report.config && report.environment
    && typeof report.config.disableGpu === 'boolean'
    && typeof report.environment.gpuDisabled === 'boolean'
    && report.config.disableGpu !== report.environment.gpuDisabled) {
    errors.push('environment.gpuDisabled must match config.disableGpu');
  }
  const repetitions = report.config && Number.isInteger(report.config.repetitions) ? report.config.repetitions : 0;
  const combinations = new Set();
  if (!Array.isArray(report.runs)) {
    errors.push('runs must be an array');
  } else {
    report.runs.forEach((run, index) => validateRun(run, index, scenarios, repetitions, errors, combinations));
  }
  for (const scenario of scenarios) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const combination = `${scenario}#${repetition}`;
      if (!combinations.has(combination)) errors.push(`missing run ${combination}`);
    }
  }

  if (!report.summaries || typeof report.summaries !== 'object' || !report.summaries.byScenario
    || typeof report.summaries.byScenario !== 'object') {
    errors.push('summaries.byScenario must be an object');
  } else {
    for (const scenario of scenarios) {
      if (!hasOwn(report.summaries.byScenario, scenario)) errors.push(`summaries.byScenario.${scenario} is required`);
    }
  }
  return errors;
}

function validateFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    return { filePath: resolvedPath, errors: [`cannot read valid JSON: ${error.message}`] };
  }
  return { filePath: resolvedPath, errors: validateBaselineReport(report) };
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    console.error('Usage: node tools/performance/validateBaseline.js <json> [json...]');
    process.exitCode = 1;
    return [];
  }
  const results = argv.map(validateFile);
  for (const result of results) {
    if (result.errors.length === 0) console.log(`OK ${result.filePath}`);
    else console.error(`ERROR ${result.filePath}: ${result.errors.join('; ')}`);
  }
  if (results.some((result) => result.errors.length > 0)) process.exitCode = 1;
  return results;
}

if (require.main === module) main();

module.exports = { validateBaselineReport, validateFile, main };

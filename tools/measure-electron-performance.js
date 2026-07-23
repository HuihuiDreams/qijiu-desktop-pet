const fs = require('node:fs');
const path = require('node:path');
const { runPerformanceMeasurement } = require('./performance/electronRunner');

const DEFAULTS = { scenarios: ['idle'], warmupMs: 5000, sampleMs: 30000, repetitions: 3, disableGpu: false, executable: null, profile: null, output: null, refreshRate: null, powerMode: null };

function positiveNumber(value, option) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${option} must be a positive finite number`);
  return number;
}

function positiveInteger(value, option) {
  const number = positiveNumber(value, option);
  if (!Number.isInteger(number)) throw new Error(`${option} must be a positive integer`);
  return number;
}

function parseArgs(argv) {
  const parsed = { ...DEFAULTS, scenarios: [...DEFAULTS.scenarios] };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help') return { ...parsed, help: true };
    if (option === '--disable-gpu') { parsed.disableGpu = true; continue; }
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
    if (option === '--scenarios') {
      parsed.scenarios = value.split(',').filter(Boolean);
      const { SCENARIO_NAMES } = require('./performance/scenarios');
      if (!parsed.scenarios.length || parsed.scenarios.some((name) => !SCENARIO_NAMES.includes(name))) throw new Error(`Unknown scenario: ${value}`);
    } else if (option === '--warmup-ms') parsed.warmupMs = positiveNumber(value, option);
    else if (option === '--sample-ms') parsed.sampleMs = positiveNumber(value, option);
    else if (option === '--repetitions') parsed.repetitions = positiveInteger(value, option);
    else if (option === '--refresh-rate') parsed.refreshRate = positiveNumber(value, option);
    else if (option === '--executable') parsed.executable = value;
    else if (option === '--profile') parsed.profile = value;
    else if (option === '--output') parsed.output = value;
    else if (option === '--power-mode') parsed.powerMode = value;
    else throw new Error(`Unknown option: ${option}`);
  }
  return parsed;
}

function usage() { return 'Usage: node tools/measure-electron-performance.js [--scenarios idle,rain] [--warmup-ms N] [--sample-ms N] [--repetitions N] [--disable-gpu] [--executable PATH] [--profile PATH] [--output PATH] [--refresh-rate N] [--power-mode LABEL]'; }

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage()); return null; }
  const result = await runPerformanceMeasurement(options);
  const json = JSON.stringify(result, null, 2);
  if (options.output) fs.writeFileSync(path.resolve(options.output), `${json}\n`);
  else console.log(json);
  return result;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { parseArgs, main };

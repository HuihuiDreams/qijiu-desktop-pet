const assert = require('node:assert/strict');
const test = require('node:test');

const { parseArgs } = require('../tools/measure-electron-performance');

test('parseArgs supplies reproducible measurement defaults', () => {
  assert.deepEqual(parseArgs([]), {
    scenarios: ['idle'],
    warmupMs: 5000,
    sampleMs: 30000,
    repetitions: 3,
    disableGpu: false,
    executable: null,
    profile: null,
    output: null,
    refreshRate: null,
    powerMode: null,
  });
});

test('parseArgs accepts known scenarios and explicit measurement options', () => {
  assert.deepEqual(
    parseArgs(['--scenarios', 'idle,rain', '--warmup-ms', '50', '--sample-ms', '100', '--repetitions', '2', '--disable-gpu', '--refresh-rate', '120']),
    {
      scenarios: ['idle', 'rain'], warmupMs: 50, sampleMs: 100, repetitions: 2,
      disableGpu: true, executable: null, profile: null, output: null, refreshRate: 120, powerMode: null,
    },
  );
});

test('parseArgs rejects an unknown scenario and non-positive numbers', () => {
  assert.throws(() => parseArgs(['--scenarios', 'storm']), /Unknown scenario/);
  assert.throws(() => parseArgs(['--sample-ms', '0']), /positive finite number/);
  assert.throws(() => parseArgs(['--repetitions', '1.5']), /positive integer/);
});

test('parseArgs preserves the optional power mode label', () => {
  assert.equal(parseArgs(['--power-mode', 'balanced']).powerMode, 'balanced');
  assert.equal(parseArgs([]).powerMode, null);
});

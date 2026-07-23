const assert = require('node:assert/strict');
const test = require('node:test');

const {
  percentile,
  summarizeSeries,
  summarizeFrameIntervals,
  summarizeLongTasks,
  summarizeProcessSamples,
} = require('../tools/performance/metrics');

test('percentile uses nearest-rank and ignores non-finite values', () => {
  assert.equal(percentile([4, Infinity, 1, Number.NaN, 3, 2], 0.5), 2);
  assert.equal(percentile([4, 1, 3, 2], 0.95), 4);
  assert.equal(percentile([], 0.5), null);
});

test('summarizeSeries reports finite-value percentiles', () => {
  assert.deepEqual(summarizeSeries([1, '2', 2, Number.NaN, 4, Infinity]), {
    count: 3,
    p50: 2,
    p95: 4,
    max: 4,
  });
});

test('summarizeFrameIntervals reports frame budgets and threshold breaches', () => {
  assert.deepEqual(summarizeFrameIntervals([10, 21, 22, 17, 25, 60, 'bad'], {
    refreshRateHz: 60,
  }), {
    count: 6,
    p50Ms: 21,
    p95Ms: 60,
    maxMs: 60,
    budgetMs: 1000 / 60,
    warningThresholdMs: 20,
    overWarningCount: 4,
    over20MsCount: 4,
    over50MsCount: 1,
    longestConsecutiveOverWarning: 2,
  });
});

test('summarizeLongTasks counts durations above 50ms and ignores invalid data', () => {
  assert.deepEqual(summarizeLongTasks([49, 50, 51, Infinity, null]), {
    count: 3,
    p50: 50,
    p95: 51,
    max: 51,
    over50: 1,
  });
});

test('summarizeProcessSamples aggregates each type within a sampling point', () => {
  assert.deepEqual(summarizeProcessSamples([
    [
      { type: 'Browser', cpuPercent: 2, privateKiB: 100, workingSetKiB: 200 },
      { type: 'Browser', cpuPercent: 3, privateKiB: 50, workingSetKiB: 60 },
      { type: 'GPU', cpuPercent: 1, privateKiB: 20, workingSetKiB: 30 },
    ],
    [
      { type: 'Browser', cpuPercent: 4, privateKiB: 120, workingSetKiB: 240 },
      { type: 'GPU', cpuPercent: Number.NaN, privateKiB: 25, workingSetKiB: 35 },
      { type: '', cpuPercent: 99, privateKiB: 99, workingSetKiB: 99 },
    ],
  ]), {
    byType: {
      Browser: {
        cpuPercent: { count: 2, p50: 4, p95: 5, max: 5 },
        privateKiB: { count: 2, p50: 120, p95: 150, max: 150 },
        workingSetKiB: { count: 2, p50: 240, p95: 260, max: 260 },
      },
      GPU: {
        cpuPercent: { count: 1, p50: 1, p95: 1, max: 1 },
        privateKiB: { count: 2, p50: 20, p95: 25, max: 25 },
        workingSetKiB: { count: 2, p50: 30, p95: 35, max: 35 },
      },
    },
    total: {
      cpuPercent: { count: 2, p50: 4, p95: 6, max: 6 },
      privateKiB: { count: 2, p50: 145, p95: 170, max: 170 },
      workingSetKiB: { count: 2, p50: 275, p95: 290, max: 290 },
    },
  });
});

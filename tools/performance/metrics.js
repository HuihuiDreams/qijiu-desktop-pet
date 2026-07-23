function finiteValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter(Number.isFinite);
}

function percentile(values, rank) {
  const sorted = finiteValues(values).sort((left, right) => left - right);
  if (sorted.length === 0 || !Number.isFinite(rank) || rank < 0 || rank > 1) {
    return null;
  }

  return sorted[Math.max(0, Math.ceil(rank * sorted.length) - 1)];
}

function summarizeSeries(values) {
  const validValues = finiteValues(values);
  return {
    count: validValues.length,
    p50: percentile(validValues, 0.5),
    p95: percentile(validValues, 0.95),
    max: validValues.length === 0 ? null : Math.max(...validValues),
  };
}

function summarizeFrameIntervals(intervals, { refreshRateHz } = {}) {
  const validIntervals = finiteValues(intervals);
  const validRefreshRate = Number.isFinite(refreshRateHz) && refreshRateHz > 0
    ? refreshRateHz
    : 60;
  const budgetMs = 1000 / validRefreshRate;
  const warningThresholdMs = budgetMs * 1.2;
  let longestConsecutiveOverWarning = 0;
  let currentConsecutiveOverWarning = 0;

  for (const interval of validIntervals) {
    if (interval > warningThresholdMs) {
      currentConsecutiveOverWarning += 1;
      longestConsecutiveOverWarning = Math.max(
        longestConsecutiveOverWarning,
        currentConsecutiveOverWarning,
      );
    } else {
      currentConsecutiveOverWarning = 0;
    }
  }

  return {
    count: validIntervals.length,
    p50Ms: percentile(validIntervals, 0.5),
    p95Ms: percentile(validIntervals, 0.95),
    maxMs: validIntervals.length === 0 ? null : Math.max(...validIntervals),
    budgetMs,
    warningThresholdMs,
    overWarningCount: validIntervals.filter((interval) => interval > warningThresholdMs).length,
    over20MsCount: validIntervals.filter((interval) => interval > 20).length,
    over50MsCount: validIntervals.filter((interval) => interval > 50).length,
    longestConsecutiveOverWarning,
  };
}

function summarizeLongTasks(durations) {
  const summary = summarizeSeries(durations);
  return {
    ...summary,
    over50: finiteValues(durations).filter((duration) => duration > 50).length,
  };
}

function addMetric(target, key, value) {
  if (Number.isFinite(value)) {
    target[key] = (target[key] || 0) + value;
  }
}

function createMetricTotals() {
  return {
    cpuPercent: null,
    privateKiB: null,
    workingSetKiB: null,
  };
}

function summarizeMetrics(metricSeries) {
  return {
    cpuPercent: summarizeSeries(metricSeries.cpuPercent),
    privateKiB: summarizeSeries(metricSeries.privateKiB),
    workingSetKiB: summarizeSeries(metricSeries.workingSetKiB),
  };
}

function summarizeProcessSamples(samples) {
  const byTypeSeries = {};
  const totalSeries = {
    cpuPercent: [],
    privateKiB: [],
    workingSetKiB: [],
  };

  for (const samplePoint of Array.isArray(samples) ? samples : []) {
    const totalsByType = {};
    const total = createMetricTotals();

    for (const sample of Array.isArray(samplePoint) ? samplePoint : []) {
      if (!sample || typeof sample.type !== 'string' || sample.type.length === 0) {
        continue;
      }

      const typeTotal = totalsByType[sample.type] || (totalsByType[sample.type] = createMetricTotals());
      for (const key of Object.keys(total)) {
        if (Number.isFinite(sample[key])) {
          addMetric(typeTotal, key, sample[key]);
          addMetric(total, key, sample[key]);
        }
      }
    }

    for (const [type, typeTotal] of Object.entries(totalsByType)) {
      const typeSeries = byTypeSeries[type] || (byTypeSeries[type] = {
        cpuPercent: [],
        privateKiB: [],
        workingSetKiB: [],
      });
      for (const key of Object.keys(typeTotal)) {
        if (Number.isFinite(typeTotal[key])) {
          typeSeries[key].push(typeTotal[key]);
        }
      }
    }

    for (const key of Object.keys(total)) {
      if (Number.isFinite(total[key])) {
        totalSeries[key].push(total[key]);
      }
    }
  }

  const byType = {};
  for (const [type, metricSeries] of Object.entries(byTypeSeries)) {
    byType[type] = summarizeMetrics(metricSeries);
  }

  return {
    byType,
    total: summarizeMetrics(totalSeries),
  };
}

module.exports = {
  percentile,
  summarizeSeries,
  summarizeFrameIntervals,
  summarizeLongTasks,
  summarizeProcessSamples,
};

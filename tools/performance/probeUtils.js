async function waitForCompleteProbe(electronApp, { timeoutMs = 30000, waitFn, allowMissingClearCacheMs = false } = {}) {
  const defaultWaitFn = waitFn || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const probe = await electronApp.evaluate(({ app }) => app.__DESKPET_STARTUP_PROBE || null);
    if (probe && Number.isFinite(probe.didFinishLoadAtMs)) {
      if (allowMissingClearCacheMs && probe.clearCacheMs === null) {
        probe.clearCacheMs = 0; // skipped cache clear
      }
      if (Number.isFinite(probe.clearCacheMs)) {
        return probe;
      }
    }
    await defaultWaitFn(25);
  }
  throw new Error('Timed out waiting for the startup probe to complete');
}

module.exports = {
  waitForCompleteProbe,
};

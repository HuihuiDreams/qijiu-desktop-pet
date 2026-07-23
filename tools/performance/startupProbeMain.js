const { performance } = require('node:perf_hooks');
const { app } = require('electron');

const probe = {
  probeStartedAtMs: performance.now(),
  browserWindowCreatedAtMs: null,
  didFinishLoadAtMs: null,
  clearCacheMs: null,
};

app.__DESKPET_STARTUP_PROBE = probe;

app.on('browser-window-created', (_event, window) => {
  if (probe.browserWindowCreatedAtMs !== null) return;

  probe.browserWindowCreatedAtMs = performance.now();
  const session = window.webContents.session;
  const clearCache = session.clearCache.bind(session);
  session.clearCache = async (...args) => {
    const startedAtMs = performance.now();
    try {
      return await clearCache(...args);
    } finally {
      probe.clearCacheMs = performance.now() - startedAtMs;
    }
  };

  window.webContents.once('did-finish-load', () => {
    probe.didFinishLoadAtMs = performance.now();
    app.__DESKPET_STARTUP_PROBE = probe;
  });
});

require('../../main');

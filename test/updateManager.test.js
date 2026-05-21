const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { classifyUpdateError, createUpdateManager } = require('../updateManager');

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createHarness(options = {}) {
  const updater = new EventEmitter();
  const messages = [];
  const logErrors = [];
  const mainWindow = options.mainWindow || null;
  let refreshCount = 0;

  updater.checkForUpdates = options.checkForUpdates
    ? () => options.checkForUpdates(updater)
    : async () => {
        updater.checked = true;
      };
  updater.downloadUpdate = options.downloadUpdate
    ? () => options.downloadUpdate(updater)
    : async () => {
        updater.downloaded = true;
      };
  updater.quitAndInstall = (...args) => {
    updater.quitAndInstallArgs = args;
  };

  const manager = createUpdateManager({
    getAutoUpdater: () => updater,
    getLog: () => ({
      error: (...args) => logErrors.push(args),
    }),
  });

  const responses = [...(options.responses || [])];
  manager.initUpdateManager({
    app: options.app || { isPackaged: options.isPackaged ?? true },
    dialog: {
      showMessageBox: async (messageOptions) => {
        messages.push(messageOptions);
        return responses.shift() || { response: 0 };
      },
    },
    getMainWindow: () => mainWindow,
    refreshTrayMenu: () => {
      refreshCount += 1;
    },
    t: options.t,
  });

  return {
    manager,
    updater,
    messages,
    logErrors,
    getRefreshCount: () => refreshCount,
  };
}

test('init configures electron-updater for manual downloads', () => {
  const { updater } = createHarness();

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.ok(updater.logger);
});

test('development mode shows a friendly message and does not check for updates', async () => {
  const { manager, updater, messages } = createHarness({ isPackaged: false });

  await manager.checkForUpdatesFromTray();

  assert.equal(updater.checked, undefined);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].title, 'updateDevTitle');
});

test('update-available asks before downloading', async () => {
  const { updater, messages } = createHarness({
    responses: [{ response: 0 }],
  });

  updater.emit('update-available', { version: '0.1.8' });
  await tick();

  assert.equal(messages[0].title, 'updateAvailTitle');
  assert.equal(updater.downloaded, true);
});

test('update-available respects a user cancel', async () => {
  const { updater, messages } = createHarness({
    responses: [{ response: 1 }],
  });

  updater.emit('update-available', { version: '0.1.8' });
  await tick();

  assert.equal(messages[0].title, 'updateAvailTitle');
  assert.equal(updater.downloaded, undefined);
});

test('update-not-available shows the current version as latest', async () => {
  const { updater, messages } = createHarness({
    app: {
      isPackaged: true,
      getVersion: () => '0.1.8',
    },
  });

  updater.emit('update-not-available');
  await tick();

  assert.equal(messages[0].title, 'updateNotAvailTitle');
  assert.equal(messages[0].message, 'updateNotAvailMsg'.replace('{version}', '0.1.8'));
});

test('metadata not found while checking is treated as no update available', async () => {
  const { manager, messages, logErrors } = createHarness({
    app: {
      isPackaged: true,
      getVersion: () => '0.1.8',
    },
    checkForUpdates: async () => {
      throw Object.assign(new Error('Cannot find latest.yml, 404'), { statusCode: 404 });
    },
  });

  await manager.checkForUpdatesFromTray();

  assert.equal(logErrors.length, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].title, 'updateNotAvailTitle');
  assert.equal(messages[0].message, 'updateNotAvailMsg'.replace('{version}', '0.1.8'));
  assert.equal(manager._getState().error, null);
});

test('metadata not found only shows the latest-version message once', async () => {
  const notFoundError = Object.assign(new Error('Cannot find latest.yml, 404'), { statusCode: 404 });
  const { manager, messages, logErrors } = createHarness({
    app: {
      isPackaged: true,
      getVersion: () => '0.1.8',
    },
    checkForUpdates: async (updater) => {
      updater.emit('error', notFoundError);
      throw notFoundError;
    },
  });

  await manager.checkForUpdatesFromTray();
  await tick();

  assert.equal(logErrors.length, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].title, 'updateNotAvailTitle');
});

test('update-downloaded asks before quit and install', async () => {
  const { updater, messages } = createHarness({
    responses: [{ response: 0 }],
  });

  updater.emit('update-downloaded', { version: '0.1.8' });
  await tick();

  assert.equal(messages[0].title, 'updateReadyTitle');
  assert.deepEqual(updater.quitAndInstallArgs, [false, true]);
});

test('download-progress updates the main window progress when available', async () => {
  const progressValues = [];
  const { updater } = createHarness({
    mainWindow: {
      isDestroyed: () => false,
      setProgressBar: (value) => progressValues.push(value),
    },
  });

  updater.emit('download-progress', { percent: 42 });
  await tick();

  assert.deepEqual(progressValues, [0.42]);
});

test('error event records log details and exposes a user-safe message', async () => {
  const { manager, updater, messages, logErrors } = createHarness();

  updater.emit('error', { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' });
  await tick();

  assert.equal(logErrors.length, 1);
  assert.equal(messages[0].title, 'updateErrTitle');
  assert.equal(
    manager._getState().error,
    'updateErrNetwork',
  );
});

test('error event classifies nested updater network failures', async () => {
  const { manager, updater, messages, logErrors } = createHarness();
  const error = new Error('更新请求失败');
  error.cause = new Error('net::ERR_INTERNET_DISCONNECTED');

  updater.emit('error', error);
  await tick();

  assert.equal(logErrors.length, 1);
  assert.equal(
    messages[0].message,
    'updateErrNetwork',
  );
  assert.match(messages[0].detail, /更新请求失败/);
  assert.equal(
    manager._getState().error,
    'updateErrNetwork',
  );
});

test('download failures show a specific reason and keep full logs', async () => {
  const downloadError = new Error('Cannot download installer');
  downloadError.response = { statusCode: 404 };
  const { manager, updater, messages, logErrors } = createHarness({
    responses: [{ response: 0 }],
    downloadUpdate: async () => {
      throw downloadError;
    },
  });

  updater.emit('update-available', { version: '0.1.9' });
  await tick();
  await tick();

  assert.equal(logErrors.length, 1);
  assert.equal(messages.at(-1).title, 'updateErrTitle');
  assert.equal(messages.at(-1).message, 'updateErrServer');
  assert.equal(messages.at(-1).detail, 'updateErrDetailPrefixCannot download installer');
  assert.equal(manager._getState().error, 'updateErrServer');
});

test('classifyUpdateError covers common updater failures', () => {
  assert.equal(
    classifyUpdateError({ statusCode: 404 }),
    'updateErrServer',
  );
  assert.equal(
    classifyUpdateError({ code: 'ECONNRESET' }),
    'updateErrDownload',
  );
  assert.equal(
    classifyUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED')),
    'updateErrNetwork',
  );
  assert.equal(
    classifyUpdateError({ cause: { code: 'ETIMEDOUT' } }),
    'updateErrDownload',
  );
  assert.equal(
    classifyUpdateError(new Error('boom')),
    'updateErrGeneric',
  );
});

test('update manager applies injected translations and version interpolation', async () => {
  const translations = {
    updateNotAvailTitle: 'Up to date',
    updateNotAvailMsg: 'Version {version} is current.',
    updateBtnOk: 'OK',
  };
  const { updater, messages } = createHarness({
    app: {
      isPackaged: true,
      getVersion: () => '0.2.7',
    },
    t: (key) => translations[key] || key,
  });

  updater.emit('update-not-available');
  await tick();

  assert.equal(messages[0].title, 'Up to date');
  assert.equal(messages[0].message, 'Version 0.2.7 is current.');
  assert.deepEqual(messages[0].buttons, ['OK']);
});

test('update manager applies injected translations to error detail prefixes', async () => {
  const translations = {
    updateErrTitle: 'Update failed',
    updateErrServer: 'Server unavailable.',
    updateErrDetailPrefix: 'Reason: ',
    updateBtnOk: 'OK',
  };
  const { updater, messages } = createHarness({
    t: (key) => translations[key] || key,
  });

  updater.emit('error', Object.assign(new Error('Cannot download installer'), { statusCode: 404 }));
  await tick();

  assert.equal(messages[0].title, 'Update failed');
  assert.equal(messages[0].message, 'Server unavailable.');
  assert.equal(messages[0].detail, 'Reason: Cannot download installer');
  assert.deepEqual(messages[0].buttons, ['OK']);
});

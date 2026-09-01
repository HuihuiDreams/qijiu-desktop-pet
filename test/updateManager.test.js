const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const test = require('node:test');

const {
  classifyUpdateError,
  createMacManualUpdateManager,
  createUpdateManager,
  verifyDownloadedPackageIntegrity,
} = require('../updateManager');

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createVerifiedDownloadInfo(metadata = {}) {
  const crypto = require('node:crypto');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-verified-update-'));
  const downloadedFile = path.join(tmpDir, 'installer.bin');
  const contents = 'verified-update-package';
  fs.writeFileSync(downloadedFile, contents);
  return {
    info: {
      ...metadata,
      downloadedFile,
      sha512: crypto.createHash('sha512').update(contents).digest('base64'),
    },
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function createHarness(options = {}) {
  const updater = new EventEmitter();
  const messages = [];
  const logErrors = [];
  const progressEvents = [];
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
    updateProgressUi: {
      showChecking: (payload) => progressEvents.push(['checking', payload]),
      showDownloading: (payload) => progressEvents.push(['downloading', payload]),
      setProgress: (percent) => progressEvents.push(['progress', percent]),
      close: () => progressEvents.push(['close']),
    },
    t: options.t,
  });

  return {
    manager,
    updater,
    messages,
    logErrors,
    progressEvents,
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
  const { updater, messages, progressEvents } = createHarness({
    responses: [{ response: 0 }],
  });

  updater.emit('update-available', { version: '0.1.8' });
  await tick();

  assert.equal(messages[0].title, 'updateAvailTitle');
  assert.equal(updater.downloaded, true);
  assert.deepEqual(progressEvents, [
    ['close'],
    ['downloading', {
      title: 'Downloading Update',
      message: 'updateDownloadingMsg',
      percent: 0,
    }],
  ]);
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

test('manual update check opens a visible checking progress window', async () => {
  const { manager, progressEvents } = createHarness();

  await manager.checkForUpdatesFromTray();

  assert.equal(progressEvents[0][0], 'checking');
  assert.equal(progressEvents[0][1].title, 'Checking for Updates');
});

test('manual update check requires initialization', async () => {
  const manager = createUpdateManager({
    getAutoUpdater: () => new EventEmitter(),
    getLog: () => ({ error() {} }),
  });

  await assert.rejects(
    () => manager.checkForUpdatesFromTray(),
    /Update manager is not initialized/,
  );
});

test('manual update check reports an in-progress checking state', async () => {
  const { manager, updater, messages } = createHarness();

  updater.emit('checking-for-update');
  await manager.checkForUpdatesFromTray();

  assert.equal(messages[0].title, 'updateInProgressTitle');
  assert.equal(messages[0].message, 'updateCheckingMsg');
  assert.equal(manager.getUpdateMenuState().enabled, false);
});

test('manual update check reports an in-progress downloading state', async () => {
  const { manager, updater, messages } = createHarness();

  updater.emit('download-progress', { percent: 10 });
  await manager.checkForUpdatesFromTray();

  assert.equal(messages[0].title, 'updateInProgressTitle');
  assert.equal(messages[0].message, 'updateDownloadingMsg');
  assert.equal(manager.getUpdateMenuState().enabled, false);
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
  const verifiedDownload = createVerifiedDownloadInfo({ version: '0.1.8' });
  const { updater, messages, progressEvents } = createHarness({
    responses: [{ response: 0 }],
  });

  try {
    updater.emit('update-downloaded', verifiedDownload.info);
    await tick();

    assert.equal(messages[0].title, 'updateReadyTitle');
    assert.deepEqual(updater.quitAndInstallArgs, [false, true]);
    assert.equal(progressEvents[0][0], 'close');
  } finally {
    verifiedDownload.cleanup();
  }
});

test('update-downloaded respects a user cancel', async () => {
  const verifiedDownload = createVerifiedDownloadInfo({ releaseName: '0.1.8' });
  const { updater, messages } = createHarness({
    responses: [{ response: 1 }],
  });

  try {
    updater.emit('update-downloaded', verifiedDownload.info);
    await tick();

    assert.equal(messages[0].message, 'updateReadyMsg'.replace('{version}', '0.1.8'));
    assert.equal(updater.quitAndInstallArgs, undefined);
  } finally {
    verifiedDownload.cleanup();
  }
});

test('update-available uses no-version copy when metadata has no version', async () => {
  const { updater, messages } = createHarness({
    responses: [{ response: 1 }],
  });

  updater.emit('update-available', {});
  await tick();

  assert.equal(messages[0].message, 'updateAvailMsgNoVer');
});

test('download-progress updates the main window progress when available', async () => {
  const progressValues = [];
  const { updater, progressEvents } = createHarness({
    mainWindow: {
      isDestroyed: () => false,
      setProgressBar: (value) => progressValues.push(value),
    },
  });

  updater.emit('download-progress', { percent: 42 });
  await tick();

  assert.deepEqual(progressValues, [0.42]);
  assert.deepEqual(progressEvents, [['progress', 42]]);
});

test('download-progress skips destroyed main windows but still updates progress UI', async () => {
  const progressValues = [];
  const { updater, progressEvents } = createHarness({
    mainWindow: {
      isDestroyed: () => true,
      setProgressBar: (value) => progressValues.push(value),
    },
  });

  updater.emit('download-progress', { percent: 65 });
  await tick();

  assert.deepEqual(progressValues, []);
  assert.deepEqual(progressEvents, [['progress', 65]]);
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

test('verifyDownloadedPackageIntegrity verifies base64 and hex sha512 (SBP-001)', () => {
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const crypto = require('node:crypto');

  const tmpFile = path.join(os.tmpdir(), 'deskpet-test-update.bin');
  fs.writeFileSync(tmpFile, 'deskpet-secure-update-content');
  const hashBase64 = crypto.createHash('sha512').update('deskpet-secure-update-content').digest('base64');
  const hashHex = crypto.createHash('sha512').update('deskpet-secure-update-content').digest('hex');
  const badHash = 'badhash';

  assert.equal(verifyDownloadedPackageIntegrity({ downloadedFile: tmpFile, sha512: hashBase64 }), true);
  assert.equal(verifyDownloadedPackageIntegrity({ downloadedFile: tmpFile, sha512: hashHex }), true);
  assert.equal(verifyDownloadedPackageIntegrity({ downloadedFile: tmpFile, sha512: badHash }), false);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('verifyDownloadedPackageIntegrity fails closed for missing or unreadable metadata', () => {
  const path = require('node:path');
  const os = require('node:os');

  assert.equal(verifyDownloadedPackageIntegrity(null), false);
  assert.equal(verifyDownloadedPackageIntegrity({}), false);
  assert.equal(verifyDownloadedPackageIntegrity({ downloadedFile: 'installer.exe' }), false);
  assert.equal(verifyDownloadedPackageIntegrity({ downloadedFile: 'installer.exe', sha512: 123 }), false);
  assert.equal(verifyDownloadedPackageIntegrity({ sha512: 'abc' }), false);
  assert.equal(verifyDownloadedPackageIntegrity({
    downloadedFile: path.join(os.tmpdir(), 'deskpet-update-does-not-exist.bin'),
    sha512: 'abc',
  }), false);
});

test('update-downloaded refuses a package when checksum metadata is missing', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-update-no-hash-'));
  const tmpFile = path.join(tmpDir, 'installer.bin');
  fs.writeFileSync(tmpFile, 'unverified-update');

  try {
    const { updater, manager } = createHarness();
    updater.emit('update-downloaded', { downloadedFile: tmpFile });
    await tick();

    assert.equal(manager.getUpdateMenuState().error, 'integrity-check-failed');
    assert.equal(updater.quitAndInstallArgs, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('update-downloaded intercepts corrupted package integrity (SBP-001)', async () => {
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');

  const tmpFile = path.join(os.tmpdir(), 'deskpet-corrupt-update.bin');
  fs.writeFileSync(tmpFile, 'deskpet-corrupt-content');

  const { updater, manager, messages } = createHarness();
  updater.emit('update-downloaded', { downloadedFile: tmpFile, sha512: 'invalid-hash' });
  await tick();

  assert.equal(manager.getUpdateMenuState().error, 'integrity-check-failed');
  assert.equal(messages.length, 0);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('mac manual update opens the release page when a newer version is accepted', async () => {
  const originalFetch = global.fetch;
  const originalLoad = Module._load;
  const messages = [];
  const progressEvents = [];
  const openedUrls = [];

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { tag_name: 'v0.2.0' };
    },
  });
  Module._load = function(request) {
    if (request === 'electron') {
      return {
        shell: {
          openExternal(url) {
            openedUrls.push(url);
          },
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const manager = createMacManualUpdateManager();
    manager.initUpdateManager({
      app: {
        isPackaged: true,
        getVersion: () => '0.1.0',
      },
      dialog: {
        showMessageBox: async (options) => {
          messages.push(options);
          return { response: 0 };
        },
      },
      updateProgressUi: {
        showChecking: (payload) => progressEvents.push(['checking', payload]),
        close: () => progressEvents.push(['close']),
      },
      t: (key) => ({
        updateMacManualTitle: 'Manual update',
        updateMacManualMsg: 'Download and replace the app.',
        updateMacManualBtn: 'Open releases',
        updateBtnLater: 'Later',
      })[key] || key,
    });

    await manager.checkForUpdatesFromTray();

    assert.equal(messages[0].title, 'Manual update');
    assert.match(messages[0].message, /0\.1\.0/);
    assert.match(messages[0].message, /0\.2\.0/);
    assert.deepEqual(openedUrls, ['https://github.com/HuihuiDreams/qijiu-desktop-pet/releases/latest']);
    assert.deepEqual(progressEvents.map(([name]) => name), ['checking', 'close']);
  } finally {
    global.fetch = originalFetch;
    Module._load = originalLoad;
  }
});

test('mac manual update reports current version when no newer release exists', async () => {
  const originalFetch = global.fetch;
  const messages = [];

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { tag_name: 'v0.1.0' };
    },
  });

  try {
    const manager = createMacManualUpdateManager();
    manager.initUpdateManager({
      app: {
        isPackaged: true,
        getVersion: () => '0.1.0',
      },
      dialog: {
        showMessageBox: async (options) => {
          messages.push(options);
          return { response: 0 };
        },
      },
      t: (key) => ({
        updateNotAvailTitle: 'Up to date',
        updateNotAvailMsg: 'Version {version} is current.',
        updateBtnOk: 'OK',
      })[key] || key,
    });

    await manager.checkForUpdatesFromTray();

    assert.equal(messages[0].title, 'Up to date');
    assert.equal(messages[0].message, 'Version 0.1.0 is current.');
    assert.deepEqual(messages[0].buttons, ['OK']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('mac manual update surfaces fetch errors and closes progress', async () => {
  const originalFetch = global.fetch;
  const messages = [];
  const progressEvents = [];

  global.fetch = async () => ({
    ok: false,
    status: 503,
  });

  try {
    const manager = createMacManualUpdateManager();
    manager.initUpdateManager({
      app: {
        isPackaged: true,
        getVersion: () => '0.1.0',
      },
      dialog: {
        showMessageBox: async (options) => {
          messages.push(options);
          return { response: 0 };
        },
      },
      updateProgressUi: {
        showChecking: (payload) => progressEvents.push(['checking', payload]),
        close: () => progressEvents.push(['close']),
      },
      t: (key) => ({
        updateErrTitle: 'Update failed',
        updateErrServer: 'Server unavailable.',
        updateErrGeneric: 'Could not check for updates.',
        updateErrDetailPrefix: 'Reason: ',
        updateBtnOk: 'OK',
      })[key] || key,
    });

    await manager.checkForUpdatesFromTray();

    assert.equal(messages[0].title, 'Update failed');
    assert.equal(messages[0].message, 'Could not check for updates.');
    assert.match(messages[0].detail, /GitHub API error: 503/);
    assert.equal(manager.getUpdateMenuState().checking, false);
    assert.deepEqual(progressEvents.map(([name]) => name), ['checking', 'close']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('mac manual update aborts timed-out requests and allows retrying', async () => {
  const messages = [];
  const progressEvents = [];
  let attempts = 0;
  let aborts = 0;
  const manager = createUpdateManager({
    isMac: true,
    macCheckTimeoutMs: 10,
    fetchImpl: (_url, { signal }) => {
      attempts += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborts += 1;
          const error = new Error('The update request was aborted.');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });
  manager.initUpdateManager({
    app: {
      isPackaged: true,
      getVersion: () => '0.1.0',
    },
    dialog: {
      showMessageBox: async (options) => {
        messages.push(options);
        return { response: 0 };
      },
    },
    refreshTrayMenu: () => {},
    updateProgressUi: {
      showChecking: (payload) => progressEvents.push(['checking', payload]),
      close: () => progressEvents.push(['close']),
    },
    t: (key) => ({
      updateErrTitle: 'Update failed',
      updateErrDownload: 'Download timed out.',
      updateErrDetailPrefix: 'Reason: ',
      updateBtnOk: 'OK',
    })[key] || key,
  });

  await manager.checkForUpdatesFromTray();

  assert.equal(attempts, 1);
  assert.equal(aborts, 1);
  assert.equal(manager.getUpdateMenuState().checking, false);
  assert.equal(manager.getUpdateMenuState().enabled, true);
  assert.equal(manager.getUpdateMenuState().error, 'Download timed out.');
  assert.equal(messages[0].message, 'Download timed out.');
  assert.deepEqual(progressEvents.map(([name]) => name), ['checking', 'close']);

  await manager.checkForUpdatesFromTray();

  assert.equal(attempts, 2);
  assert.equal(aborts, 2);
  assert.equal(manager.getUpdateMenuState().checking, false);
  assert.deepEqual(progressEvents.map(([name]) => name), [
    'checking',
    'close',
    'checking',
    'close',
  ]);
});

test('mac manual update clears its timeout after a normal response', async () => {
  let requestSignal = null;
  const manager = createUpdateManager({
    isMac: true,
    macCheckTimeoutMs: 20,
    fetchImpl: async (_url, { signal }) => {
      requestSignal = signal;
      return {
        ok: true,
        async json() {
          return { tag_name: 'v0.1.0' };
        },
      };
    },
  });
  manager.initUpdateManager({
    app: {
      isPackaged: true,
      getVersion: () => '0.1.0',
    },
    dialog: {
      showMessageBox: () => new Promise((resolve) => {
        setTimeout(() => resolve({ response: 0 }), 30);
      }),
    },
  });

  await manager.checkForUpdatesFromTray();

  assert.ok(requestSignal);
  assert.equal(requestSignal.aborted, false);
});

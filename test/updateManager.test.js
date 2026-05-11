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
  updater.downloadUpdate = async () => {
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
  assert.equal(messages[0].title, '开发模式');
});

test('update-available asks before downloading', async () => {
  const { updater, messages } = createHarness({
    responses: [{ response: 0 }],
  });

  updater.emit('update-available', { version: '0.1.8' });
  await tick();

  assert.equal(messages[0].title, '发现新版本');
  assert.equal(updater.downloaded, true);
});

test('update-available respects a user cancel', async () => {
  const { updater, messages } = createHarness({
    responses: [{ response: 1 }],
  });

  updater.emit('update-available', { version: '0.1.8' });
  await tick();

  assert.equal(messages[0].title, '发现新版本');
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

  assert.equal(messages[0].title, '已是最新版本');
  assert.equal(messages[0].message, '当前版本 0.1.8 已是最新版本。');
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
  assert.equal(messages[0].title, '已是最新版本');
  assert.equal(messages[0].message, '当前版本 0.1.8 已是最新版本。');
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
  assert.equal(messages[0].title, '已是最新版本');
});

test('update-downloaded asks before quit and install', async () => {
  const { updater, messages } = createHarness({
    responses: [{ response: 0 }],
  });

  updater.emit('update-downloaded', { version: '0.1.8' });
  await tick();

  assert.equal(messages[0].title, '更新已下载');
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
  assert.equal(messages[0].title, '更新失败');
  assert.equal(manager._getState().error, '检查更新失败，请确认网络连接后重试。');
});

test('classifyUpdateError covers common updater failures', () => {
  assert.equal(
    classifyUpdateError({ statusCode: 404 }),
    '更新服务器暂时不可用，请稍后再试。',
  );
  assert.equal(
    classifyUpdateError({ code: 'ECONNRESET' }),
    '更新下载中断，请稍后重试。',
  );
  assert.equal(
    classifyUpdateError(new Error('boom')),
    '检查更新失败，详细原因已写入日志。',
  );
});

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const SERVICE_PATH = require.resolve('../src/main/services/FinalSaveService');

function createIpcMain() {
  const listeners = new Map();
  return {
    on(channel, listener) {
      listeners.set(channel, [...(listeners.get(channel) || []), listener]);
    },
    removeListener(channel, listener) {
      listeners.set(channel, (listeners.get(channel) || []).filter((candidate) => candidate !== listener));
    },
    emit(channel, ...args) {
      for (const listener of [...(listeners.get(channel) || [])]) {
        listener(...args);
      }
    },
    listenerCount(channel) {
      return (listeners.get(channel) || []).length;
    },
  };
}

function loadFreshService(ipcMain) {
  const originalLoad = Module._load;
  delete require.cache[SERVICE_PATH];

  Module._load = function loadElectron(request, parent, isMain) {
    if (request === 'electron' && parent?.filename === SERVICE_PATH) {
      return { ipcMain };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // eslint-disable-next-line global-require
    return require('../src/main/services/FinalSaveService');
  } finally {
    Module._load = originalLoad;
  }
}

function createWindow() {
  const sent = [];
  const listeners = {};
  const webContents = {
    isDestroyed: () => false,
    send: (channel, ...args) => sent.push([channel, ...args]),
  };
  const win = {
    isDestroyed: () => false,
    webContents,
    on: (channel, listener) => { listeners[channel] = listener; },
    closeCalls: 0,
    close() {
      this.closeCalls += 1;
      listeners.close?.({ preventDefault: () => { throw new Error('final close must not be prevented'); } });
    },
  };
  return { win, webContents, sent, listeners };
}

test('requestRendererFinalSave accepts only the matching renderer acknowledgement and cleans up its listener', async () => {
  const ipcMain = createIpcMain();
  const Service = loadFreshService(ipcMain);
  const { win, webContents, sent } = createWindow();

  const saveResult = Service.requestRendererFinalSave(win);
  assert.deepEqual(sent, [['save-before-quit', 1]]);
  assert.equal(ipcMain.listenerCount('save-before-quit-complete'), 1);

  ipcMain.emit('save-before-quit-complete', { sender: {} }, 1, true);
  ipcMain.emit('save-before-quit-complete', { sender: webContents }, 99, true);
  assert.equal(ipcMain.listenerCount('save-before-quit-complete'), 1);

  ipcMain.emit('save-before-quit-complete', { sender: webContents }, 1, true);
  assert.equal(await saveResult, true);
  assert.equal(ipcMain.listenerCount('save-before-quit-complete'), 0);
});

test('requestRendererFinalSave resolves false and cleans up when the renderer does not acknowledge in time', async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutCallback;
  const clearedTimeouts = [];
  global.setTimeout = (callback) => {
    timeoutCallback = callback;
    return 'final-save-timeout';
  };
  global.clearTimeout = (timeout) => { clearedTimeouts.push(timeout); };

  try {
    const ipcMain = createIpcMain();
    const Service = loadFreshService(ipcMain);
    const { win, sent } = createWindow();
    const saveResult = Service.requestRendererFinalSave(win);

    assert.deepEqual(sent, [['save-before-quit', 1]]);
    timeoutCallback();

    assert.equal(await saveResult, false);
    assert.deepEqual(clearedTimeouts, ['final-save-timeout']);
    assert.equal(ipcMain.listenerCount('save-before-quit-complete'), 0);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('installFinalSaveBeforeClose blocks duplicate close events, then closes once after the renderer acknowledges', async () => {
  const ipcMain = createIpcMain();
  const Service = loadFreshService(ipcMain);
  const { win, webContents, sent, listeners } = createWindow();
  let preventedCloseEvents = 0;
  const closeEvent = { preventDefault: () => { preventedCloseEvents += 1; } };

  Service.installFinalSaveBeforeClose(win);
  listeners.close(closeEvent);
  listeners.close(closeEvent);

  assert.equal(preventedCloseEvents, 2);
  assert.deepEqual(sent, [['save-before-quit', 1]]);

  ipcMain.emit('save-before-quit-complete', { sender: webContents }, 1, true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(win.closeCalls, 1);
  assert.equal(ipcMain.listenerCount('save-before-quit-complete'), 0);
});

test('requestRendererFinalSave resolves false without messaging a destroyed window', async () => {
  const ipcMain = createIpcMain();
  const Service = loadFreshService(ipcMain);
  const { win, sent } = createWindow();
  win.isDestroyed = () => true;

  assert.equal(await Service.requestRendererFinalSave(win), false);
  assert.deepEqual(sent, []);
  assert.equal(ipcMain.listenerCount('save-before-quit-complete'), 0);
});

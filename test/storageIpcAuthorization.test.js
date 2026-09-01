const assert = require('node:assert/strict');
const test = require('node:test');
const { setupElectronMock } = require('./helpers/mockElectron');

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
}

test('StorageIpc only allows the live main window to read or mutate settings', async () => {
  const ipcMain = createIpcMain();
  const mainSender = { isDestroyed: () => false };
  const windowManager = {
    mainWindow: {
      isDestroyed: () => false,
      webContents: mainSender,
    },
  };
  const storedValues = new Map();

  const StoreManager = require('../src/main/services/StoreManager');
  const AutoLaunchService = require('../src/main/services/AutoLaunchService');
  const originals = {
    initStore: StoreManager.initStore,
    getStore: StoreManager.getStore,
    setAutoLaunchPreference: AutoLaunchService.setAutoLaunchPreference,
    getAutoLaunchPreference: AutoLaunchService.getAutoLaunchPreference,
  };

  StoreManager.initStore = async () => {};
  StoreManager.getStore = () => ({
    get: (key) => storedValues.get(key),
    set: (key, value) => storedValues.set(key, value),
  });
  AutoLaunchService.setAutoLaunchPreference = async (enabled) => ({ success: true, preference: enabled });
  AutoLaunchService.getAutoLaunchPreference = async () => ({ success: true, preference: true });

  const modulePath = require.resolve('../src/main/services/StorageIpc');
  delete require.cache[modulePath];
  const restoreElectron = setupElectronMock({ ipcMain });

  try {
    const StorageIpc = require(modulePath);
    restoreElectron();
    StorageIpc.init({ windowManager });

    const foreignEvent = { sender: { isDestroyed: () => false } };
    const mainEvent = { sender: mainSender };

    assert.equal(await ipcMain.handlers.get('save-data')(foreignEvent, 'petState', { compromised: true }), false);
    assert.equal(storedValues.has('petState'), false);
    assert.equal(await ipcMain.handlers.get('load-data')(foreignEvent, 'petState'), null);
    assert.deepEqual(await ipcMain.handlers.get('set-auto-launch')(foreignEvent, true), {
      success: false,
      preference: false,
      loginItem: { openAtLogin: false },
    });
    assert.deepEqual(await ipcMain.handlers.get('get-auto-launch')(foreignEvent), {
      success: false,
      preference: false,
      loginItem: { openAtLogin: false },
    });

    assert.equal(await ipcMain.handlers.get('save-data')(mainEvent, 'petState', { safe: true }), true);
    assert.deepEqual(await ipcMain.handlers.get('load-data')(mainEvent, 'petState'), { safe: true });
  } finally {
    restoreElectron();
    StoreManager.initStore = originals.initStore;
    StoreManager.getStore = originals.getStore;
    AutoLaunchService.setAutoLaunchPreference = originals.setAutoLaunchPreference;
    AutoLaunchService.getAutoLaunchPreference = originals.getAutoLaunchPreference;
    delete require.cache[modulePath];
  }
});

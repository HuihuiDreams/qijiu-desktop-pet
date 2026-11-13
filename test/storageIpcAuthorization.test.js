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

    // Test confirmedSkinId enforcement
    delete require.cache[modulePath];
    const restoreElectronAgain = setupElectronMock({ ipcMain });
    const StorageIpcWithConfirmed = require(modulePath);
    restoreElectronAgain();
    StorageIpcWithConfirmed.init({
      windowManager,
      getConfirmedSkinId: () => 'default',
    });
    assert.equal(
      await ipcMain.handlers.get('save-data')(mainEvent, 'petState', { skinId: 'unconfirmed_preview', safe: true }),
      true
    );
    assert.equal(storedValues.get('petState').skinId, 'default', 'petState skinId must be clamped to confirmed skin');
  } finally {
    restoreElectron();
    StoreManager.initStore = originals.initStore;
    StoreManager.getStore = originals.getStore;
    AutoLaunchService.setAutoLaunchPreference = originals.setAutoLaunchPreference;
    AutoLaunchService.getAutoLaunchPreference = originals.getAutoLaunchPreference;
    delete require.cache[modulePath];
  }
});

test('startup skin restore keeps the saved skin when save-data arrives before the renderer applies it', async () => {
  const ipcMain = createIpcMain();
  const mainSender = { isDestroyed: () => false };
  const windowManager = {
    mainWindow: {
      isDestroyed: () => false,
      webContents: mainSender,
    },
  };
  const storedValues = new Map();
  const store = {
    get: (key) => storedValues.get(key),
    set: (key, value) => storedValues.set(key, value),
  };

  const StoreManager = require('../src/main/services/StoreManager');
  const originals = { initStore: StoreManager.initStore, getStore: StoreManager.getStore };
  StoreManager.initStore = async () => {};
  StoreManager.getStore = () => store;

  const storageIpcPath = require.resolve('../src/main/services/StorageIpc');
  const skinServicePath = require.resolve('../src/main/services/SkinService');
  delete require.cache[storageIpcPath];
  delete require.cache[skinServicePath];
  const restoreElectron = setupElectronMock({ ipcMain, app: { getAppPath: () => __dirname } });
  let savedSkinId;
  let SkinService;

  try {
    const StorageIpc = require(storageIpcPath);
    SkinService = require(skinServicePath);
    restoreElectron();

    // 不同分支可用的皮肤不同（CP 分支只有 default），所以取扫描到的第一个非默认皮肤；
    // 没有时借用 QA 额外皮肤入口（仅部分分支提供）。
    SkinService.setQaExtraSkinId?.('qa-restored-skin');
    savedSkinId = SkinService.scanAvailableSkins(true).find((id) => id !== 'default');
    assert.ok(savedSkinId, 'a non-default skin must be available to exercise the restore');
    storedValues.set('petState', { skinId: savedSkinId, hunger: 80 });

    SkinService.restoreConfirmedSkinFromStore(store);
    StorageIpc.init({ windowManager, getConfirmedSkinId: SkinService.getConfirmedSkinId });

    // 离线结算触发的首次保存：渲染进程的 SkinManager 此时仍是 default。
    const saved = await ipcMain.handlers.get('save-data')(
      { sender: mainSender },
      'petState',
      { skinId: 'default', hunger: 40 },
    );

    assert.equal(saved, true);
    assert.equal(storedValues.get('petState').skinId, savedSkinId, 'saved skin must survive the first save before applySkinById');
    assert.equal(storedValues.get('petState').hunger, 40, 'other petState fields must still be saved');
  } finally {
    SkinService?.setQaExtraSkinId?.(null);
    restoreElectron();
    StoreManager.initStore = originals.initStore;
    StoreManager.getStore = originals.getStore;
    delete require.cache[storageIpcPath];
    delete require.cache[skinServicePath];
  }
});

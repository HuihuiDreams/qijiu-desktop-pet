'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const { createIntegrationHarness } = require('./harness/createIntegrationHarness');
const { LOCALE_KEY } = require('../../src/main/constants');

const STORAGE_IPC_PATH = require.resolve('../../src/main/services/StorageIpc');
const STORE_MANAGER_PATH = require.resolve('../../src/main/services/StoreManager');
const AUTO_LAUNCH_PATH = require.resolve('../../src/main/services/AutoLaunchService');

function loadStorageIntegration(harness, options = {}) {
  const originalLoad = Module._load;

  delete require.cache[STORAGE_IPC_PATH];
  delete require.cache[STORE_MANAGER_PATH];
  delete require.cache[AUTO_LAUNCH_PATH];

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        ipcMain: harness.ipcMain,
        app: {
          setLoginItemSettings: () => {},
          getLoginItemSettings: () => ({ openAtLogin: false }),
        },
      };
    }
    if (request === './StoreManager' || request === '../services/StoreManager') {
      return harness.StoreManager;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const StorageIpc = require('../../src/main/services/StorageIpc');
    StorageIpc.init({
      windowManager: harness.windowManager,
      getConfirmedSkinId: options.getConfirmedSkinId || (() => 'default'),
    });
    return { StorageIpc };
  } finally {
    Module._load = originalLoad;
  }
}

test('Integration: StorageIpc security whitelist, Store persistence, and skin protection', async (t) => {
  const harness = createIntegrationHarness({
    [LOCALE_KEY]: 'zh-CN',
  });

  loadStorageIntegration(harness, {
    getConfirmedSkinId: () => 'confirmed_special_skin',
  });

  await t.test('1. Whitelisted keys can be saved and loaded by mainWindow', async () => {
    // Read pre-existing locale
    const locale = await harness.ipcMain.invoke('load-data', harness.mainWindow, LOCALE_KEY);
    assert.equal(locale, 'zh-CN');

    // Save petState
    const saveSuccess = await harness.ipcMain.invoke('save-data', harness.mainWindow, 'petState', {
      hunger: 80,
      favorability: 95,
      skinId: 'tampered_skin', // Attempting to tamper skin
    });
    assert.equal(saveSuccess, true);

    // Verify persisted in store
    const persisted = harness.store.get('petState');
    assert.equal(persisted.hunger, 80);
    assert.equal(persisted.favorability, 95);
    // CRITICAL: StorageIpc must enforce getConfirmedSkinId(), preventing tampered skinId
    assert.equal(persisted.skinId, 'confirmed_special_skin');

    // Read back via load-data
    const loaded = await harness.ipcMain.invoke('load-data', harness.mainWindow, 'petState');
    assert.deepEqual(loaded, persisted);
  });

  await t.test('2. Non-whitelisted keys are rejected to protect internal settings', async () => {
    // Attempt to tamper screensaverSettings or weatherSyncSettings via save-data
    const saveBlocked1 = await harness.ipcMain.invoke('save-data', harness.mainWindow, 'screensaverSettings', { enabled: true });
    assert.equal(saveBlocked1, false, 'Internal screensaverSettings must be rejected');

    const saveBlocked2 = await harness.ipcMain.invoke('save-data', harness.mainWindow, 'weatherSyncSettings', { city: 'Hacked' });
    assert.equal(saveBlocked2, false, 'Internal weatherSyncSettings must be rejected');

    const loadBlocked = await harness.ipcMain.invoke('load-data', harness.mainWindow, 'screensaverSettings');
    assert.equal(loadBlocked, null);
  });

  await t.test('3. Non-mainWindow senders are completely blocked from reading or writing', async () => {
    const subWindow = harness.createMockWindow(3);

    const saveBlocked = await harness.ipcMain.invoke('save-data', subWindow, LOCALE_KEY, 'en-US');
    assert.equal(saveBlocked, false);
    assert.equal(harness.store.get(LOCALE_KEY), 'zh-CN', 'Store must not be mutated by foreign window');

    const loadBlocked = await harness.ipcMain.invoke('load-data', subWindow, LOCALE_KEY);
    assert.equal(loadBlocked, null);
  });
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const { createIntegrationHarness } = require('./harness/createIntegrationHarness');

const SKIN_SERVICE_PATH = require.resolve('../../src/main/services/SkinService');
const SKIN_SELECTOR_WINDOW_PATH = require.resolve('../../src/main/windows/SkinSelectorWindow');

function loadSkinLifecycleIntegration(harness) {
  const originalLoad = Module._load;

  delete require.cache[SKIN_SERVICE_PATH];
  delete require.cache[SKIN_SELECTOR_WINDOW_PATH];

  class TestBrowserWindow {
    constructor(options) {
      const win = harness.createMockWindow(20, options);
      Object.assign(this, win);
      this.close = () => {
        win.close();
      };
    }
  }

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserWindow: TestBrowserWindow,
        app: {
          getAppPath: () => process.cwd(),
        },
        screen: {
          getCursorScreenPoint: () => ({ x: 0, y: 0 }),
          getDisplayNearestPoint: () => ({
            workArea: { x: 0, y: 0, width: 1920, height: 1080 },
          }),
        },
        ipcMain: harness.ipcMain,
      };
    }
    if (request === './WindowManager' && parent?.filename === SKIN_SELECTOR_WINDOW_PATH) {
      return harness.windowManager;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const SkinService = require('../../src/main/services/SkinService');
    const SkinSelectorWindow = require('../../src/main/windows/SkinSelectorWindow');

    SkinService.init({
      windowManager: harness.windowManager,
      skinSelectorWindowModule: SkinSelectorWindow,
      trayManager: {
        refreshTrayMenu: () => {},
        trayT: (k) => k,
      },
      StoreManager: harness.StoreManager,
      sendPomodoroState: () => {},
      cancelScreensaverSession: () => {},
    });

    SkinSelectorWindow.init({
      selectSkin: SkinService.selectSkin,
      getCurrentSkinId: SkinService.getCurrentSkinId,
      getSkinGalleryItems: SkinService.getSkinGalleryItems,
      revertSkinPreview: SkinService.revertSkinPreview,
    });

    return {
      SkinService,
      SkinSelectorWindow,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('Integration: Skin preview-confirm state machine, Store synchronization, and authorization', async (t) => {
  const harness = createIntegrationHarness({
    petState: {
      hunger: 90,
      skinId: 'default',
    },
  });

  const { SkinService, SkinSelectorWindow } = loadSkinLifecycleIntegration(harness);

  // Open skin selector window to establish valid sender
  const selectorWin = SkinSelectorWindow.openSkinSelectorWindow();
  assert.equal(harness.windowManager.skinSelectorWindow, selectorWin);
  assert.equal(SkinSelectorWindow.getSkinSelectorOriginalSkinId(), 'default');

  await t.test('1. Unauthorized window cannot access skin selector IPC', async () => {
    const foreignWin = harness.createMockWindow(999);
    const result = await harness.ipcMain.invoke('preview-skin', foreignWin, 'birds');
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'FORBIDDEN');
  });

  await t.test('2. Previewing a skin sends switch-skin event to pet but does NOT mutate Store', async () => {
    harness.mainWindow.webContents.clearSentMessages();

    const previewRes = await harness.ipcMain.invoke('preview-skin', selectorWin, 'birds');
    assert.equal(previewRes.success, true);
    assert.equal(previewRes.data.skinId, 'birds');

    // Pet main window receives preview switch-skin
    const switchMsg = harness.mainWindow.webContents.getLastMessage('switch-skin');
    assert.ok(switchMsg);
    assert.equal(switchMsg.args[0], 'birds');
    assert.equal(switchMsg.args[1].isPreview, true);

    // CRITICAL: Store petState must still be default
    const storedState = harness.store.get('petState');
    assert.equal(storedState.skinId, 'default', 'Preview must not commit to Store');
  });

  await t.test('3. Confirming skin commits to Store and broadcasts persisted switch-skin', async () => {
    // Renderer reports that birds loaded successfully
    await harness.ipcMain.invoke('report-skin-loaded', harness.mainWindow, 'birds', {
      success: true,
      requestId: switchSkinRequestId(harness),
    });

    harness.mainWindow.webContents.clearSentMessages();

    // Confirm skin from selector window
    const confirmRes = await harness.ipcMain.invoke('confirm-skin', selectorWin);
    assert.equal(confirmRes.success, true);
    assert.equal(confirmRes.data.skinId, 'birds');

    // Store is now committed
    const storedState = harness.store.get('petState');
    assert.equal(storedState.skinId, 'birds', 'Confirm must commit skinId to Store');

    // Broadcasts persisted switch-skin event
    const finalMsg = harness.mainWindow.webContents.getLastMessage('switch-skin');
    assert.ok(finalMsg);
    assert.equal(finalMsg.args[0], 'birds');
    assert.equal(finalMsg.args[1].persist, true);
    assert.equal(finalMsg.args[1].isPreview, false);
  });

  await t.test('4. Canceling preview restores previous confirmed skin and destroys window', async () => {
    // Reopen skin selector window for a new session
    const reopenedWin = SkinSelectorWindow.openSkinSelectorWindow();
    assert.equal(harness.windowManager.skinSelectorWindow, reopenedWin);
    assert.equal(SkinSelectorWindow.getSkinSelectorOriginalSkinId(), 'birds');
    harness.mainWindow.webContents.clearSentMessages();

    // Now preview 'default' while confirmed is 'birds'
    const previewRes = await harness.ipcMain.invoke('preview-skin', reopenedWin, 'default');
    assert.equal(previewRes.success, true);
    assert.equal(harness.mainWindow.webContents.getLastMessage('switch-skin').args[0], 'default');

    // Cancel skin selection
    const cancelRes = await harness.ipcMain.invoke('cancel-skin', reopenedWin);
    assert.equal(cancelRes.success, true);

    // Reverted back to 'birds' on mainWindow
    const revertMsg = harness.mainWindow.webContents.getLastMessage('switch-skin');
    assert.ok(revertMsg);
    assert.equal(revertMsg.args[0], 'birds');

    // Store remains 'birds'
    assert.equal(harness.store.get('petState').skinId, 'birds');

    // Window must be closed, destroyed, and unregistered from windowManager
    assert.equal(reopenedWin.isDestroyed(), true);
    assert.equal(reopenedWin.webContents.isDestroyed(), true);
    assert.equal(harness.windowManager.skinSelectorWindow, null);
  });
});

function switchSkinRequestId(harness) {
  const switchMsg = harness.mainWindow.webContents.getLastMessage('switch-skin');
  return switchMsg?.args[1]?.requestId;
}

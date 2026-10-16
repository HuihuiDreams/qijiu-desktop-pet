'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const { createIntegrationHarness } = require('./harness/createIntegrationHarness');
const { PET_SCALE_STORE_KEY } = require('../../src/main/constants');
const {
  PET_SCALE_DEFAULT_PERCENT,
  PET_SCALE_MIN_PERCENT,
  PET_SCALE_MAX_PERCENT,
  PET_SCALE_STEP_PERCENT,
} = require('../../ipcContracts');

const PET_SCALE_WINDOW_PATH = require.resolve('../../src/main/windows/PetScaleWindow');
const PET_SCALE_SERVICE_PATH = require.resolve('../../src/main/services/PetScaleService');

/**
 * Loads PetScaleWindow and PetScaleService wired together to the harness.
 */
function loadPetScaleIntegration(harness) {
  const originalLoad = Module._load;

  delete require.cache[PET_SCALE_WINDOW_PATH];
  delete require.cache[PET_SCALE_SERVICE_PATH];

  class TestBrowserWindow {
    constructor(options) {
      const win = harness.createMockWindow(2, options);
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
        screen: {
          getCursorScreenPoint: () => ({ x: 100, y: 100 }),
          getDisplayNearestPoint: () => ({
            workArea: { x: 0, y: 0, width: 1920, height: 1080 },
          }),
        },
        ipcMain: harness.ipcMain,
      };
    }
    if (request === './WindowManager' && parent?.filename === PET_SCALE_WINDOW_PATH) {
      return harness.windowManager;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const PetScaleService = require('../../src/main/services/PetScaleService');
    const PetScaleWindow = require('../../src/main/windows/PetScaleWindow');

    PetScaleService.init({
      windowManager: harness.windowManager,
      StoreManager: harness.StoreManager,
      ipcMain: harness.ipcMain,
    });

    PetScaleWindow.init();

    return {
      PetScaleService,
      PetScaleWindow,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('Integration: PetScale lifecycle, preview, cancel, and persistence', async (t) => {
  const harness = createIntegrationHarness({
    [PET_SCALE_STORE_KEY]: 110,
  });

  const { PetScaleService, PetScaleWindow } = loadPetScaleIntegration(harness);

  await t.test('1. Initial state reads persisted value from Store and verifies IPC security', async () => {
    // Authorized call from mainWindow
    const scaleFromMain = await harness.ipcMain.invoke('get-pet-scale', harness.mainWindow);
    assert.equal(scaleFromMain, 110, 'Main window should retrieve persisted scale of 110%');

    // Unauthorized call from unknown sender
    const unauthorizedSender = harness.createMockWindow(999);
    const unauthorizedResult = await harness.ipcMain.invoke('get-pet-scale', unauthorizedSender);
    assert.equal(unauthorizedResult, null, 'Unauthorized window must be blocked by IpcSenderAuthorization');
  });

  await t.test('2. Opening PetScale window registers window and returns scale settings', async () => {
    const scaleWin = PetScaleWindow.openPetScaleWindow();
    assert.ok(scaleWin, 'PetScale window must be created');
    assert.equal(harness.windowManager.petScaleWindow, scaleWin);

    // Call pet-scale-get-settings from petScaleWindow
    const settings = await harness.ipcMain.invoke('pet-scale-get-settings', scaleWin);
    assert.deepEqual(settings, {
      currentPercent: 110,
      defaultPercent: PET_SCALE_DEFAULT_PERCENT,
      minPercent: PET_SCALE_MIN_PERCENT,
      maxPercent: PET_SCALE_MAX_PERCENT,
      stepPercent: PET_SCALE_STEP_PERCENT,
    });

    // Calling settings from unauthorized window is rejected
    const blockedSettings = await harness.ipcMain.invoke('pet-scale-get-settings', harness.mainWindow);
    assert.equal(blockedSettings, null, 'Settings query must only be accessible to PetScaleWindow');
  });

  await t.test('3. Previewing scale broadcasts pet-scale-changed but does NOT persist to Store', async () => {
    const scaleWin = harness.windowManager.petScaleWindow;
    harness.mainWindow.webContents.clearSentMessages();

    // User previews 80%
    const previewResult = await harness.ipcMain.invoke('pet-scale-preview', scaleWin, 80);
    assert.equal(previewResult, 80);

    // Broadcast must be received by mainWindow
    const lastBroadcast = harness.mainWindow.webContents.getLastMessage('pet-scale-changed');
    assert.ok(lastBroadcast, 'MainWindow must receive pet-scale-changed event');
    assert.equal(lastBroadcast.args[0], 80);

    // CRITICAL: Store must still retain committed value 110, not 80
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 110, 'Preview must NOT write to Store');
    assert.equal(PetScaleService.getCommittedPercent(), 110);
    assert.equal(PetScaleService.getPreviewPercent(), 80);

    // Querying settings while previewing returns the active preview percent so reloading stays in sync
    const previewSettings = await harness.ipcMain.invoke('pet-scale-get-settings', scaleWin);
    assert.equal(previewSettings.currentPercent, 80);
  });

  await t.test('4. Canceling reverts pet scale to committed value and destroys window', async () => {
    const scaleWin = harness.windowManager.petScaleWindow;
    harness.mainWindow.webContents.clearSentMessages();

    const cancelResult = await harness.ipcMain.invoke('pet-scale-cancel', scaleWin);
    assert.deepEqual(cancelResult, { success: true });

    // MainWindow must receive revert broadcast back to 110%
    const revertBroadcast = harness.mainWindow.webContents.getLastMessage('pet-scale-changed');
    assert.ok(revertBroadcast);
    assert.equal(revertBroadcast.args[0], 110);

    // Store is unchanged
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 110);

    // Window must be closed / destroyed
    assert.equal(scaleWin.isDestroyed(), true);
  });

  await t.test('5. Reopening, previewing and confirming commits to Store and closes window', async () => {
    const scaleWin = PetScaleWindow.openPetScaleWindow();
    harness.mainWindow.webContents.clearSentMessages();

    // Preview 125%
    await harness.ipcMain.invoke('pet-scale-preview', scaleWin, 125);
    assert.equal(harness.mainWindow.webContents.getLastMessage('pet-scale-changed').args[0], 125);
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 110);

    // Confirm 125%
    const confirmResult = await harness.ipcMain.invoke('pet-scale-confirm', scaleWin);
    assert.deepEqual(confirmResult, { success: true, percent: 125 });

    // Store MUST be updated to 125
    assert.equal(harness.store.get(PET_SCALE_STORE_KEY), 125, 'Confirm must commit new value to Store');
    assert.equal(PetScaleService.getCommittedPercent(), 125);

    // Window is closed
    assert.equal(scaleWin.isDestroyed(), true);

    // Subsequent query from MainWindow returns updated 125%
    const updatedScale = await harness.ipcMain.invoke('get-pet-scale', harness.mainWindow);
    assert.equal(updatedScale, 125);
  });
});

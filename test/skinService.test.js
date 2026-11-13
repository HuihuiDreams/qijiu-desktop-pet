const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let mockIpcHandlers = {};
let mockTrayTranslations = {};
let mockPomodoroSent = false;
let mockTrayRefreshed = false;
let mockScreensaverCancelled = false;
let mockWindowSent = null;

const mockIpcMain = {
  handle: (channel, handler) => {
    mockIpcHandlers[channel] = handler;
  }
};

const mockApp = {
  getAppPath: () => __dirname
};

const mockElectron = {
  ipcMain: mockIpcMain,
  app: mockApp
};

const { setupElectronMock } = require('./helpers/mockElectron');
const restoreRequire = setupElectronMock(mockElectron);

const SkinService = require('../src/main/services/SkinService');
test.after(() => restoreRequire());

const mockSkinSelectorWindow = {
  destroyed: false,
  isDestroyed: () => mockSkinSelectorWindow.destroyed,
  webContents: { id: 999 },
  originalSkinId: null,
  getSkinSelectorOriginalSkinId: () => mockSkinSelectorWindow.originalSkinId,
  setSkinSelectorOriginalSkinId: (val) => { mockSkinSelectorWindow.originalSkinId = val; },
  setSkinSelectorSelectionInProgress: () => {},
  closeSkinSelectorWindow: () => {}
};

const mockMainWindow = {
  destroyed: false,
  isDestroyed: () => mockMainWindow.destroyed,
  webContents: {
    isDestroyed: () => false,
    send: (channel, data, options) => {
      mockWindowSent = { channel, data, options };
    }
  }
};

function createMockDeps() {
  return {
    // Synthetic multi-skin fixture IDs retained to cover preview/confirm/rollback state machine
    availableSkins: ['default', 'birds', 'animal_ears', 'school_au'],
    trayManager: {
      refreshTrayMenu: () => { mockTrayRefreshed = true; },
      trayT: (key) => mockTrayTranslations[key] || key
    },
    sendPomodoroState: () => { mockPomodoroSent = true; },
    cancelScreensaverSession: (reason) => { mockScreensaverCancelled = true; },
    windowManager: {
      mainWindow: mockMainWindow,
      skinSelectorWindow: mockSkinSelectorWindow
    },
    skinSelectorWindowModule: mockSkinSelectorWindow
  };
}

test('SkinService - Initialization and IPC Handlers', async (t) => {
  t.beforeEach(() => {
    mockIpcHandlers = {};
    mockPomodoroSent = false;
    mockTrayRefreshed = false;
    mockScreensaverCancelled = false;
    mockWindowSent = null;
    mockSkinSelectorWindow.originalSkinId = null;
    SkinService.setCurrentSkinId('default');
  });

  await t.test('init registers ipc handlers', () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    assert.ok(mockIpcHandlers['get-available-skins']);
    assert.ok(mockIpcHandlers['get-available-overlay-keys']);
    assert.ok(mockIpcHandlers['get-skin-gallery-items']);
    assert.ok(mockIpcHandlers['set-current-skin']);
    assert.ok(mockIpcHandlers['preview-skin']);
    assert.ok(mockIpcHandlers['confirm-skin']);
    assert.ok(mockIpcHandlers['cancel-skin']);
    assert.ok(mockIpcHandlers['close-skin-selector']);
  });

  await t.test('get-available-skins handler', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['get-available-skins']({ sender: mockMainWindow.webContents });
    assert.ok(Array.isArray(result));
  });

  await t.test('get-available-overlay-keys handler', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['get-available-overlay-keys']({ sender: mockMainWindow.webContents }, 'default');
    assert.ok(Array.isArray(result));
  });

  await t.test('get-available-overlay-keys defaults to the confirmed skin when skinId is omitted', async () => {
    SkinService.init(createMockDeps());
    SkinService.setCurrentSkinId('birds');
    const event = { sender: mockMainWindow.webContents };
    const expected = SkinService.getAvailableOverlayKeys('birds');

    assert.deepEqual(await mockIpcHandlers['get-available-overlay-keys'](event), expected);
    assert.deepEqual(await mockIpcHandlers['get-available-overlay-keys'](event, ''), expected);
  });

  await t.test('get-skin-gallery-items requires correct event sender', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['get-skin-gallery-items']({ sender: { id: 111 } });
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'FORBIDDEN');
  });

  await t.test('get-skin-gallery-items success via valid event', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const validEvent = { sender: { id: 999 } };
    const result = await mockIpcHandlers['get-skin-gallery-items'](validEvent);
    assert.ok(Array.isArray(result));
  });

  await t.test('scanAvailableSkins scans real assets directory and filters by whitelist when deps.availableSkins is omitted', () => {
    const deps = createMockDeps();
    delete deps.availableSkins;
    SkinService.init(deps);
    
    const skins = SkinService.scanAvailableSkins(true); // force refresh real scan
    assert.ok(Array.isArray(skins));
    assert.deepEqual(skins, ['default'], 'must return only whitelisted skins, excluding non-skin directories like fonts');
  });

  await t.test('get-available-skins and get-skin-gallery-items IPC handlers work when deps.availableSkins is omitted', async () => {
    const deps = createMockDeps();
    delete deps.availableSkins;
    SkinService.init(deps);

    const availableSkins = await mockIpcHandlers['get-available-skins']({ sender: mockMainWindow.webContents });
    assert.deepEqual(availableSkins, ['default'], 'get-available-skins should return [default]');

    const validEvent = { sender: { id: 999 } };
    const galleryItems = await mockIpcHandlers['get-skin-gallery-items'](validEvent);
    assert.ok(Array.isArray(galleryItems));
    assert.equal(galleryItems.length, 1, 'should return exactly 1 gallery item for default');
    assert.equal(galleryItems[0].id, 'default');
    assert.equal(galleryItems[0].isCurrent, true);
  });

  await t.test('set-current-skin success', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['set-current-skin']({ sender: mockMainWindow.webContents }, 'default');
    assert.equal(result.success, true);
    assert.equal(result.data.skinId, 'default');
    assert.equal(mockPomodoroSent, true);
    assert.equal(mockTrayRefreshed, true);
    assert.equal(SkinService.getCurrentSkinId(), 'default');
  });

  await t.test('set-current-skin validation failure', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['set-current-skin']({ sender: mockMainWindow.webContents }, 'non_existent_skin');
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  });

  await t.test('preview-skin does not change confirmed skin and sends isPreview: true', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    SkinService.setCurrentSkinId('default');

    const validEvent = { sender: { id: 999 } };
    mockTrayRefreshed = false;
    mockPomodoroSent = false;
    const result = await mockIpcHandlers['preview-skin'](validEvent, 'birds');
    assert.equal(result.success, true);
    assert.equal(SkinService.getCurrentSkinId(), 'default', 'confirmed skin must stay default');
    assert.equal(mockTrayRefreshed, false, 'tray menu should not be rebuilt on preview');
    assert.equal(mockPomodoroSent, false, 'pomodoro state should not be sent on preview');
    assert.equal(mockWindowSent.channel, 'switch-skin');
    assert.equal(mockWindowSent.data, 'birds');
    assert.equal(mockWindowSent.options.isPreview, true);
    assert.ok(Number.isSafeInteger(mockWindowSent.options.requestId));
  });

  await t.test('preview-skin sets skin temporarily', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const validEvent = { sender: { id: 999 } };
    const result = await mockIpcHandlers['preview-skin'](validEvent, 'default');
    assert.equal(result.success, true);
  });
  
  await t.test('preview-skin fails for invalid skin', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const validEvent = { sender: { id: 999 } };
    const result = await mockIpcHandlers['preview-skin'](validEvent, 'non_existent_skin');
    assert.equal(result.success, false);
  });

  await t.test('confirm-skin completes selection and commits preview skin', async () => {
    let mockStoreData = { petState: { skinId: 'default', score: 10 } };
    const deps = {
      ...createMockDeps(),
      StoreManager: {
        getStore: () => ({
          get: (k) => mockStoreData[k],
          set: (k, v) => { mockStoreData[k] = v; },
        }),
      },
    };
    SkinService.init(deps);
    SkinService.setCurrentSkinId('default');

    const validEvent = { sender: { id: 999 } };
    const mainEvent = { sender: mockMainWindow.webContents };
    await mockIpcHandlers['preview-skin'](validEvent, 'birds');
    // Renderer reports birds loaded
    await mockIpcHandlers['report-skin-loaded'](mainEvent, 'birds', { success: true, requestId: mockWindowSent.options.requestId });

    mockTrayRefreshed = false;
    mockPomodoroSent = false;
    const result = await mockIpcHandlers['confirm-skin'](validEvent);
    assert.equal(result.success, true);
    assert.equal(SkinService.getCurrentSkinId(), 'birds');
    assert.equal(mockTrayRefreshed, true, 'tray menu must be refreshed on confirm');
    assert.equal(mockPomodoroSent, true, 'pomodoro state must be sent on confirm');
    assert.equal(mockStoreData.petState.skinId, 'birds', 'store petState must be committed to birds');
  });

  await t.test('confirm-skin rejects if preview skin load failed', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    SkinService.setCurrentSkinId('default');

    const validEvent = { sender: { id: 999 } };
    const mainEvent = { sender: mockMainWindow.webContents };
    await mockIpcHandlers['preview-skin'](validEvent, 'birds');
    // Renderer reports birds failed to load
    await mockIpcHandlers['report-skin-loaded'](mainEvent, 'birds', { success: false, error: 'Network error', requestId: mockWindowSent.options.requestId });

    const result = await mockIpcHandlers['confirm-skin'](validEvent);
    assert.equal(result.success, false);
    assert.equal(SkinService.getCurrentSkinId(), 'default', 'skin must remain default');
  });

  await t.test('confirm-skin waits for slow load and commits on success', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    SkinService.setCurrentSkinId('default');

    const validEvent = { sender: { id: 999 } };
    const mainEvent = { sender: mockMainWindow.webContents };
    await mockIpcHandlers['preview-skin'](validEvent, 'birds');

    // Confirm is triggered while birds is still loading
    const confirmPromise = mockIpcHandlers['confirm-skin'](validEvent);
    // After 10ms, renderer reports success
    setTimeout(() => {
      mockIpcHandlers['report-skin-loaded'](mainEvent, 'birds', { success: true, requestId: mockWindowSent.options.requestId });
    }, 10);

    const result = await confirmPromise;
    assert.equal(result.success, true);
    assert.equal(SkinService.getCurrentSkinId(), 'birds');
  });

  await t.test('confirm-skin fails for invalid sender', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const invalidEvent = { sender: { id: 111 } };
    const result = await mockIpcHandlers['confirm-skin'](invalidEvent);
    assert.equal(result.success, false);
  });

  await t.test('cancel-skin restores previous skin', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    mockSkinSelectorWindow.originalSkinId = 'default';
    SkinService.setCurrentSkinId('some_other_skin');
    
    const validEvent = { sender: { id: 999 } };
    const result = await mockIpcHandlers['cancel-skin'](validEvent);
    assert.equal(result.success, true);
    assert.equal(SkinService.getCurrentSkinId(), 'default');
  });

  await t.test('close-skin-selector closes selector', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const validEvent = { sender: { id: 999 } };
    const result = await mockIpcHandlers['close-skin-selector'](validEvent);
    assert.equal(result.success, true);
  });

  await t.test('close-skin-selector fails for invalid sender', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const invalidEvent = { sender: { id: 111 } };
    const result = await mockIpcHandlers['close-skin-selector'](invalidEvent);
    assert.equal(result.success, false);
  });
});

test('SkinService - restoreConfirmedSkinFromStore', async (t) => {
  const createStore = (petState) => ({ get: (key) => (key === 'petState' ? petState : undefined) });

  t.beforeEach(() => {
    SkinService.setCurrentSkinId('default');
  });

  await t.test('adopts the saved skin as the confirmed skin', () => {
    assert.equal(SkinService.restoreConfirmedSkinFromStore(createStore({ skinId: 'birds' })), 'birds');
    assert.equal(SkinService.getConfirmedSkinId(), 'birds');
    assert.equal(SkinService.getPreviewSkinId(), null);
  });

  await t.test('keeps the current skin when the saved id is missing, unknown or not a string', () => {
    for (const petState of [undefined, null, {}, { skinId: 'deleted_skin' }, { skinId: 42 }, { skinId: '../default' }]) {
      assert.equal(SkinService.restoreConfirmedSkinFromStore(createStore(petState)), 'default');
      assert.equal(SkinService.getConfirmedSkinId(), 'default');
    }
  });

  await t.test('tolerates a missing store', () => {
    assert.equal(SkinService.restoreConfirmedSkinFromStore(null), 'default');
    assert.equal(SkinService.restoreConfirmedSkinFromStore({}), 'default');
  });
});

test('SkinService - Utility Functions', async (t) => {
  await t.test('resolvePomodoroAsset fallbacks correctly', () => {
    const url = SkinService.resolvePomodoroAsset('invalid_skin_id', 'walk_left.webp');
    assert.ok(url.includes('skin/default/walk_left.webp'));
  });

  await t.test('getAvailableOverlayKeys returns array', () => {
    const keys = SkinService.getAvailableOverlayKeys('default');
    assert.ok(Array.isArray(keys));
  });

  await t.test('setQaExtraSkinId injects extra skin and delegates asset checks', () => {
    try {
      SkinService.setQaExtraSkinId('qa_alt');
      assert.equal(process.env.DESKPET_QA_EXTRA_SKIN_ID, 'qa_alt');

      const deps = createMockDeps();
      delete deps.availableSkins;
      SkinService.init(deps);

      const skins = SkinService.scanAvailableSkins(true);
      assert.ok(skins.includes('qa_alt'), 'scanned skins must include qa_alt');
      assert.deepEqual(skins, ['default', 'qa_alt']);

      assert.equal(SkinService.hasSkinAsset('qa_alt', 'walk_left.webp'), SkinService.hasSkinAsset('default', 'walk_left.webp'));
    } finally {
      SkinService.setQaExtraSkinId(null);
      assert.equal(process.env.DESKPET_QA_EXTRA_SKIN_ID, undefined);
      const resetSkins = SkinService.scanAvailableSkins(true);
      assert.deepEqual(resetSkins, ['default']);
    }
  });

  await t.test('setQaExtraSkinId appends qa skin when availableSkins is injected via deps', async () => {
    try {
      SkinService.setQaExtraSkinId('qa_test_skin');
      SkinService.init(createMockDeps());

      const skins = await mockIpcHandlers['get-available-skins']({ sender: mockMainWindow.webContents });
      assert.ok(skins.includes('qa_test_skin'), 'get-available-skins must include qa_test_skin');
      assert.deepEqual(skins, ['default', 'birds', 'animal_ears', 'school_au', 'qa_test_skin']);
    } finally {
      SkinService.setQaExtraSkinId(null);
    }
  });
});

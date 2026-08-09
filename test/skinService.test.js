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

const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') return mockElectron;
  return originalRequire.apply(this, arguments);
};

const SkinService = require('../src/main/services/SkinService');

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
    send: (channel, data) => {
      mockWindowSent = { channel, data };
    }
  }
};

function createMockDeps() {
  return {
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
    assert.ok(mockIpcHandlers['select-skin']);
    assert.ok(mockIpcHandlers['preview-skin']);
    assert.ok(mockIpcHandlers['confirm-skin']);
    assert.ok(mockIpcHandlers['cancel-skin']);
    assert.ok(mockIpcHandlers['close-skin-selector']);
  });

  await t.test('get-available-skins handler', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['get-available-skins']();
    assert.ok(Array.isArray(result));
  });

  await t.test('get-available-overlay-keys handler', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['get-available-overlay-keys'](null, 'default');
    assert.ok(Array.isArray(result));
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

  await t.test('scanAvailableSkins returns default and known skins', () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const skins = SkinService.scanAvailableSkins(true); // force refresh
    assert.ok(Array.isArray(skins));
    assert.ok(skins.includes('default'));
  });

  await t.test('set-current-skin success', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['set-current-skin'](null, 'default');
    assert.equal(result.success, true);
    assert.equal(result.data.skinId, 'default');
    assert.equal(mockPomodoroSent, true);
    assert.equal(mockTrayRefreshed, true);
    assert.equal(SkinService.getCurrentSkinId(), 'default');
  });

  await t.test('set-current-skin validation failure', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const result = await mockIpcHandlers['set-current-skin'](null, 'non_existent_skin');
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  });

  await t.test('select-skin requires correct event sender', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const invalidEvent = { sender: { id: 111 } };
    const result = await mockIpcHandlers['select-skin'](invalidEvent, 'default');
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'FORBIDDEN');
  });

  await t.test('select-skin success via valid event', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const validEvent = { sender: { id: 999 } };
    const result = await mockIpcHandlers['select-skin'](validEvent, 'default');
    assert.equal(result.success, true);
    assert.equal(mockScreensaverCancelled, true);
    assert.ok(mockWindowSent);
    assert.equal(mockWindowSent.channel, 'switch-skin');
    assert.equal(mockWindowSent.data, 'default');
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

  await t.test('confirm-skin completes selection', async () => {
    const deps = createMockDeps();
    SkinService.init(deps);
    
    const validEvent = { sender: { id: 999 } };
    const result = await mockIpcHandlers['confirm-skin'](validEvent);
    assert.equal(result.success, true);
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

test('SkinService - Utility Functions', async (t) => {
  await t.test('resolvePomodoroAsset fallbacks correctly', () => {
    const url = SkinService.resolvePomodoroAsset('invalid_skin_id', 'walk_left.webp');
    assert.ok(url.includes('skin/default/walk_left.webp'));
  });

  await t.test('getAvailableOverlayKeys returns array', () => {
    const keys = SkinService.getAvailableOverlayKeys('default');
    assert.ok(Array.isArray(keys));
  });
});

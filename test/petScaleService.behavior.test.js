const assert = require('node:assert/strict');
const test = require('node:test');

// Simple fake ipcMain and fake BrowserWindow for testing
function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    trigger(channel, event, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler registered for ${channel}`);
      return handler(event, ...args);
    },
  };
}

function createFakeWindow() {
  const sentMessages = [];
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel, ...args) => {
        sentMessages.push({ channel, args });
      },
    },
    sentMessages,
  };
}

function createFakeStore(initialData = {}) {
  const data = new Map(Object.entries(initialData));
  return {
    get: (key) => data.get(key),
    set: (key, val) => data.set(key, val),
    has: (key) => data.has(key),
    data,
  };
}

test('PetScaleService initializes with fallback 100 when store is empty or invalid', () => {
  const { createPetScaleService } = require('../src/main/services/PetScaleService');
  const fakeStore = createFakeStore({ petScalePercent: 'invalid' });
  const fakeWindow = createFakeWindow();
  const fakeIpc = createFakeIpcMain();

  const service = createPetScaleService({
    ipcMain: fakeIpc,
    windowManager: { mainWindow: fakeWindow },
    StoreManager: { getStore: () => fakeStore },
  });

  assert.equal(service.getCommittedPercent(), 100);
});

test('PetScaleService initializes with valid persisted store value', () => {
  const { createPetScaleService } = require('../src/main/services/PetScaleService');
  const fakeStore = createFakeStore({ petScalePercent: 125 });
  const fakeWindow = createFakeWindow();
  const fakeIpc = createFakeIpcMain();

  const service = createPetScaleService({
    ipcMain: fakeIpc,
    windowManager: { mainWindow: fakeWindow },
    StoreManager: { getStore: () => fakeStore },
  });

  assert.equal(service.getCommittedPercent(), 125);
});

test('PetScaleService.preview broadcasts but does not write to store', () => {
  const { createPetScaleService } = require('../src/main/services/PetScaleService');
  const fakeStore = createFakeStore({ petScalePercent: 100 });
  const fakeWindow = createFakeWindow();
  const fakeIpc = createFakeIpcMain();

  const service = createPetScaleService({
    ipcMain: fakeIpc,
    windowManager: { mainWindow: fakeWindow },
    StoreManager: { getStore: () => fakeStore },
  });

  service.preview(120);

  assert.equal(service.getPreviewPercent(), 120);
  assert.equal(service.getCommittedPercent(), 100);
  assert.equal(fakeStore.get('petScalePercent'), 100);
  assert.deepEqual(fakeWindow.sentMessages[0], {
    channel: 'pet-scale-changed',
    args: [120],
  });
});

test('PetScaleService.confirm persists to store and confirms value', () => {
  const { createPetScaleService } = require('../src/main/services/PetScaleService');
  const fakeStore = createFakeStore({ petScalePercent: 100 });
  const fakeWindow = createFakeWindow();
  const fakeIpc = createFakeIpcMain();

  const service = createPetScaleService({
    ipcMain: fakeIpc,
    windowManager: { mainWindow: fakeWindow },
    StoreManager: { getStore: () => fakeStore },
  });

  service.preview(125);
  service.confirm();

  assert.equal(service.getCommittedPercent(), 125);
  assert.equal(service.getPreviewPercent(), 125);
  assert.equal(fakeStore.get('petScalePercent'), 125);
});

test('PetScaleService.cancel reverts preview and broadcasts committed value', () => {
  const { createPetScaleService } = require('../src/main/services/PetScaleService');
  const fakeStore = createFakeStore({ petScalePercent: 100 });
  const fakeWindow = createFakeWindow();
  const fakeIpc = createFakeIpcMain();

  const service = createPetScaleService({
    ipcMain: fakeIpc,
    windowManager: { mainWindow: fakeWindow },
    StoreManager: { getStore: () => fakeStore },
  });

  service.preview(150);
  fakeWindow.sentMessages.length = 0; // reset

  service.cancel();

  assert.equal(service.getCommittedPercent(), 100);
  assert.equal(service.getPreviewPercent(), 100);
  assert.equal(fakeStore.get('petScalePercent'), 100);
  assert.deepEqual(fakeWindow.sentMessages[0], {
    channel: 'pet-scale-changed',
    args: [100],
  });
});

test('PetScaleService get-pet-scale IPC handler authorizes sender', () => {
  const { createPetScaleService } = require('../src/main/services/PetScaleService');
  const fakeStore = createFakeStore({ petScalePercent: 110 });
  const mainWindow = createFakeWindow();
  const otherWindow = createFakeWindow();
  const fakeIpc = createFakeIpcMain();

  createPetScaleService({
    ipcMain: fakeIpc,
    windowManager: { mainWindow },
    StoreManager: { getStore: () => fakeStore },
  });

  // Allowed sender (mainWindow)
  const allowedResult = fakeIpc.trigger('get-pet-scale', { sender: mainWindow.webContents });
  assert.equal(allowedResult, 110);

  // Rejected sender (otherWindow)
  const rejectedResult = fakeIpc.trigger('get-pet-scale', { sender: otherWindow.webContents });
  assert.equal(rejectedResult, null);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// Mock electron and other dependencies via require hook
const originalRequire = Module.prototype.require;
let mockIpcMainOnHandler;
let setIgnoreMouseEventsCall = null;
let mainWindowMock = null;
let setTimerCalled = false;
let autoRestoreCallback = null;

const globalSetTimeout = global.setTimeout;
const globalClearTimeout = global.clearTimeout;

Module.prototype.require = function(request) {
  if (request === 'electron') {
    return {
      ipcMain: {
        on: (channel, handler) => {
          if (channel === 'set-ignore-mouse-events') {
            mockIpcMainOnHandler = handler;
          }
        }
      },
      BrowserWindow: class {},
      screen: { getPrimaryDisplay: () => ({}), on: () => {} }
    };
  }
  if (request.includes('WindowManager')) {
    return {
      get mainWindow() { return mainWindowMock; },
      set mainWindow(v) { mainWindowMock = v; }
    };
  }
  if (request.includes('CitySettingWindow')) {
    return { closeCitySettingWindow: () => {} };
  }
  if (request.includes('FinalSaveService')) {
    return { installFinalSaveBeforeClose: () => {} };
  }
  return originalRequire.apply(this, arguments);
};

// Require PetWindow with mocked dependencies
const PetWindow = require('../src/main/windows/PetWindow');

// Restore require
Module.prototype.require = originalRequire;

test.beforeEach(() => {
  setIgnoreMouseEventsCall = null;
  setTimerCalled = false;
  autoRestoreCallback = null;
  
  global.setTimeout = (cb, ms) => {
    setTimerCalled = true;
    autoRestoreCallback = cb;
    return 123;
  };
  global.clearTimeout = () => {};

  mainWindowMock = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false },
    setIgnoreMouseEvents: (ignore, options) => {
      setIgnoreMouseEventsCall = { ignore, options };
    }
  };
  
  PetWindow.init({});
});

test.afterEach(() => {
  global.setTimeout = globalSetTimeout;
  global.clearTimeout = globalClearTimeout;
});

test('Authorized main window sender can trigger mouse passthrough', () => {
  const event = { sender: mainWindowMock.webContents };
  mockIpcMainOnHandler(event, false, { leaseMs: 1000 });
  
  assert.deepStrictEqual(setIgnoreMouseEventsCall, { ignore: false, options: {} });
  assert.strictEqual(setTimerCalled, true);
});

test('Unauthorized sender cannot trigger mouse passthrough', () => {
  const event = { sender: { isDestroyed: () => false } };
  mockIpcMainOnHandler(event, false, { leaseMs: 1000 });
  
  assert.strictEqual(setIgnoreMouseEventsCall, null);
  assert.strictEqual(setTimerCalled, false);
});

test('Missing sender cannot trigger mouse passthrough', () => {
  const event = {}; 
  mockIpcMainOnHandler(event, false, { leaseMs: 1000 });
  
  assert.strictEqual(setIgnoreMouseEventsCall, null);
});

test('QA entry points (direct setPetWindowMousePassthrough) can still be called', () => {
  // Directly calling the function bypasses IPC auth check, representing a QA call
  PetWindow.setPetWindowMousePassthrough(true, { forward: true });
  assert.deepStrictEqual(setIgnoreMouseEventsCall, { ignore: true, options: { forward: true } });
});

test('Temporary mouse passthrough disable automatically restores after lease', () => {
  const event = { sender: mainWindowMock.webContents };
  mockIpcMainOnHandler(event, false, { leaseMs: 1000 });
  
  assert.deepStrictEqual(setIgnoreMouseEventsCall, { ignore: false, options: {} });
  
  // Simulate timer finish
  setIgnoreMouseEventsCall = null;
  autoRestoreCallback();
  
  assert.deepStrictEqual(setIgnoreMouseEventsCall, { ignore: true, options: { forward: true } });
});

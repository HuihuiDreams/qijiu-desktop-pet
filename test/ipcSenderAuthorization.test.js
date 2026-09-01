const { test } = require('node:test');
const assert = require('node:assert');
const {
  isSenderAnyWindow,
  isSenderMainWindow,
  isSenderWindow,
} = require('../src/main/services/IpcSenderAuthorization');

test('IpcSenderAuthorization - authorizes a live named window and an explicit allowlist', () => {
  const sender = { isDestroyed: () => false, id: 7 };
  const allowedWindow = { isDestroyed: () => false, webContents: sender };
  const otherWindow = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, id: 8 },
  };

  assert.strictEqual(isSenderWindow({ sender }, allowedWindow), true);
  assert.strictEqual(isSenderAnyWindow({ sender }, [otherWindow, allowedWindow]), true);
  assert.strictEqual(isSenderAnyWindow({ sender }, [otherWindow]), false);
});

test('IpcSenderAuthorization - should authorize valid main window sender', () => {
  const mockWebContents = { isDestroyed: () => false };
  const mockMainWindow = {
    isDestroyed: () => false,
    webContents: mockWebContents
  };
  const mockEvent = {
    sender: mockWebContents
  };

  assert.strictEqual(isSenderMainWindow(mockEvent, mockMainWindow), true);
});

test('IpcSenderAuthorization - should reject if event or event.sender is missing', () => {
  const mockWebContents = { isDestroyed: () => false };
  const mockMainWindow = {
    isDestroyed: () => false,
    webContents: mockWebContents
  };

  assert.strictEqual(isSenderMainWindow(null, mockMainWindow), false);
  assert.strictEqual(isSenderMainWindow({}, mockMainWindow), false);
});

test('IpcSenderAuthorization - should reject if mainWindow is missing or destroyed', () => {
  const mockWebContents = { isDestroyed: () => false };
  const mockEvent = { sender: mockWebContents };

  assert.strictEqual(isSenderMainWindow(mockEvent, null), false);
  
  const destroyedMainWindow = {
    isDestroyed: () => true,
    webContents: mockWebContents
  };
  assert.strictEqual(isSenderMainWindow(mockEvent, destroyedMainWindow), false);
});

test('IpcSenderAuthorization - should reject if mainWindow.webContents is missing or destroyed', () => {
  const mockWebContents = { isDestroyed: () => false };
  const mockEvent = { sender: mockWebContents };

  const missingWebContentsWindow = {
    isDestroyed: () => false
  };
  assert.strictEqual(isSenderMainWindow(mockEvent, missingWebContentsWindow), false);

  const destroyedWebContentsWindow = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => true }
  };
  assert.strictEqual(isSenderMainWindow(mockEvent, destroyedWebContentsWindow), false);
});

test('IpcSenderAuthorization - should reject if sender does not match mainWindow.webContents', () => {
  const mockWebContents1 = { isDestroyed: () => false, id: 1 };
  const mockWebContents2 = { isDestroyed: () => false, id: 2 };
  
  const mockMainWindow = {
    isDestroyed: () => false,
    webContents: mockWebContents1
  };
  
  const mockEvent = {
    sender: mockWebContents2
  };

  assert.strictEqual(isSenderMainWindow(mockEvent, mockMainWindow), false);
});

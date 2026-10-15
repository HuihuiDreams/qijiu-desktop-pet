'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createInMemoryStore,
  createMockWebContents,
  createMockWindow,
  createMockIpcMain,
  createIntegrationHarness,
} = require('./harness/createIntegrationHarness');

test('Integration Harness: Store, WebContents, Window, and IpcMain mocks', async (t) => {
  await t.test('1. in-memory store supports full ElectronStore API contract', () => {
    const store = createInMemoryStore({ initialKey: 'initVal' });
    assert.equal(store.get('initialKey'), 'initVal');
    assert.equal(store.get('missingKey', 'defaultVal'), 'defaultVal');
    assert.equal(store.has('initialKey'), true);

    store.set('newKey', 123);
    assert.equal(store.get('newKey'), 123);

    store.delete('initialKey');
    assert.equal(store.has('initialKey'), false);
    assert.deepEqual(store.raw, { newKey: 123 });

    store.clear();
    assert.deepEqual(store.raw, {});
  });

  await t.test('2. mock window destruction marks both window and webContents as destroyed', () => {
    const win = createMockWindow(10, { show: true });
    assert.equal(win.isDestroyed(), false);
    assert.equal(win.webContents.isDestroyed(), false);

    win.close();
    assert.equal(win.isDestroyed(), true);
    assert.equal(win.webContents.isDestroyed(), true, 'webContents must be marked destroyed when window closes');
  });

  await t.test('3. mock ipcMain handles invocation from both BrowserWindow and direct WebContents', async () => {
    const ipcMain = createMockIpcMain();
    ipcMain.handle('echo-sender-id', (event) => event.sender.id);

    const win = createMockWindow(42);
    // Call with window
    const fromWin = await ipcMain.invoke('echo-sender-id', win);
    assert.equal(fromWin, 42);

    // Call with direct webContents
    const directWebContents = createMockWebContents(88);
    const fromWebContents = await ipcMain.invoke('echo-sender-id', directWebContents);
    assert.equal(fromWebContents, 88, 'ipcMain.invoke should accept a direct webContents object');

    // Call with null/unknown sender defaults to -1
    const fromNull = await ipcMain.invoke('echo-sender-id', null);
    assert.equal(fromNull, -1);
  });
});

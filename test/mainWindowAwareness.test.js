const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

test('main process wires active window provider and sampler', () => {
  assert.ok(mainSource.includes("require('./activeWindowProvider')"));
  assert.ok(mainSource.includes("require('./activeWindowAwareness')"));
  assert.ok(mainSource.includes('ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 3000'));
  assert.ok(mainSource.includes('createActiveWindowProvider(process.platform)'));
  assert.ok(mainSource.includes('createActiveWindowSampler({'));
});

test('main process exposes active window IPC request and push channel', () => {
  assert.ok(mainSource.includes("ipcMain.handle('get-active-window-info'"));
  assert.ok(mainSource.includes('return activeWindowSampler.sampleOnce()'));
  assert.ok(mainSource.includes("webContents.send('active-window-info'"));
});

test('preload exposes safe active window APIs to renderer', () => {
  assert.ok(preloadSource.includes("getActiveWindowInfo: () => ipcRenderer.invoke('get-active-window-info')"));
  assert.ok(preloadSource.includes("ipcRenderer.on('active-window-info'"));
  assert.ok(preloadSource.includes("ipcRenderer.removeListener('active-window-info'"));
});

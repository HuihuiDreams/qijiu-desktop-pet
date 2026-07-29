const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { readMainProcessSource, read } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();
const preloadSource = read('preload.js');

test('main process wires active window provider and sampler', () => {
  assert.ok(mainSource.includes("require('../../../activeWindowProvider')"));
  assert.ok(mainSource.includes("require('../../../activeWindowAwareness')"));
  assert.match(mainSource, /ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 2000;/);
  assert.ok(mainSource.includes('createActiveWindowProvider(process.platform)'));
  assert.ok(mainSource.includes('createActiveWindowSampler({'));
  assert.ok(mainSource.includes('refreshUnchangedIntervalMs: ACTIVE_WINDOW_SAMPLE_INTERVAL_MS'));
});

test('renderer Window Awareness TTL covers more than two sampling intervals', () => {
  const configSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'config.js'), 'utf8');
  const sampleMatch = mainSource.match(/ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = (\d+)/);
  const ttlMatch = configSource.match(/WINDOW_AWARENESS_PLATFORM_TTL_MS: (\d+)/);

  assert.ok(sampleMatch);
  assert.ok(ttlMatch);
  assert.equal(Number(ttlMatch[1]) > Number(sampleMatch[1]) * 2, true);
});

test('main process exposes active window IPC request and push channel', () => {
  assert.ok(mainSource.includes("ipcMain.handle('get-active-window-info'"));
  assert.ok(mainSource.includes('return activeWindowSampler.sampleOnce()'));
  assert.ok(mainSource.includes("webContents.send('active-window-info'"));
});

test('main process sends taskbar platforms with screen info', () => {
  assert.ok(mainSource.includes('getTaskbarPlatformsRelativeToBounds'));
  assert.ok(mainSource.includes("const taskbarPlatforms = (process.platform === 'win32' || process.platform === 'darwin')"));
  assert.ok(mainSource.includes('? getTaskbarPlatformsRelativeToBounds(displays, bounds, windowScaleFactor)'));
  assert.ok(mainSource.includes('taskbarPlatforms,'));
});

test('preload exposes safe active window APIs to renderer', () => {
  assert.ok(preloadSource.includes("getActiveWindowInfo: () => ipcRenderer.invoke('get-active-window-info')"));
  assert.ok(preloadSource.includes("return subscribeIpc('active-window-info', listener)"));
  assert.ok(preloadSource.includes('return () => ipcRenderer.removeListener(channel, listener)'));
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { readMainProcessSource, read } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();
const preloadSource = read('preload.js');
const appSource = read('src/app.js');

test('main process exposes a debug-readable pet visibility state', () => {
  assert.match(mainSource, /function getPetVisibilityState\(\)/);
  assert.match(mainSource, /reason: 'manual'/);
  assert.match(mainSource, /reason: 'meeting'/);
  assert.match(mainSource, /reason: 'pomodoro'/);
  assert.match(mainSource, /reason: 'visible'/);
  assert.match(mainSource, /ipcMain\.handle\('get-pet-visibility-state'/);
});

test('visibility events include the current visibility state payload', () => {
  assert.match(mainSource, /mainWindow\.webContents\.send\('toggle-pet-visibility', visible, getPetVisibilityState\(\)\)/);
});

test('preload exposes pet visibility diagnostics through safe IPC', () => {
  assert.match(preloadSource, /getPetVisibilityState:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-pet-visibility-state'\)/);
  assert.match(
    preloadSource,
    /return subscribeIpc\('toggle-pet-visibility', \(_event, visible, state\) => callback\(visible, state\)\)/,
  );
});

test('renderer stores pet visibility diagnostics for Playwright QA', () => {
  assert.match(appSource, /window\.__DEBUG_VISIBILITY/);
  assert.match(appSource, /getPetVisibilityState\(\)/);
  assert.match(appSource, /visible \? '' : 'none'/);
});

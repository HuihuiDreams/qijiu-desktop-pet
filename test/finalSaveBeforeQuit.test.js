const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('main process waits for renderer final save before closing the pet window', () => {
  const mainSource = readSource('main.js');

  assert.ok(mainSource.includes('installFinalSaveBeforeClose(windowManager.mainWindow)'));
  assert.ok(mainSource.includes("event.preventDefault()"));
  assert.ok(mainSource.includes("win.webContents.send('save-before-quit', requestId)"));
  assert.ok(mainSource.includes("ipcMain.removeListener('save-before-quit-complete'"));
  assert.ok(mainSource.includes('FINAL_SAVE_TIMEOUT_MS'));
});

test('preload exposes final-save request handler to the renderer', () => {
  const preloadSource = readSource('preload.js');

  assert.ok(preloadSource.includes('onSaveBeforeQuit'));
  assert.ok(preloadSource.includes("return subscribeIpc('save-before-quit', listener)"));
  assert.ok(preloadSource.includes("ipcRenderer.send('save-before-quit-complete'"));
});

test('renderer registers saveCurrentState for the final-save request', () => {
  const appSource = readSource('src/app.js');

  assert.ok(appSource.includes('window.electronAPI.onSaveBeforeQuit(saveCurrentState)'));
  assert.equal(appSource.includes("window.addEventListener('beforeunload'"), false);
});

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('main process waits for renderer final save before closing the pet window', () => {
  // The final-save protocol lives in FinalSaveService.js (AppLifecycle
  // Decomposition Phase 8); the call site that wires it to the pet window
  // lives in PetWindow.js.
  const mainSource = readSource('main.js')
    + '\n' + readSource('src/main/AppLifecycle.js')
    + '\n' + readSource('src/main/services/FinalSaveService.js')
    + '\n' + readSource('src/main/windows/PetWindow.js');

  assert.ok(mainSource.includes('installFinalSaveBeforeClose(windowManager.mainWindow)'));
  assert.ok(mainSource.includes("event.preventDefault()"));
  assert.ok(mainSource.includes("win.webContents.send('save-before-quit', requestId)"));
  // The completion listener must be registered, not only removed — otherwise the
  // renderer's ack is never heard and every quit stalls for the full timeout.
  assert.ok(
    mainSource.includes("ipcMain.on('save-before-quit-complete', handleComplete)"),
    'must register the save-before-quit-complete listener'
  );
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
  // saveCurrentState() 的实际实现（app.js 拆分 Phase R4）已下沉到
  // src/systems/OfflineReturnSystem.js，app.js 只保留一行委托订阅。
  const appSource = readSource('src/app.js');

  assert.ok(appSource.includes('window.electronAPI.onSaveBeforeQuit(() => offlineReturnSystem.saveCurrentState())'));
  assert.equal(appSource.includes("window.addEventListener('beforeunload'"), false);

  const offlineReturnSystemSource = readSource('src/systems/OfflineReturnSystem.js');
  assert.match(offlineReturnSystemSource, /saveCurrentState\(\)\s*{/);
  assert.ok(offlineReturnSystemSource.includes('this.timeSystem.save('));
});

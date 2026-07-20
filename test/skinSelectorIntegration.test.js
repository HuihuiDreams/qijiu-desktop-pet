const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('main process exposes gallery data and validated skin selection IPC', () => {
  const mainSource = readProjectFile('main.js') + '\n' + readProjectFile('src/main/AppLifecycle.js') + '\n' + readProjectFile('src/main/TrayManager.js') + '\n' + readProjectFile('src/main/windows/WindowManager.js') + '\n' + readProjectFile('src/main/services/SkinService.js');

  assert.match(mainSource, /ipcMain\.handle\('get-skin-gallery-items'/);
  assert.match(mainSource, /ipcMain\.handle\('select-skin'/);
  assert.match(mainSource, /function selectSkin\(skinId\)/);
  assert.match(mainSource, /mainWindow\.webContents\.send\('switch-skin', skinId\)/);
});

test('tray opens the gallery instead of rendering a skin radio submenu', () => {
  const mainSource = readProjectFile('main.js') + '\n' + readProjectFile('src/main/AppLifecycle.js') + '\n' + readProjectFile('src/main/TrayManager.js') + '\n' + readProjectFile('src/main/windows/WindowManager.js') + '\n' + readProjectFile('src/main/services/SkinService.js');
  const traySkinEntry = mainSource.indexOf("label: trayMenuLabel('trayChooseSkin')");

  assert.ok(traySkinEntry > -1);
  const clickStart = mainSource.indexOf('click:', traySkinEntry);
  assert.ok(clickStart > traySkinEntry);
  const clickContent = mainSource.slice(clickStart, clickStart + 100);
  assert.match(clickContent, /deps\.openSkinSelector\(\)/);
  assert.equal(mainSource.includes('submenu: skinSubmenu'), false);
});

test('skin selector uses a dedicated limited preload bridge', () => {
  const preloadSource = readProjectFile('skinSelectorPreload.js');

  assert.match(preloadSource, /getSkinGalleryItems: \(\) => ipcRenderer\.invoke\('get-skin-gallery-items'\)/);
  assert.match(preloadSource, /selectSkin: \(skinId\) => ipcRenderer\.invoke\('select-skin', skinId\)/);
  assert.match(preloadSource, /previewSkin: \(skinId\) => ipcRenderer\.invoke\('preview-skin', skinId\)/);
  assert.match(preloadSource, /confirmSkin: \(\) => ipcRenderer\.invoke\('confirm-skin'\)/);
  assert.match(preloadSource, /cancelSkin: \(\) => ipcRenderer\.invoke\('cancel-skin'\)/);
  assert.match(preloadSource, /close: \(\) => ipcRenderer\.invoke\('close-skin-selector'\)/);
});

test('skin selector IPC only accepts requests from the selector window', () => {
  const mainSource = readProjectFile('main.js') + '\n' + readProjectFile('src/main/AppLifecycle.js') + '\n' + readProjectFile('src/main/TrayManager.js') + '\n' + readProjectFile('src/main/windows/WindowManager.js') + '\n' + readProjectFile('src/main/services/SkinService.js');

  assert.match(
    mainSource,
    /function isSkinSelectorRequest\(event\)[\s\S]*?event\?\.sender\?\.id === windowManager\.skinSelectorWindow\.webContents\.id/,
  );

  for (const channel of [
    'get-skin-gallery-items',
    'select-skin',
    'preview-skin',
    'confirm-skin',
    'cancel-skin',
    'close-skin-selector',
  ]) {
    const handlerStart = mainSource.indexOf(`ipcMain.handle('${channel}'`);
    const nextHandler = mainSource.indexOf("ipcMain.handle('", handlerStart + 1);
    const handlerSource = mainSource.slice(handlerStart, nextHandler === -1 ? undefined : nextHandler);

    assert.ok(handlerStart > -1, `${channel} handler should exist`);
    assert.match(handlerSource, /if \(!isSkinSelectorRequest\(event\)\)/);
    assert.match(handlerSource, /createIpcFailure\('FORBIDDEN', 'Skin selector access denied'\)/);
  }
});

test('reopening the skin selector clears an earlier selection lock', () => {
  const rendererSource = readProjectFile('src/skinSelectorWindow.js');
  const renderStart = rendererSource.indexOf('function renderGallery');
  const renderEnd = rendererSource.indexOf("confirmBtn.addEventListener", renderStart);
  const renderSource = rendererSource.slice(renderStart, renderEnd);

  assert.match(renderSource, /previewInFlight = false/);
});

test('skin selector maintains original active skin and selection during preview when locale changes', () => {
  const mainSource = readProjectFile('main.js') + '\n' + readProjectFile('src/main/AppLifecycle.js') + '\n' + readProjectFile('src/main/TrayManager.js') + '\n' + readProjectFile('src/main/windows/WindowManager.js') + '\n' + readProjectFile('src/main/services/SkinService.js');
  const preloadSource = readProjectFile('skinSelectorPreload.js');
  const rendererSource = readProjectFile('src/skinSelectorWindow.js');

  assert.match(mainSource, /const activeSkinId = skinSelectorWindowModule\.getSkinSelectorOriginalSkinId\(\) != null \? skinSelectorWindowModule\.getSkinSelectorOriginalSkinId\(\) : currentSkinId;/);
  assert.match(mainSource, /sendSkinSelectorData\(\{ resetSelection: false \}\)/);
  assert.match(preloadSource, /onData: \(callback\) => subscribeIpc\('skin-selector-data', \(_event, items, options\) => callback\(items, options\)\)/);
  assert.match(rendererSource, /window\.skinSelectorAPI\.onData\(\(items, options\) => renderGallery\(items, options\)\)/);
});


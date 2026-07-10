const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('main process exposes gallery data and validated skin selection IPC', () => {
  const mainSource = readProjectFile('main.js');

  assert.match(mainSource, /ipcMain\.handle\('get-skin-gallery-items'/);
  assert.match(mainSource, /ipcMain\.handle\('select-skin'/);
  assert.match(mainSource, /function selectSkin\(skinId\)/);
  assert.match(mainSource, /mainWindow\.webContents\.send\('switch-skin', skinId\)/);
});

test('tray opens the gallery instead of rendering a skin radio submenu', () => {
  const mainSource = readProjectFile('main.js');
  const traySkinEntry = mainSource.indexOf("label: trayMenuLabel('trayChooseSkin')");

  assert.ok(traySkinEntry > -1);
  assert.ok(mainSource.indexOf('click: () => {\n        openSkinSelector();', traySkinEntry) > traySkinEntry);
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

test('reopening the skin selector clears an earlier selection lock', () => {
  const rendererSource = readProjectFile('src/skinSelectorWindow.js');
  const renderStart = rendererSource.indexOf('function renderGallery');
  const renderEnd = rendererSource.indexOf("confirmBtn.addEventListener", renderStart);
  const renderSource = rendererSource.slice(renderStart, renderEnd);

  assert.match(renderSource, /previewInFlight = false/);
});

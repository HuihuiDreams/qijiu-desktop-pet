const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8');

test('main process disables the default Electron application menu before app UI is created', () => {
  const disableFunctionIndex = mainSource.indexOf('function disableApplicationMenu()');
  const setApplicationMenuIndex = mainSource.indexOf('Menu.setApplicationMenu(null);', disableFunctionIndex);
  const readyIndex = mainSource.indexOf('app.whenReady().then');
  const disableCallIndex = mainSource.indexOf('disableApplicationMenu();', readyIndex);
  const createWindowIndex = mainSource.indexOf('createWindow()', disableCallIndex);
  const createTrayIndex = Math.max(mainSource.indexOf('trayManager.createTray();', disableCallIndex), mainSource.indexOf('createTray();', disableCallIndex));

  assert.ok(disableFunctionIndex > -1);
  assert.ok(setApplicationMenuIndex > disableFunctionIndex);
  assert.ok(disableCallIndex > readyIndex);
  assert.ok(createWindowIndex > disableCallIndex);
  assert.ok(createTrayIndex > disableCallIndex);
});

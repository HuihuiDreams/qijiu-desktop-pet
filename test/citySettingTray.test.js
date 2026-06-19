const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('main process creates a sandboxed city setting BrowserWindow from local files', () => {
  assert.match(mainSource, /function createCitySettingWindow\(\)/);
  assert.match(mainSource, /if \(citySettingWindow && !citySettingWindow\.isDestroyed\(\)\) return citySettingWindow/);
  assert.match(mainSource, /citySettingWindow = new BrowserWindow/);
  assert.match(mainSource, /citySettingWindow\.loadFile\(path\.join\(__dirname, 'src', 'city-setting\.html'\)\)/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /citySettingWindow\.on\('closed'/);
});

test('city setting window uses a compact size for simple city input', () => {
  // Extract just the createCitySettingWindow function body
  const funcStart = mainSource.indexOf('function createCitySettingWindow()');
  const funcBody = mainSource.slice(funcStart, mainSource.indexOf('\n}\n', funcStart) + 3);

  assert.match(funcBody, /const width = 360/);
  assert.match(funcBody, /const height = 200/);
});

test('tray menu calls openCitySettingWindow instead of openInEditor', () => {
  assert.match(mainSource, /trayMenuLabel\('trayWeatherSyncConfig'\)/);
  assert.match(mainSource, /openCitySettingWindow\(\)/);

  // Ensure openInEditor is no longer called for weather config
  const trayConfigSection = mainSource.slice(
    mainSource.indexOf("trayMenuLabel('trayWeatherSyncConfig')"),
    mainSource.indexOf("trayMenuLabel('trayWeatherSyncConfig')") + 200,
  );
  assert.equal(trayConfigSection.includes('openInEditor'), false,
    'tray weather config should not call store.openInEditor()');
});

test('main process registers city setting IPC handlers', () => {
  for (const channel of [
    'get-city-settings',
    'set-city-name',
    'close-city-setting-window',
  ]) {
    assert.match(mainSource, new RegExp(`ipcMain\\.handle\\('${channel}'`), `${channel} should be handled`);
  }
});

test('set-city-name IPC validates input and performs geocode', () => {
  const handlerStart = mainSource.indexOf("ipcMain.handle('set-city-name'");
  assert.notEqual(handlerStart, -1);
  const handlerBody = mainSource.slice(handlerStart, mainSource.indexOf('\n});', handlerStart) + 4);

  // Validates string input
  assert.match(handlerBody, /typeof cityName !== 'string'/);
  // Trims and limits length
  assert.match(handlerBody, /cityName\.trim\(\)\.slice\(0, 100\)/);
  // Calls processSettingsChange for geocoding
  assert.match(handlerBody, /processSettingsChange\(newSettings\)/);
  // Returns success/failure
  assert.match(handlerBody, /return \{ success: true, city: processed\.city \}/);
  assert.match(handlerBody, /return \{ success: false \}/);
});

test('city setting window is cleaned up when main window closes', () => {
  // Find the mainWindow.on('closed', ...) handler section
  const closedIndex = mainSource.indexOf("mainWindow.on('closed'");
  assert.notEqual(closedIndex, -1, "mainWindow.on('closed') should exist");

  // Grab a reasonable chunk after the 'closed' handler start
  const closedSection = mainSource.slice(closedIndex, closedIndex + 600);
  assert.match(closedSection, /closeCitySettingWindow\(\)/,
    'mainWindow closed handler should clean up city setting window');
});

test('locale changes are forwarded to city setting window', () => {
  // Check tray language submenu click handler
  const langSubmenuSection = mainSource.slice(
    mainSource.indexOf('langSubmenu'),
    mainSource.indexOf('return Menu.buildFromTemplate'),
  );
  assert.match(langSubmenuSection, /citySettingWindow.*locale-changed/s,
    'tray language submenu should forward locale-changed to city setting window');
});

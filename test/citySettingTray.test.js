const assert = require('node:assert/strict');
const test = require('node:test');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();

test('main process creates a sandboxed city setting BrowserWindow from local files', () => {
  assert.match(mainSource, /function createCitySettingWindow\(\)/);
  assert.match(mainSource, /if \(windowManager.citySettingWindow && !windowManager.citySettingWindow\.isDestroyed\(\)\) return windowManager.citySettingWindow/);
  assert.match(mainSource, /windowManager.citySettingWindow = new BrowserWindow/);
  assert.match(mainSource, /windowManager.citySettingWindow\.loadFile\(path\.join\(__dirname, ('.*?', )*'src', 'city-setting\.html'\)\)/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /windowManager.citySettingWindow\.on\('closed'/);
});

test('city setting window uses a compact size for simple city input', () => {
  // Extract just the createCitySettingWindow function body
  const funcStart = mainSource.indexOf('function createCitySettingWindow()');
  const funcBody = mainSource.slice(funcStart, mainSource.indexOf('\n}\n', funcStart) + 3);

  assert.match(funcBody, /const width = 360/);
  assert.match(funcBody, /const height = 200/);
});

test('city setting window briefly pulses top level when opened or reactivated', () => {
  assert.match(mainSource, /const CITY_SETTING_ALWAYS_ON_TOP_LEVEL = 'screen-saver'/);
  assert.match(mainSource, /const CITY_SETTING_TOP_PULSE_MS = 180/);
  assert.match(mainSource, /function pulseCitySettingWindowTop\(\)/);
  assert.match(mainSource, /function raiseCitySettingWindow\(\)/);
  assert.match(mainSource, /windowManager.citySettingWindow\.setAlwaysOnTop\(true, CITY_SETTING_ALWAYS_ON_TOP_LEVEL\)/);
  assert.match(mainSource, /windowManager.citySettingWindow\.setAlwaysOnTop\(false\)/);
  assert.match(mainSource, /windowManager.citySettingWindow\.moveTop\(\)/);
  assert.match(mainSource, /alwaysOnTop:\s*false/);
  assert.match(mainSource, /windowManager.citySettingWindow\.on\('focus'/);
  assert.match(mainSource, /windowManager.citySettingWindow\.on\('show'/);
  assert.match(mainSource, /windowManager.citySettingWindow\.on\('restore'/);
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
  const closedIndex = mainSource.indexOf("windowManager.mainWindow.on('closed'");
  assert.notEqual(closedIndex, -1, "windowManager.mainWindow.on('closed') should exist");

  // Grab a reasonable chunk after the 'closed' handler start
  const closedSection = mainSource.slice(closedIndex, closedIndex + 1000);
  assert.match(closedSection, /closeCitySettingWindow\(\)/,
    'mainWindow closed handler should clean up city setting window');
});

test('locale changes are forwarded to city setting window', () => {
  // Check tray language submenu click handler
  const langSubmenuSection = mainSource.slice(
    mainSource.indexOf('langSubmenu'),
    mainSource.indexOf('return Menu.buildFromTemplate'),
  );
  assert.match(langSubmenuSection, /windowManager\.citySettingWindow.*locale-changed/s,
    'tray language submenu should forward locale-changed to city setting window');
});

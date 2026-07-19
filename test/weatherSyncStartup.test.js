const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8');

test('weather sync tray state updates before async geocoding completes', () => {
  const functionStart = mainSource.indexOf('async function updateWeatherSyncSettings(newSettings)');
  assert.notStrictEqual(functionStart, -1);

  const functionEnd = mainSource.indexOf('\n}', functionStart);
  const source = mainSource.slice(functionStart, functionEnd);

  const normalizeIndex = source.indexOf('weatherSyncSettings = normalizeWeatherSyncSettings(newSettings);');
  const refreshIndex = source.indexOf('refreshTrayMenu();');
  const geocodeIndex = source.indexOf('await processSettingsChange(weatherSyncSettings)');

  assert.ok(normalizeIndex !== -1);
  assert.ok(refreshIndex !== -1);
  assert.ok(geocodeIndex !== -1);
  assert.ok(normalizeIndex < geocodeIndex);
  assert.ok(refreshIndex < geocodeIndex);
  assert.match(source, /if \(updateId !== weatherSyncSettingsUpdateId\) return;/);
});

test('weather sync first fetch waits until the renderer has loaded', () => {
  const readyStart = mainSource.indexOf('app.whenReady().then(async () => {');
  const createWindowIndex = mainSource.indexOf('createWindow();', readyStart);
  const loadHandlerIndex = mainSource.indexOf("mainWindow.webContents.on('did-finish-load'");
  const storedSettingsIndex = mainSource.indexOf('weatherSyncSettings = getStoredWeatherSyncSettings();', readyStart);
  const startupSyncIndex = mainSource.indexOf('updateWeatherSyncSettings(weatherSyncSettings);', loadHandlerIndex);
  const legacyEarlySyncIndex = mainSource.indexOf('updateWeatherSyncSettings(getStoredWeatherSyncSettings());', readyStart);

  assert.notStrictEqual(readyStart, -1);
  assert.notStrictEqual(createWindowIndex, -1);
  assert.notStrictEqual(loadHandlerIndex, -1);
  assert.notStrictEqual(storedSettingsIndex, -1);
  assert.notStrictEqual(startupSyncIndex, -1);
  assert.strictEqual(legacyEarlySyncIndex, -1);
  assert.ok(storedSettingsIndex < createWindowIndex);
  assert.ok(startupSyncIndex > loadHandlerIndex);
  assert.ok(startupSyncIndex < mainSource.indexOf('});', loadHandlerIndex));
});

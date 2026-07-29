const test = require('node:test');
const assert = require('node:assert');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

const mainSource = readMainProcessSource();

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
  // Since AppLifecycle Decomposition Phase 7/8, WeatherSyncController owns the
  // settings cache and loads it synchronously at the end of its own init()
  // (so early tray/city-settings reads reflect the persisted preference);
  // the pet window's did-finish-load handler (now in PetWindow.js) then kicks
  // off the real sync (geocode/fetch/interval) via updateWeatherSyncSettings().
  const readyStart = mainSource.indexOf('app.whenReady().then(async () => {');
  const readyEnd = mainSource.indexOf('}).catch(err => { console.error(', readyStart);
  const featureServicesIndex = mainSource.indexOf('AppLifecycle.initFeatureServices();', readyStart);
  const petWindowIndex = mainSource.indexOf('AppLifecycle.initPetWindow();', readyStart);
  const loadHandlerIndex = mainSource.indexOf("mainWindow.webContents.on('did-finish-load'");
  const startupSyncIndex = mainSource.indexOf(
    'WeatherSyncController.updateWeatherSyncSettings(WeatherSyncController.getWeatherSyncSettings());',
    loadHandlerIndex
  );

  assert.notStrictEqual(readyStart, -1);
  assert.notStrictEqual(readyEnd, -1);
  assert.notStrictEqual(featureServicesIndex, -1);
  assert.notStrictEqual(petWindowIndex, -1);
  assert.notStrictEqual(loadHandlerIndex, -1);
  assert.notStrictEqual(startupSyncIndex, -1);
  assert.ok(featureServicesIndex < readyEnd, 'feature services init must be called inside whenReady');
  assert.ok(petWindowIndex < readyEnd, 'pet window init must be called inside whenReady');
  assert.ok(featureServicesIndex < petWindowIndex, 'settings must be loaded before the pet window/tray are created');
  assert.ok(startupSyncIndex > loadHandlerIndex, 'the full sync must only start after did-finish-load fires');
  assert.ok(startupSyncIndex < mainSource.indexOf('});', loadHandlerIndex), 'the sync call must live inside the did-finish-load handler');
});

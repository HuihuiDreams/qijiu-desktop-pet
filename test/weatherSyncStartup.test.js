const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('renderer subscribes to weather updates before asynchronous startup work', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const localeAwaitIndex = appSource.indexOf('await window.electronAPI.getLocale()');
  const weatherSubscriptionIndex = appSource.indexOf('window.electronAPI.onWeatherUpdate?.(');

  assert.ok(localeAwaitIndex >= 0, 'the startup locale read must remain asynchronous');
  assert.ok(weatherSubscriptionIndex >= 0, 'the renderer must subscribe to weather updates');
  assert.ok(
    weatherSubscriptionIndex < localeAwaitIndex,
    'weather updates sent immediately after did-finish-load must not be lost during renderer startup',
  );
});

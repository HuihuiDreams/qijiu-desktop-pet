const test = require('node:test');
const assert = require('node:assert');
const { CONFIG } = require('../src/data/config.js');

test('Weather Sync Configuration', async (t) => {
  await t.test('has weather sync constants', () => {
    assert.strictEqual(typeof CONFIG.WEATHER_MIN_REFRESH_MINUTES, 'number', 'WEATHER_MIN_REFRESH_MINUTES should be defined as a number');
    assert.strictEqual(typeof CONFIG.WEATHER_TIMEOUT_MS, 'number', 'WEATHER_TIMEOUT_MS should be defined as a number');
    assert.strictEqual(typeof CONFIG.WEATHER_BACKOFF_MS, 'number', 'WEATHER_BACKOFF_MS should be defined as a number');

    assert.ok(CONFIG.WEATHER_MIN_REFRESH_MINUTES > 0, 'Refresh interval should be greater than 0');
    assert.ok(CONFIG.WEATHER_TIMEOUT_MS > 0, 'Timeout should be greater than 0');
    assert.ok(CONFIG.WEATHER_BACKOFF_MS > 0, 'Backoff should be greater than 0');
  });
});

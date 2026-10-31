const test = require('node:test');
const assert = require('node:assert');
const { CONFIG } = require('../src/data/config.js');

test('Weather Sync Configuration', async (t) => {
  await t.test('has weather sync constants', () => {
    assert.strictEqual(typeof CONFIG.WEATHER_MIN_REFRESH_MINUTES, 'number', 'WEATHER_MIN_REFRESH_MINUTES should be defined as a number');
    assert.strictEqual(typeof CONFIG.WEATHER_TIMEOUT_MS, 'number', 'WEATHER_TIMEOUT_MS should be defined as a number');
    assert.strictEqual(typeof CONFIG.WEATHER_BACKOFF_MS, 'number', 'WEATHER_BACKOFF_MS should be defined as a number');
    assert.strictEqual(typeof CONFIG.WEATHER_RAIN_PARTICLE_MAX, 'number', 'WEATHER_RAIN_PARTICLE_MAX should be defined as a number');
    assert.strictEqual(typeof CONFIG.WEATHER_SNOW_PARTICLE_MAX, 'number', 'WEATHER_SNOW_PARTICLE_MAX should be defined as a number');

    assert.ok(CONFIG.WEATHER_MIN_REFRESH_MINUTES > 0, 'Refresh interval should be greater than 0');
    assert.ok(CONFIG.WEATHER_TIMEOUT_MS > 0, 'Timeout should be greater than 0');
    assert.ok(CONFIG.WEATHER_BACKOFF_MS > 0, 'Backoff should be greater than 0');
    assert.ok(CONFIG.WEATHER_RAIN_PARTICLE_MAX > 0, 'Rain particle cap should be greater than 0');
    assert.ok(CONFIG.WEATHER_SNOW_PARTICLE_MAX > 0, 'Snow particle cap should be greater than 0');
  });
});

test('Role Identity & Interaction Configuration', async (t) => {
  await t.test('PET_A (Crowley) identity is properly configured', () => {
    assert.strictEqual(CONFIG.PET_A.id, 'yueqi');
    assert.strictEqual(CONFIG.PET_A.name, '克劳利');
    assert.strictEqual(CONFIG.PET_A.nickname, 'Crowley');
    assert.strictEqual(CONFIG.PET_A.emoji, '🕶️');
    assert.strictEqual(CONFIG.PET_A.defaultDirection, 'left');
  });

  await t.test('PET_B (Aziraphale) identity is properly configured', () => {
    assert.strictEqual(CONFIG.PET_B.id, 'shenjiu');
    assert.strictEqual(CONFIG.PET_B.name, '亚茨拉斐尔');
    assert.strictEqual(CONFIG.PET_B.nickname, 'Aziraphale');
    assert.strictEqual(CONFIG.PET_B.emoji, '🪽');
    assert.strictEqual(CONFIG.PET_B.defaultDirection, 'right');
  });

  await t.test('interaction affection thresholds align with design roadmap', () => {
    assert.strictEqual(CONFIG.INTERACTIONS.greet.minAffection, 0);
    assert.strictEqual(CONFIG.INTERACTIONS.shareFood.minAffection, 0);
    assert.strictEqual(CONFIG.INTERACTIONS.cultivate.minAffection, 20);
    assert.strictEqual(CONFIG.INTERACTIONS.hug.minAffection, 50);
    assert.strictEqual(CONFIG.INTERACTIONS.kiss.minAffection, 75);
  });
});

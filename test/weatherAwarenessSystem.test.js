const test = require('node:test');
const assert = require('node:assert');
const WeatherAwarenessSystem = require('../src/systems/WeatherAwarenessSystem.js');
const { CONFIG } = require('../src/data/config.js');

test('WeatherAwarenessSystem - Local Time Phase', async (t) => {
  let mockDate = new Date();
  
  const system = new WeatherAwarenessSystem(CONFIG);
  system._getCurrentDate = () => mockDate;

  await t.test('computes morning correctly (05:00 - 10:59)', () => {
    mockDate = new Date(2026, 0, 1, 5, 0, 0); // 05:00
    system._lastComputedMinute = -1; // force recompute
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(100000);
    assert.strictEqual(system.getCurrentState().timePhase, 'morning');

    mockDate = new Date(2026, 0, 1, 10, 59, 59); // 10:59
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(120000);
    assert.strictEqual(system.getCurrentState().timePhase, 'morning');
  });

  await t.test('computes day correctly (11:00 - 16:59)', () => {
    mockDate = new Date(2026, 0, 1, 11, 0, 0); // 11:00
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(130000);
    assert.strictEqual(system.getCurrentState().timePhase, 'day');

    mockDate = new Date(2026, 0, 1, 16, 59, 59); // 16:59
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(140000);
    assert.strictEqual(system.getCurrentState().timePhase, 'day');
  });

  await t.test('computes dusk correctly (17:00 - 19:59)', () => {
    mockDate = new Date(2026, 0, 1, 17, 0, 0); // 17:00
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(150000);
    assert.strictEqual(system.getCurrentState().timePhase, 'dusk');

    mockDate = new Date(2026, 0, 1, 19, 59, 59); // 19:59
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(160000);
    assert.strictEqual(system.getCurrentState().timePhase, 'dusk');
  });

  await t.test('computes evening correctly (20:00 - 23:59)', () => {
    mockDate = new Date(2026, 0, 1, 20, 0, 0); // 20:00
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(170000);
    assert.strictEqual(system.getCurrentState().timePhase, 'evening');

    mockDate = new Date(2026, 0, 1, 23, 59, 59); // 23:59
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(180000);
    assert.strictEqual(system.getCurrentState().timePhase, 'evening');
  });

  await t.test('computes night correctly (00:00 - 04:59)', () => {
    mockDate = new Date(2026, 0, 1, 0, 0, 0); // 00:00 (cross midnight)
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(185000);
    assert.strictEqual(system.getCurrentState().timePhase, 'night');

    mockDate = new Date(2026, 0, 1, 4, 59, 59); // 04:59
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(190000);
    assert.strictEqual(system.getCurrentState().timePhase, 'night');
  });

  await t.test('throttles computation within the same minute or within 10s', () => {
    let computeCount = 0;
    const originalCompute = system.computePhase.bind(system);
    system.computePhase = (h, m) => {
      computeCount++;
      return originalCompute(h, m);
    };

    mockDate = new Date(2026, 0, 1, 12, 30, 15);
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system.updateLocalTimePhase(200000); // first call -> computeCount = 1

    // Should skip because 5000ms < 10000ms
    system.updateLocalTimePhase(205000); 

    assert.strictEqual(computeCount, 1, 'Should throttle within 10s GC avoidance window');

    mockDate = new Date(2026, 0, 1, 12, 30, 45); // still same minute
    // Bypass GC throttle by jumping 15s
    system.updateLocalTimePhase(215000); 

    assert.strictEqual(computeCount, 1, 'Should not recompute in the same minute even if GC window passed');
    assert.strictEqual(system.getCurrentState().timePhase, 'day');
  });

  await t.test('accepts normalized weather payload fields', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      timePhase: 'night',
      weatherKind: 'rain',
      intensity: 'heavy',
    });

    const state = system.getCurrentState();
    assert.strictEqual(state.weatherKind, 'rain');
    assert.strictEqual(state.timePhase, 'night');
    assert.strictEqual(state.intensity, 'heavy');
  });

  await t.test('continues to derive weather kind from Open-Meteo weather codes', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 71,
      isDay: true,
    });

    const state = system.getCurrentState();
    assert.strictEqual(state.weatherKind, 'snow');
    assert.strictEqual(state.intensity, 'normal');
  });

  await t.test('uses precipitation phase fields to correct snow codes that are actually rain', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 85,
      rain: 1.2,
      showers: 0.4,
      snowfall: 0,
      isDay: true,
    });

    assert.strictEqual(system.getCurrentState().weatherKind, 'rain');
  });

  await t.test('maps thunderstorm weather codes to thunderstorm', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 95,
      rain: 3,
      snowfall: 0,
      isDay: true,
    });

    assert.strictEqual(system.getCurrentState().weatherKind, 'thunderstorm');

    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 99,
      isDay: true,
    });

    assert.strictEqual(system.getCurrentState().weatherKind, 'thunderstorm');
  });

  await t.test('uses strong wind as primary weather for clear and cloudy payloads', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 1,
      windSpeed: 19.8,
      windGusts: 0,
      isDay: true,
    });

    const state = system.getCurrentState();
    assert.strictEqual(state.weatherKind, 'windy');
    assert.strictEqual(state.windIntensity, 'normal');
  });

  await t.test('does not show wind effects below the ambience threshold', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 1,
      windSpeed: 19.7,
      windGusts: 28.7,
      isDay: true,
    });

    const state = system.getCurrentState();
    assert.strictEqual(state.weatherKind, 'cloudy');
    assert.strictEqual(state.windIntensity, 'none');
  });

  await t.test('uses gusts to derive wind intensity', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 0,
      windSpeed: 0,
      windGusts: 28.8,
      isDay: true,
    });

    let state = system.getCurrentState();
    assert.strictEqual(state.weatherKind, 'windy');
    assert.strictEqual(state.windIntensity, 'normal');

    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 0,
      windSpeed: 0,
      windGusts: 45,
      isDay: true,
    });

    state = system.getCurrentState();
    assert.strictEqual(state.weatherKind, 'windy');
    assert.strictEqual(state.windIntensity, 'heavy');
  });

  await t.test('keeps precipitation primary weather while exposing wind intensity', () => {
    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 61,
      windSpeed: 28.8,
      windGusts: 0,
      isDay: true,
    });

    const state = system.getCurrentState();
    assert.strictEqual(state.weatherKind, 'rain');
    assert.strictEqual(state.windIntensity, 'heavy');
  });

  await t.test('does not override dusk time phase to night when weather reports isDay: false after sunset', () => {
    system._lastComputedMinute = -1;
    system._lastCheckTimestamp = 0;
    system._getCurrentDate = () => new Date(2026, 6, 2, 19, 30, 0); // 19:30 is dusk
    system.updateLocalTimePhase(999999);

    system.setWeatherPayload({
      active: true,
      stale: false,
      weatherCode: 0,
      isDay: false,
    });

    const state = system.getCurrentState();
    assert.strictEqual(state.timePhase, 'dusk');
    assert.strictEqual(state.isDay, false);
  });
});

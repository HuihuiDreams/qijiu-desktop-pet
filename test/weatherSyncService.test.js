const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { normalizeSettings, DEFAULT_WEATHER_SYNC_SETTINGS, GEOCODE_TIMEOUT_MS } = require('../weatherSyncService');

describe('WeatherSyncService - Settings Normalization', () => {
  it('should return default settings for invalid or missing inputs', () => {
    assert.deepStrictEqual(normalizeSettings(null), DEFAULT_WEATHER_SYNC_SETTINGS);
    assert.deepStrictEqual(normalizeSettings(undefined), DEFAULT_WEATHER_SYNC_SETTINGS);
    assert.deepStrictEqual(normalizeSettings('invalid'), DEFAULT_WEATHER_SYNC_SETTINGS);
    assert.deepStrictEqual(normalizeSettings(123), DEFAULT_WEATHER_SYNC_SETTINGS);
  });

  it('should use default for fields that are missing in the object', () => {
    const raw = {};
    const result = normalizeSettings(raw);
    assert.strictEqual(result.enabled, false);
    assert.strictEqual(result.city, '');
    assert.strictEqual(result.lat, null);
    assert.strictEqual(result.lon, null);
    assert.strictEqual(result.refreshIntervalMinutes, 60);
    assert.strictEqual(result.schemaVersion, 1);
  });

  it('should preserve valid fields', () => {
    const raw = {
      enabled: true,
      city: ' Shanghai ',
      lat: 31.22,
      lon: 121.46,
      refreshIntervalMinutes: 120,
      schemaVersion: 1
    };
    const result = normalizeSettings(raw);
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.city, 'Shanghai'); // trims
    assert.strictEqual(result.lat, 31.22);
    assert.strictEqual(result.lon, 121.46);
    assert.strictEqual(result.refreshIntervalMinutes, 120);
    assert.strictEqual(result.schemaVersion, 1);
  });

  it('should drop invalid types for lat and lon', () => {
    const raw = {
      lat: '31.22', // string
      lon: NaN,
    };
    const result = normalizeSettings(raw);
    assert.strictEqual(result.lat, null);
    assert.strictEqual(result.lon, null);
  });

  it('should clamp refresh interval to lower bound of 30', () => {
    const raw = { refreshIntervalMinutes: 10 };
    const result = normalizeSettings(raw);
    assert.strictEqual(result.refreshIntervalMinutes, 30);
  });

  it('should use default interval if interval is NaN', () => {
    const raw = { refreshIntervalMinutes: 'abc' };
    const result = normalizeSettings(raw);
    assert.strictEqual(result.refreshIntervalMinutes, 60);
  });
});

describe('WeatherSyncService - fetchWeather', () => {
  const { fetchWeather, resetWeatherCache } = require('../weatherSyncService');

  beforeEach(() => {
    resetWeatherCache();
  });

  it('should return inactive if disabled or missing coordinates', async () => {
    assert.deepStrictEqual(await fetchWeather({ enabled: false }), { active: false });
    assert.deepStrictEqual(await fetchWeather({ enabled: true, lat: null, lon: 10 }), { active: false });
  });

  it('should fetch and return simplified payload', async () => {
    const mockProvider = {
      async fetch(lat, lon, controller) {
        return {
          current_weather: {
            temperature: 25.5,
            weathercode: 3,
            is_day: 1
          }
        };
      }
    };

    const result = await fetchWeather({ enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 }, mockProvider);
    assert.strictEqual(result.active, true);
    assert.strictEqual(result.temperature, 25.5);
    assert.strictEqual(result.weatherCode, 3);
    assert.strictEqual(result.isDay, true);
    assert.strictEqual(result.fallback, false);
    assert.ok(result.timestamp > 0);
  });

  it('should return fallback payload on provider error', async () => {
    const mockProvider = {
      async fetch(lat, lon, controller) {
        throw new Error('Network Error');
      }
    };

    const result = await fetchWeather({ enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 }, mockProvider);
    assert.strictEqual(result.active, true);
    assert.strictEqual(result.temperature, null);
    assert.strictEqual(result.weatherCode, -1);
    assert.strictEqual(result.fallback, true);
  });

  it('should cache successful responses within TTL', async () => {
    let callCount = 0;
    const mockProvider = {
      async fetch() {
        callCount++;
        return { current_weather: { temperature: 20 } };
      }
    };

    const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 };
    await fetchWeather(settings, mockProvider);
    await fetchWeather(settings, mockProvider);

    assert.strictEqual(callCount, 1);
  });

  it('should retry sooner after a fallback than after a successful fetch', async () => {
    const { FALLBACK_TTL_MS } = require('../weatherSyncService');
    let callCount = 0;
    const failingProvider = {
      async fetch() {
        callCount++;
        throw new Error('Network Error');
      }
    };

    const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 };

    // First call — should fail and return fallback
    const result = await fetchWeather(settings, failingProvider);
    assert.strictEqual(result.fallback, true);
    assert.strictEqual(callCount, 1);

    // Immediate second call — still within FALLBACK_TTL_MS, should return cached fallback
    const cached = await fetchWeather(settings, failingProvider);
    assert.strictEqual(cached.fallback, true);
    assert.strictEqual(callCount, 1, 'should not retry within FALLBACK_TTL_MS');

    // FALLBACK_TTL_MS is less than the full refresh interval (60 min),
    // confirming that the fallback cache window is shorter than a successful fetch.
    assert.ok(FALLBACK_TTL_MS < 60 * 60 * 1000, 'FALLBACK_TTL_MS should be shorter than the refresh interval');
    assert.ok(FALLBACK_TTL_MS <= 10 * 60 * 1000, 'FALLBACK_TTL_MS should be at most 10 minutes');
  });
});

describe('WeatherSyncService - processSettingsChange', () => {
  const { processSettingsChange, resetWeatherCache } = require('../weatherSyncService');

  beforeEach(() => {
    resetWeatherCache();
  });

  it('should not geocode if disabled', async () => {
    const mockProvider = {
      async geocode() { throw new Error('Should not be called'); }
    };
    const newSettings = { enabled: false, city: 'Shanghai', lat: null, lon: null };
    const result = await processSettingsChange(newSettings, mockProvider);
    assert.strictEqual(result.lat, null);
  });

  it('should perform geocode if city provided but no coordinates', async () => {
    const mockProvider = {
      async geocode(city) {
        if (city === 'Shanghai') return { lat: 31.22, lon: 121.46 };
        return null;
      }
    };
    
    const newSettings = { enabled: true, city: 'Shanghai', lat: null, lon: null };
    const result = await processSettingsChange(newSettings, mockProvider);
    assert.strictEqual(result.lat, 31.22);
    assert.strictEqual(result.lon, 121.46);
  });

  it('should handle geocode failure gracefully without crashing', async () => {
    const mockProvider = {
      async geocode() { throw new Error('API Error'); }
    };
    
    const newSettings = { enabled: true, city: 'Shanghai', lat: null, lon: null };
    const result = await processSettingsChange(newSettings, mockProvider);
    assert.strictEqual(result.lat, null);
    assert.strictEqual(result.lon, null);
  });

  it('should allow geocoding more time than regular weather fetches', () => {
    assert.ok(GEOCODE_TIMEOUT_MS >= 30000);
  });

  it('should use Electron net for default geocode requests when available', async () => {
    const originalLoad = Module._load;
    let requestedUrl = null;

    Module._load = function(request, parent, isMain) {
      if (request === 'electron') {
        return {
          net: {
            request(url) {
              requestedUrl = url;
              const req = new EventEmitter();
              req.abort = () => {};
              req.end = () => {
                const res = new EventEmitter();
                res.statusCode = 200;
                res.resume = () => {};
                res.setEncoding = () => {};

                setImmediate(() => {
                  req.emit('response', res);
                  res.emit('data', Buffer.from(JSON.stringify({
                    results: [{ latitude: 35.68, longitude: 139.76 }]
                  })));
                  res.emit('end');
                });
              };
              return req;
            }
          }
        };
      }

      return originalLoad.apply(this, arguments);
    };

    try {
      const result = await processSettingsChange({ enabled: true, city: 'Tokyo', lat: null, lon: null });
      assert.match(requestedUrl, /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/);
      assert.strictEqual(result.lat, 35.68);
      assert.strictEqual(result.lon, 139.76);
    } finally {
      Module._load = originalLoad;
    }
  });
});

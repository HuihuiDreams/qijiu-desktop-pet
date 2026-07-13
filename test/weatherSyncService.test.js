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
  const { FALLBACK_TTL_MS, fetchWeather, resetWeatherCache } = require('../weatherSyncService');

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
            is_day: 1,
            windspeed: 32.25,
            winddirection: 185
          }
        };
      }
    };

    const result = await fetchWeather({ enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 }, mockProvider);
    assert.strictEqual(result.active, true);
    assert.strictEqual(result.temperature, 25.5);
    assert.strictEqual(result.weatherCode, 3);
    assert.strictEqual(result.isDay, true);
    assert.strictEqual(result.windSpeed, 32.3);
    assert.strictEqual(result.windDirection, 185);
    assert.strictEqual(result.windGusts, null);
    assert.strictEqual(result.fallback, false);
    assert.ok(result.timestamp > 0);
  });

  it('should fetch current Open-Meteo payload fields including wind gusts', async () => {
    const mockProvider = {
      async fetch() {
        return {
          current: {
            temperature_2m: 18.74,
            weather_code: 95,
            is_day: 0,
            precipitation: 3.24,
            rain: 2.15,
            showers: 1.05,
            snowfall: 0,
            wind_speed_10m: 41.25,
            wind_direction_10m: 275,
            wind_gusts_10m: 62.88
          }
        };
      }
    };

    const result = await fetchWeather({ enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 }, mockProvider);
    assert.strictEqual(result.temperature, 18.7);
    assert.strictEqual(result.weatherCode, 95);
    assert.strictEqual(result.isDay, false);
    assert.strictEqual(result.precipitation, 3.2);
    assert.strictEqual(result.rain, 2.1);
    assert.strictEqual(result.showers, 1.1);
    assert.strictEqual(result.snowfall, 0);
    assert.strictEqual(result.windSpeed, 41.3);
    assert.strictEqual(result.windDirection, 275);
    assert.strictEqual(result.windGusts, 62.9);
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

  it('should refetch after successful cache expires', async () => {
    const originalNow = Date.now;
    let now = 1000000;
    Date.now = () => now;

    try {
      let callCount = 0;
      const mockProvider = {
        async fetch() {
          callCount++;
          return { current_weather: { temperature: 20 + callCount } };
        }
      };

      const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 30 };
      const first = await fetchWeather(settings, mockProvider);
      const cached = await fetchWeather(settings, mockProvider);

      assert.strictEqual(callCount, 1);
      assert.strictEqual(first.temperature, 21);
      assert.strictEqual(cached.temperature, 21);

      now += 30 * 60 * 1000 + 1;
      const refreshed = await fetchWeather(settings, mockProvider);

      assert.strictEqual(callCount, 2);
      assert.strictEqual(refreshed.temperature, 22);
    } finally {
      Date.now = originalNow;
    }
  });

  it('should retry sooner after a fallback than after a successful fetch', async () => {
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

  it('should retry after fallback cache expires', async () => {
    const originalNow = Date.now;
    let now = 2000000;
    Date.now = () => now;

    try {
      let callCount = 0;
      const provider = {
        async fetch() {
          callCount++;
          if (callCount === 1) throw new Error('Network Error');
          return { current_weather: { temperature: 18, weathercode: 0, is_day: 1 } };
        }
      };

      const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 };
      const fallback = await fetchWeather(settings, provider);
      const cachedFallback = await fetchWeather(settings, provider);

      assert.strictEqual(fallback.fallback, true);
      assert.strictEqual(cachedFallback.fallback, true);
      assert.strictEqual(callCount, 1);

      now += FALLBACK_TTL_MS + 1;
      const retried = await fetchWeather(settings, provider);

      assert.strictEqual(callCount, 2);
      assert.strictEqual(retried.fallback, false);
      assert.strictEqual(retried.temperature, 18);
    } finally {
      Date.now = originalNow;
    }
  });

  it('should sanitize malformed and out-of-range weather values (TH-02 / SBP-002)', async () => {
    const provider = {
      async fetch() {
        return {
          current: {
            temperature_2m: 9999, // out of bounds
            weather_code: 'malformed_string', // invalid number
            is_day: 1,
            precipitation: 9999,
            rain: -1,
            showers: 'heavy',
            snowfall: -0.1,
            wind_speed_10m: -1,
            wind_direction_10m: 999,
            wind_gusts_10m: 'fast'
          }
        };
      }
    };
    const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 };
    const result = await fetchWeather(settings, provider);
    assert.strictEqual(result.temperature, null);
    assert.strictEqual(result.weatherCode, -1);
    assert.strictEqual(result.precipitation, null);
    assert.strictEqual(result.rain, null);
    assert.strictEqual(result.showers, null);
    assert.strictEqual(result.snowfall, null);
    assert.strictEqual(result.windSpeed, null);
    assert.strictEqual(result.windDirection, null);
    assert.strictEqual(result.windGusts, null);
  });

  it('should treat null and empty string fields as missing and fall back without coercing to 0', async () => {
    const provider = {
      async fetch() {
        return {
          current: {
            temperature_2m: null,
            weather_code: null,
            is_day: 1,
            precipitation: null,
            rain: '',
            showers: null,
            snowfall: null,
            wind_speed_10m: null,
            wind_direction_10m: '',
            wind_gusts_10m: null
          },
          current_weather: {
            temperature: 22.5,
            weathercode: 3
          }
        };
      }
    };
    const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 };
    const result = await fetchWeather(settings, provider);
    assert.strictEqual(result.temperature, 22.5);
    assert.strictEqual(result.weatherCode, 3);
    assert.strictEqual(result.precipitation, null);
    assert.strictEqual(result.rain, null);
    assert.strictEqual(result.showers, null);
    assert.strictEqual(result.snowfall, null);
    assert.strictEqual(result.windSpeed, null);
    assert.strictEqual(result.windDirection, null);
    assert.strictEqual(result.windGusts, null);
  });

  it('should abort an in-flight weather request before starting a new one', async () => {
    let firstController = null;
    let callCount = 0;
    const provider = {
      fetch(lat, lon, controller) {
        callCount++;
        if (callCount === 1) {
          firstController = controller;
          return new Promise((resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          });
        }

        return Promise.resolve({ current_weather: { temperature: 18, weathercode: 1, is_day: 0 } });
      }
    };

    const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 };
    const firstRequest = fetchWeather(settings, provider);
    const second = await fetchWeather(settings, provider);
    const first = await firstRequest;

    assert.strictEqual(firstController.signal.aborted, true);
    assert.strictEqual(first.fallback, true);
    assert.strictEqual(second.fallback, false);
    assert.strictEqual(second.temperature, 18);
    assert.strictEqual(callCount, 2);
  });

  it('should fetch weather through the default HTTPS transport when Electron net is unavailable', async () => {
    const https = require('https');
    const originalGet = https.get;
    const originalLoad = Module._load;
    let requestedUrl = null;

    Module._load = function(request) {
      if (request === 'electron') {
        throw new Error('electron unavailable');
      }
      return originalLoad.apply(this, arguments);
    };
    https.get = (url, options, callback) => {
      requestedUrl = url;
      const req = new EventEmitter();
      setImmediate(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.setEncoding = () => {};
        callback(res);
        res.emit('data', JSON.stringify({
          current_weather: { temperature: 16.25, weathercode: 2, is_day: 1 }
        }));
        res.emit('end');
      });
      return req;
    };

    try {
      const result = await fetchWeather({ enabled: true, lat: 35.6, lon: 139.7, refreshIntervalMinutes: 60 });
      assert.match(requestedUrl, /^https:\/\/api\.open-meteo\.com\/v1\/forecast/);
      assert.strictEqual(result.temperature, 16.3);
      assert.strictEqual(result.weatherCode, 2);
      assert.strictEqual(result.isDay, true);
    } finally {
      https.get = originalGet;
      Module._load = originalLoad;
    }
  });
});

describe('WeatherSyncService - processSettingsChange', () => {
  const { processSettingsChange, resetWeatherCache, fetchWeather } = require('../weatherSyncService');

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

  it('should ignore malformed or out-of-bounds geocoding API payloads (TH-02 / SBP-002)', async () => {
    const originalLoad = Module._load;
    Module._load = function(request) {
      if (request === 'electron') {
        return {
          net: {
            request() {
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
                    results: [{ latitude: 999, longitude: 'invalid' }]
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
      const result = await processSettingsChange({ enabled: true, city: 'Atlantis', lat: null, lon: null });
      assert.strictEqual(result.lat, null);
      assert.strictEqual(result.lon, null);
    } finally {
      Module._load = originalLoad;
    }
  });

  it('should handle non-2xx Electron net geocode responses as failed lookups', async () => {
    const originalLoad = Module._load;
    Module._load = function(request) {
      if (request === 'electron') {
        return {
          net: {
            request() {
              const req = new EventEmitter();
              req.abort = () => {};
              req.end = () => {
                const res = new EventEmitter();
                res.statusCode = 500;
                res.resume = () => {
                  res.resumed = true;
                };
                setImmediate(() => {
                  req.emit('response', res);
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
      const result = await processSettingsChange({ enabled: true, city: 'Server Error City', lat: null, lon: null });
      assert.strictEqual(result.lat, null);
      assert.strictEqual(result.lon, null);
    } finally {
      Module._load = originalLoad;
    }
  });

  it('should handle invalid Electron net JSON as a failed geocode lookup', async () => {
    const originalLoad = Module._load;
    Module._load = function(request) {
      if (request === 'electron') {
        return {
          net: {
            request() {
              const req = new EventEmitter();
              req.abort = () => {};
              req.end = () => {
                const res = new EventEmitter();
                res.statusCode = 200;
                res.resume = () => {};
                res.setEncoding = () => {};
                setImmediate(() => {
                  req.emit('response', res);
                  res.emit('data', Buffer.from('{bad json'));
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
      const result = await processSettingsChange({ enabled: true, city: 'Malformed City', lat: null, lon: null });
      assert.strictEqual(result.lat, null);
      assert.strictEqual(result.lon, null);
    } finally {
      Module._load = originalLoad;
    }
  });

  it('should reset cached weather when coordinates change explicitly', async () => {
    let callCount = 0;
    const provider = {
      async fetch() {
        callCount++;
        return { current_weather: { temperature: 10 + callCount, weathercode: 0, is_day: 1 } };
      }
    };

    const first = await fetchWeather({ enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 }, provider);
    const updatedSettings = await processSettingsChange({
      enabled: true,
      city: '',
      lat: 11,
      lon: 21,
      _oldLat: 10,
      _oldLon: 20,
      refreshIntervalMinutes: 60,
    });
    const second = await fetchWeather(updatedSettings, provider);

    assert.strictEqual(first.temperature, 11);
    assert.strictEqual(second.temperature, 12);
    assert.strictEqual(callCount, 2);
  });

  it('should keep cached weather when coordinates are unchanged', async () => {
    let callCount = 0;
    const provider = {
      async fetch() {
        callCount++;
        return { current_weather: { temperature: 20 + callCount, weathercode: 0, is_day: 1 } };
      }
    };

    const settings = { enabled: true, lat: 10, lon: 20, refreshIntervalMinutes: 60 };
    const first = await fetchWeather(settings, provider);
    const unchangedSettings = await processSettingsChange({
      enabled: true,
      city: '',
      lat: 10,
      lon: 20,
      _oldLat: 10,
      _oldLon: 20,
      refreshIntervalMinutes: 60,
    });
    const second = await fetchWeather(unchangedSettings, provider);

    assert.strictEqual(first.temperature, 21);
    assert.strictEqual(second.temperature, 21);
    assert.strictEqual(callCount, 1);
  });
});

describe('WeatherSyncService - resolveCityToCoordinates and Aliases', () => {
  const { resolveCityToCoordinates, WELL_KNOWN_CITY_ALIASES } = require('../weatherSyncService');

  it('should expose common well-known city aliases', () => {
    assert.strictEqual(WELL_KNOWN_CITY_ALIASES['东京'], 'Tokyo');
    assert.strictEqual(WELL_KNOWN_CITY_ALIASES['伦敦'], 'London');
    assert.strictEqual(WELL_KNOWN_CITY_ALIASES['大阪'], 'Osaka');
  });

  it('should resolve city aliases and sort multiple geocode candidates by population descending', async () => {
    const originalLoad = Module._load;
    let requestedUrl = '';

    Module._load = function(request) {
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
                  const payload = JSON.stringify({
                    results: [
                      { name: '东京村', latitude: 32.20, longitude: 119.28, population: undefined },
                      { name: 'Tokyo', latitude: 35.6895, longitude: 139.6917, population: 9733276 },
                      { name: 'Tokyo Suburb', latitude: 35.50, longitude: 139.50, population: 150000 },
                    ]
                  });
                  res.emit('data', Buffer.from(payload));
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
      const result = await resolveCityToCoordinates(' 东京 ');
      assert.ok(requestedUrl.includes('name=Tokyo&count=10'), `Expected URL to query name=Tokyo&count=10, got: ${requestedUrl}`);
      assert.strictEqual(result.lat, 35.6895);
      assert.strictEqual(result.lon, 139.6917);
    } finally {
      Module._load = originalLoad;
    }
  });

  it('should return null when geocode returns no valid coordinates', async () => {
    const originalLoad = Module._load;
    Module._load = function(request) {
      if (request === 'electron') {
        return {
          net: {
            request() {
              const req = new EventEmitter();
              req.abort = () => {};
              req.end = () => {
                const res = new EventEmitter();
                res.statusCode = 200;
                res.resume = () => {};
                res.setEncoding = () => {};
                setImmediate(() => {
                  req.emit('response', res);
                  res.emit('data', Buffer.from(JSON.stringify({ results: [] })));
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
      const result = await resolveCityToCoordinates('UnknownCity12345');
      assert.strictEqual(result, null);
    } finally {
      Module._load = originalLoad;
    }
  });

  it('should reject null, empty, and boolean coordinates instead of coercing them to zero', async () => {
    const originalLoad = Module._load;
    Module._load = function(request) {
      if (request === 'electron') {
        return {
          net: {
            request() {
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
                    results: [
                      { latitude: null, longitude: null },
                      { latitude: '', longitude: '' },
                      { latitude: false, longitude: false },
                    ],
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
      const result = await resolveCityToCoordinates('InvalidCoordinates');
      assert.strictEqual(result, null);
    } finally {
      Module._load = originalLoad;
    }
  });
});

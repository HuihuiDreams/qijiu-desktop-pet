/**
 * weatherSyncService.js — 天气感知与时空同步主进程服务
 */
const https = require('https');

const DEFAULT_WEATHER_SYNC_SETTINGS = {
  enabled: false,
  city: '',
  lat: null,
  lon: null,
  refreshIntervalMinutes: 60,
  schemaVersion: 1,
};

const MIN_REFRESH_INTERVAL_MINUTES = 30;

/**
 * 规范化持久化存储的设置
 * @param {*} raw 
 * @returns 
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEATHER_SYNC_SETTINGS };

  // schema fallback
  if (raw.schemaVersion !== 1) {
    // 未来如果升 schema 版本，可以在这里做迁移
    // 目前发现不匹配，或者没有，直接取其存在的部分或者重置
  }

  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_WEATHER_SYNC_SETTINGS.enabled;
  const city = typeof raw.city === 'string' ? raw.city.trim() : DEFAULT_WEATHER_SYNC_SETTINGS.city;
  
  const lat = (typeof raw.lat === 'number' && !Number.isNaN(raw.lat)) ? raw.lat : null;
  const lon = (typeof raw.lon === 'number' && !Number.isNaN(raw.lon)) ? raw.lon : null;

  let refreshIntervalMinutes = Number(raw.refreshIntervalMinutes);
  if (!Number.isFinite(refreshIntervalMinutes)) {
    refreshIntervalMinutes = DEFAULT_WEATHER_SYNC_SETTINGS.refreshIntervalMinutes;
  } else {
    refreshIntervalMinutes = Math.max(MIN_REFRESH_INTERVAL_MINUTES, refreshIntervalMinutes);
  }

  return {
    enabled,
    city,
    lat,
    lon,
    refreshIntervalMinutes,
    schemaVersion: 1,
  };
}

let currentWeatherData = null;
let lastWeatherFetchTime = 0;
let fetchTimeoutController = null;
const WEATHER_FETCH_TIMEOUT_MS = 4000;
const GEOCODE_TIMEOUT_MS = 30000;
// 请求失败后的短 TTL：最多 10 分钟后重试，不必等满整个刷新周期
const FALLBACK_TTL_MS = 10 * 60 * 1000;

function getElectronNet() {
  try {
    const electron = require('electron');
    return electron?.net && typeof electron.net.request === 'function' ? electron.net : null;
  } catch (err) {
    return null;
  }
}

function parseJsonResponse(data) {
  return JSON.parse(data);
}

function requestJsonWithElectronNet(electronNet, url, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = electronNet.request(url);

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      callback(value);
    };

    const onAbort = () => {
      try {
        req.abort();
      } catch (err) {
        // Ignore abort cleanup errors; the original abort is the meaningful failure.
      }
      finish(reject, new Error('The operation was aborted'));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    req.on('response', (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (typeof res.resume === 'function') res.resume();
        finish(reject, new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          finish(resolve, parseJsonResponse(data));
        } catch (e) {
          finish(reject, e);
        }
      });
      res.on('error', err => finish(reject, err));
    });

    req.on('error', err => finish(reject, err));
    req.end();
  });
}

function requestJsonWithHttps(url, signal) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { signal }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(parseJsonResponse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
  });
}

function requestJson(url, controller) {
  const electronNet = getElectronNet();
  if (electronNet) {
    return requestJsonWithElectronNet(electronNet, url, controller?.signal);
  }

  return requestJsonWithHttps(url, controller?.signal);
}

function getRequestTransportLabel() {
  return getElectronNet() ? 'electron-net' : 'node-https';
}

function fetchOpenMeteoWeather(lat, lon, controller) {
  const currentFields = [
    'temperature_2m',
    'is_day',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
  ].join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${currentFields}&wind_speed_unit=kmh`;
  return requestJson(url, controller);
}

function resolveCityToCoordinates(cityName, controller) {
  const encodedName = encodeURIComponent(cityName);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodedName}&count=1&language=zh&format=json`;
  return requestJson(url, controller).then((parsed) => {
    if (parsed.results && parsed.results.length > 0) {
      // Based on OWASP guidance: Validate all external input at the system boundary (SBP-002 / TH-02)
      const first = parsed.results[0];
      const lat = Number(first?.latitude);
      const lon = Number(first?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { lat, lon };
      }
    }

    return null; // Not found
  });
}

const defaultProvider = {
  fetch: fetchOpenMeteoWeather,
  geocode: resolveCityToCoordinates
};

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeRangeNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return Number(number.toFixed(1));
}

function normalizeWindDirection(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 360) return null;
  return Math.round(number);
}

async function fetchWeather(settings, provider = defaultProvider) {
  if (!settings.enabled || settings.lat === null || settings.lon === null) {
    return { active: false };
  }

  const now = Date.now();
  const ttlMs = settings.refreshIntervalMinutes * 60 * 1000;

  if (currentWeatherData && (now - lastWeatherFetchTime) < ttlMs) {
    return currentWeatherData;
  }

  if (fetchTimeoutController) {
    fetchTimeoutController.abort();
  }

  fetchTimeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    if (fetchTimeoutController) fetchTimeoutController.abort();
  }, WEATHER_FETCH_TIMEOUT_MS);

  try {
    const response = await provider.fetch(settings.lat, settings.lon, fetchTimeoutController);
    const current = response.current || {};
    const legacy = response.current_weather || {};
    
    // Based on OWASP guidance: Validate all external input at the system boundary (SBP-002 / TH-02)
    const rawCode = firstFiniteNumber(current.weather_code, current.weathercode, legacy.weathercode);
    const rawTemp = firstFiniteNumber(current.temperature_2m, current.temperature, legacy.temperature);
    const weatherCode = Number.isFinite(rawCode) && rawCode >= 0 && rawCode <= 99 ? Math.floor(rawCode) : -1;
    const temperature = Number.isFinite(rawTemp) && rawTemp >= -100 && rawTemp <= 100 ? Number(rawTemp.toFixed(1)) : null;
    const windSpeed = normalizeRangeNumber(
      current.wind_speed_10m ?? legacy.windspeed ?? legacy.wind_speed_10m,
      0,
      500,
    );
    const windDirection = normalizeWindDirection(
      current.wind_direction_10m ?? legacy.winddirection ?? legacy.wind_direction_10m,
    );
    const windGusts = normalizeRangeNumber(
      current.wind_gusts_10m ?? legacy.windgusts ?? legacy.wind_gusts_10m,
      0,
      500,
    );

    const payload = {
      active: true,
      weatherCode,
      temperature,
      isDay: (current.is_day ?? legacy.is_day) === 1,
      windSpeed,
      windDirection,
      windGusts,
      timestamp: now,
      fallback: false
    };

    currentWeatherData = payload;
    lastWeatherFetchTime = now;
    return payload;

  } catch (err) {
    const fallback = {
      active: true,
      weatherCode: -1,
      temperature: null,
      isDay: true,
      windSpeed: null,
      windDirection: null,
      windGusts: null,
      fallback: true,
      timestamp: now
    };
    currentWeatherData = fallback;
    // 失败后只缓存 FALLBACK_TTL_MS（10 分钟），让短暂断网后尽快重试
    lastWeatherFetchTime = now - (settings.refreshIntervalMinutes * 60 * 1000) + FALLBACK_TTL_MS;
    return fallback;
  } finally {
    clearTimeout(timeoutId);
    fetchTimeoutController = null;
  }
}

function resetWeatherCache() {
  currentWeatherData = null;
  lastWeatherFetchTime = 0;
  if (fetchTimeoutController) {
    fetchTimeoutController.abort();
    fetchTimeoutController = null;
  }
}

async function processSettingsChange(newSettings, provider = defaultProvider) {
  const norm = normalizeSettings(newSettings);
  if (!norm.enabled) return norm;

  // If we have a city but no coordinates, we need to geocode
  if (norm.city && (norm.lat === null || norm.lon === null)) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
    const startedAt = Date.now();
    const transport = provider === defaultProvider ? getRequestTransportLabel() : 'custom-provider';
    console.info(`[WeatherSync] Geocode started: timeoutMs=${GEOCODE_TIMEOUT_MS}, transport=${transport}`);
    try {
      const coords = await provider.geocode(norm.city, controller);
      if (coords) {
        norm.lat = coords.lat;
        norm.lon = coords.lon;
        // Invalidate cache since location changed
        resetWeatherCache();
        console.info(`[WeatherSync] Geocode succeeded after ${Date.now() - startedAt}ms`);
      }
    } catch (err) {
      console.warn(`[WeatherSync] Geocode failed after ${Date.now() - startedAt}ms (timeoutMs=${GEOCODE_TIMEOUT_MS}, transport=${transport}):`, err.message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // If coordinates changed explicitly or via geocode, reset cache
  if (norm.lat !== newSettings._oldLat || norm.lon !== newSettings._oldLon) {
    resetWeatherCache();
  }

  return norm;
}

module.exports = {
  DEFAULT_WEATHER_SYNC_SETTINGS,
  MIN_REFRESH_INTERVAL_MINUTES,
  GEOCODE_TIMEOUT_MS,
  FALLBACK_TTL_MS,
  normalizeSettings,
  fetchWeather,
  resetWeatherCache,
  processSettingsChange,
};

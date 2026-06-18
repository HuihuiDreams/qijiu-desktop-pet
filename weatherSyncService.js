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

function fetchOpenMeteoWeather(lat, lon, controller) {
  return new Promise((resolve, reject) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    
    const req = https.get(url, { signal: controller.signal }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
  });
}

function resolveCityToCoordinates(cityName, controller) {
  return new Promise((resolve, reject) => {
    const encodedName = encodeURIComponent(cityName);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodedName}&count=1&language=zh&format=json`;
    
    const req = https.get(url, { signal: controller?.signal }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.results && parsed.results.length > 0) {
            resolve({
              lat: parsed.results[0].latitude,
              lon: parsed.results[0].longitude,
            });
          } else {
            resolve(null); // Not found
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
  });
}

const defaultProvider = {
  fetch: fetchOpenMeteoWeather,
  geocode: resolveCityToCoordinates
};

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
    const cw = response.current_weather || {};
    
    const payload = {
      active: true,
      weatherCode: cw.weathercode ?? -1,
      temperature: cw.temperature ?? null,
      isDay: cw.is_day === 1,
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
      fallback: true,
      timestamp: now
    };
    currentWeatherData = fallback;
    lastWeatherFetchTime = now;
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
    const timeoutId = setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);
    try {
      const coords = await provider.geocode(norm.city, controller);
      if (coords) {
        norm.lat = coords.lat;
        norm.lon = coords.lon;
        // Invalidate cache since location changed
        resetWeatherCache();
      }
    } catch (err) {
      console.warn('[WeatherSync] Geocode failed:', err.message);
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
  normalizeSettings,
  fetchWeather,
  resetWeatherCache,
  processSettingsChange,
};

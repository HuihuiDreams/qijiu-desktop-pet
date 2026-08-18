/**
 * WeatherAwarenessSystem
 * 负责接收和解析天气/时段状态。
 * 在断网或未配置的情况下，回退到基于本地时间的清晨、白天、黄昏、深夜划分。
 */
const VALID_WIND_INTENSITIES = new Set(['none', 'light', 'normal', 'medium', 'heavy']);

class WeatherAwarenessSystem {
  constructor(config) {
    this.config = config;
    this.TIME_PHASES = config.TIME_PHASES || {
      morning: { startHour: 5, startMinute: 0 },
      day:     { startHour: 11, startMinute: 0 },
      dusk:    { startHour: 17, startMinute: 0 },
      evening: { startHour: 20, startMinute: 0 },
      night:   { startHour: 0, startMinute: 0 },
    };

    // 当前状态 (初始占位)
    this.currentState = {
      timePhase: 'day',
      weatherKind: 'clear',
      intensity: 'normal',
      windIntensity: 'none',
      isDay: true,
      stale: false
    };

    this.weatherPayload = null;

    this._lastComputedMinute = -1; // 用于按分钟更新 phase
    this._lastCheckTimestamp = 0;  // 用于避免高频分配 Date 对象的绝对时间戳 (毫秒)
  }

  /**
   * 暴露给测试用：允许注入假的时间对象
   */
  _getCurrentDate() {
    return new Date();
  }

  /**
   * 根据当前时间更新本地时段（纯离线或降级模式下）
   * 传入 currentTimestampMs 可以避免在 RAF 中每帧调用 Date.now()
   */
  updateLocalTimePhase(currentTimestampMs = Date.now()) {
    // 粗粒度节流：如果距离上次计算还不到 10 秒（10000ms），直接跳过
    // 这样在 60FPS 的游戏循环中，每 600 帧才会分配一个短命的 Date 对象，几乎消除了 GC 负担
    if (currentTimestampMs - this._lastCheckTimestamp < 10000) {
      return;
    }
    this._lastCheckTimestamp = currentTimestampMs;

    const now = this._getCurrentDate();
    const currentMinuteStr = now.getHours() * 60 + now.getMinutes();

    if (this._lastComputedMinute === currentMinuteStr) {
      return; // 同一分钟内不再计算
    }

    this._lastComputedMinute = currentMinuteStr;
    const phase = this.computePhase(now.getHours(), now.getMinutes());
    
    this.currentState.timePhase = phase;
    this.currentState.isDay = (phase === 'morning' || phase === 'day' || phase === 'dusk');
  }

  /**
   * 将当前时分换算为具体的 phase 字符串
   */
  computePhase(hour, minute) {
    const timeValue = hour * 60 + minute;
    
    const m = this.TIME_PHASES.morning;
    const d = this.TIME_PHASES.day;
    const du = this.TIME_PHASES.dusk;
    const n = this.TIME_PHASES.night;

    const e = this.TIME_PHASES.evening;

    const valM = m.startHour * 60 + m.startMinute;
    const valD = d.startHour * 60 + d.startMinute;
    const valDu = du.startHour * 60 + du.startMinute;
    const valE = e.startHour * 60 + e.startMinute;

    if (timeValue >= valM && timeValue < valD) return 'morning';
    if (timeValue >= valD && timeValue < valDu) return 'day';
    if (timeValue >= valDu && timeValue < valE) return 'dusk';
    if (timeValue >= valE) return 'evening'; // 20:00 - 23:59
    return 'night'; // [00:00 - 04:59]
  }

  setWeatherPayload(payload) {
    if (!payload || !payload.active || payload.stale) {
      this.weatherPayload = null;
      // 立即重置强制更新本地时段
      this._lastComputedMinute = -1;
      this.updateLocalTimePhase();
    } else {
      this.weatherPayload = payload;
    }
  }

  static parseWeatherCode(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2 || code === 45 || code === 48) return 'cloudy';
    if (code === 3) return 'overcast';
    if (code === 95 || code === 96 || code === 99) return 'thunderstorm';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    return 'unknown';
  }

  static precipitationToWeatherKind(payload, fallbackKind) {
    if (fallbackKind !== 'rain' && fallbackKind !== 'snow') return fallbackKind;

    const rain = Number(payload.rain);
    const showers = Number(payload.showers);
    const snowfall = Number(payload.snowfall);
    const rainTotal = (Number.isFinite(rain) && rain > 0 ? rain : 0)
      + (Number.isFinite(showers) && showers > 0 ? showers : 0);
    const snowTotal = Number.isFinite(snowfall) && snowfall > 0 ? snowfall : 0;

    if (rainTotal <= 0 && snowTotal <= 0) return fallbackKind;
    if (rainTotal > snowTotal) return 'rain';
    if (snowTotal > rainTotal) return 'snow';
    return fallbackKind;
  }

  static isKnownWeatherKind(kind) {
    return ['clear', 'cloudy', 'overcast', 'rain', 'snow', 'windy', 'thunderstorm', 'heat', 'unknown'].includes(kind);
  }

  static windToIntensity(windSpeed, windGusts) {
    const speed = Number(windSpeed);
    const validSpeed = Number.isFinite(speed) && speed >= 0 ? speed : 0;

    // 只基于平均风速进行判定，忽略阵风 (windGusts)
    if (validSpeed >= 28.8) return 'heavy';
    if (validSpeed >= 19.8) return 'normal';
    return 'none';
  }

  static normalizeWindIntensity(windIntensity, windSpeed, windGusts) {
    if (VALID_WIND_INTENSITIES.has(windIntensity)) {
      return windIntensity;
    }
    return WeatherAwarenessSystem.windToIntensity(windSpeed, windGusts);
  }

  /**
   * 将摄氏度温度转为粗粒度区间标签，供 renderer 台词/表现使用。
   * 不暴露精确温度值，符合隐私和 payload 精简约定。
   */
  static temperatureToBand(celsius) {
    const t = typeof celsius === 'number'
      ? celsius
      : typeof celsius === 'string' && celsius.trim() !== ''
        ? Number(celsius)
        : NaN;
    if (!Number.isFinite(t)) return null;
    if (t < 5)  return 'cold';
    if (t < 15) return 'cool';
    if (t < 25) return 'mild';
    if (t < 35) return 'warm';
    return 'hot';
  }

  getCurrentState() {
    if (this.weatherPayload && !this.weatherPayload.stale) {
      // 从 weatherPayload 中的 weatherCode 解析出 weatherKind
      const parsedKind = this.weatherPayload.fallback
        ? 'unknown'
        : WeatherAwarenessSystem.isKnownWeatherKind(this.weatherPayload.weatherKind)
          ? this.weatherPayload.weatherKind
          : WeatherAwarenessSystem.parseWeatherCode(this.weatherPayload.weatherCode);
      const precipKind = WeatherAwarenessSystem.precipitationToWeatherKind(this.weatherPayload, parsedKind);
      const rawWindIntensity = this.weatherPayload.fallback
        ? 'none'
        : WeatherAwarenessSystem.normalizeWindIntensity(
          this.weatherPayload.windIntensity,
          this.weatherPayload.windSpeed,
          this.weatherPayload.windGusts,
        );
      const temperatureBand = WeatherAwarenessSystem.temperatureToBand(this.weatherPayload.temperature);
      let weatherKind = (rawWindIntensity !== 'none' && (precipKind === 'clear' || precipKind === 'cloudy' || precipKind === 'overcast'))
        ? 'windy'
        : precipKind;

      if ((weatherKind === 'clear' || weatherKind === 'cloudy' || weatherKind === 'overcast' || weatherKind === 'windy') && temperatureBand === 'hot') {
        weatherKind = 'heat';
      }

      // 雷暴天气本身包含降雨与闪电双重动态元素，优先级高于大风，避免画面要素过多
      const windIntensity = weatherKind === 'thunderstorm' ? 'none' : rawWindIntensity;

      // 时间阶段(morning/day/dusk/night) 优先用本地计算出来的 currentState.timePhase
      let phase = this.TIME_PHASES[this.weatherPayload.timePhase]
        ? this.weatherPayload.timePhase
        : this.currentState.timePhase;

      return {
        ...this.currentState,
        timePhase: phase,
        weatherKind,
        intensity: typeof this.weatherPayload.intensity === 'string' ? this.weatherPayload.intensity : 'normal',
        windIntensity,
        temperatureBand,
        isDay: this.weatherPayload.isDay,
        stale: false,
      };
    }
    return {
      ...this.currentState,
      weatherKind: 'unknown',
      windIntensity: 'none',
      intensity: 'none'
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = WeatherAwarenessSystem;
}

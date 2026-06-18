/**
 * WeatherAwarenessSystem
 * 负责接收和解析天气/时段状态。
 * 在断网或未配置的情况下，回退到基于本地时间的清晨、白天、黄昏、深夜划分。
 */
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
    if (code === 1 || code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86 || code === 96 || code === 99) return 'snow';
    return 'unknown';
  }

  getCurrentState() {
    if (this.weatherPayload && !this.weatherPayload.stale) {
      // 从 weatherPayload 中的 weatherCode 解析出 weatherKind
      const parsedKind = this.weatherPayload.fallback 
        ? 'unknown' 
        : WeatherAwarenessSystem.parseWeatherCode(this.weatherPayload.weatherCode);

      // 时间阶段(morning/day/dusk/night) 优先用本地计算出来的 currentState.timePhase
      let phase = this.currentState.timePhase;
      
      // 如果天气服务明确告知现在天黑了 (!isDay)，但在本地时间里还是白天，就强制转入 night
      if (!this.weatherPayload.fallback && this.weatherPayload.isDay === false) {
        if (phase === 'morning' || phase === 'day' || phase === 'dusk') {
           phase = 'night';
        }
      }

      return {
        ...this.currentState,
        timePhase: phase,
        weatherKind: parsedKind,
        intensity: 'normal',
        temperatureBand: this.weatherPayload.temperature || null,
        isDay: this.weatherPayload.isDay,
        stale: false,
      };
    }
    return {
      ...this.currentState,
      weatherKind: 'unknown',
      intensity: 'none'
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = WeatherAwarenessSystem;
}

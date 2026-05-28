class WindowAwarenessSystem {
  constructor(electronAPI, options = {}) {
    this.electronAPI = electronAPI;
    this.enabled = options.enabled !== false;
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 2500;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.info = null;
    this.unsubscribe = null;
  }

  start() {
    if (!this.enabled || !this.electronAPI) return;

    if (typeof this.electronAPI.onActiveWindowInfo === 'function') {
      this.unsubscribe = this.electronAPI.onActiveWindowInfo((info) => {
        this.setActiveWindowInfo(info);
      });
    }

    if (typeof this.electronAPI.getActiveWindowInfo === 'function') {
      this.electronAPI.getActiveWindowInfo()
        .then((info) => this.setActiveWindowInfo(info))
        .catch(() => {
          this.setActiveWindowInfo({
            active: false,
            sampledAt: this.now(),
            source: 'unavailable',
            reason: 'request-failed',
            window: null,
            platform: null,
          });
        });
    }
  }

  stop() {
    if (typeof this.unsubscribe === 'function') {
      this.unsubscribe();
    }
    this.unsubscribe = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.info = null;
      this.stop();
    } else {
      this.start();
    }
  }

  normalizePlatform(platform) {
    if (!platform) return null;
    const area = {
      x: Number(platform.x),
      y: Number(platform.y),
      width: Number(platform.width),
      height: Number(platform.height),
      source: platform.source || 'active-window-top',
    };
    if (!Number.isFinite(area.x)
      || !Number.isFinite(area.y)
      || !Number.isFinite(area.width)
      || !Number.isFinite(area.height)
      || area.width <= 0
      || area.height <= 0) {
      return null;
    }
    return area;
  }

  setActiveWindowInfo(info) {
    this.info = {
      ...(info || {}),
      platform: this.normalizePlatform(info?.platform),
      sampledAt: Number.isFinite(Number(info?.sampledAt)) ? Number(info.sampledAt) : this.now(),
    };
  }

  getCurrentPlatform(now = this.now()) {
    if (!this.enabled || !this.info?.active || !this.info.platform) return null;
    if (now - this.info.sampledAt > this.ttlMs) return null;
    return this.info.platform;
  }

  getDebugInfo(now = this.now()) {
    return {
      enabled: this.enabled,
      info: this.info,
      platform: this.getCurrentPlatform(now),
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { WindowAwarenessSystem };
}

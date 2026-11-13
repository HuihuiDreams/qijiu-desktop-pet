const { getActiveWindowPlatformRelativeToBounds, isValidRect } = require('./displayBounds');
const { unavailableActiveWindowInfo } = require('./activeWindowProvider');

/**
 * Convert native window bounds (physical px on Windows) to DIP once at sampling time.
 */
function normalizeActiveWindowInfo(info, screenToDipRect) {
  const rawBounds = info?.window?.bounds;
  if (!info?.active || !info.window || !isValidRect(rawBounds) || typeof screenToDipRect !== 'function') {
    return info;
  }

  try {
    const converted = screenToDipRect(rawBounds);
    if (!isValidRect(converted)) {
      return info;
    }
    return {
      ...info,
      window: {
        ...info.window,
        bounds: {
          x: converted.x,
          y: converted.y,
          width: converted.width,
          height: converted.height,
        },
      },
    };
  } catch {
    return info;
  }
}

function buildActiveWindowPayload(activeWindowInfo, windowBounds, displays, options = {}) {
  const rawInfo = activeWindowInfo || unavailableActiveWindowInfo('unavailable');
  if (!rawInfo.active) {
    return {
      ...rawInfo,
      platform: null,
    };
  }

  const info = normalizeActiveWindowInfo(rawInfo, options.screenToDipRect);
  return {
    ...info,
    platform: getActiveWindowPlatformRelativeToBounds(info, windowBounds, displays, options),
  };
}

function rectKey(rect) {
  if (!rect) return 'null';
  return `${rect.x},${rect.y},${rect.width},${rect.height},${rect.source || ''}`;
}

function activeWindowPayloadKey(payload) {
  const windowInfo = payload?.window;
  if (!payload?.active || !windowInfo) {
    return `inactive:${payload?.source || ''}:${payload?.reason || ''}`;
  }

  return [
    'active',
    windowInfo.id || '',
    windowInfo.title || '',
    windowInfo.ownerName || '',
    rectKey(windowInfo.bounds),
    windowInfo.isMinimized ? 'min' : '',
    windowInfo.isMaximized ? 'max' : '',
    windowInfo.isFullScreen ? 'full' : '',
    rectKey(payload.platform),
  ].join('|');
}

function payloadSampleTime(payload) {
  const sampledAt = Number(payload?.sampledAt);
  return Number.isFinite(sampledAt) ? sampledAt : Date.now();
}

function createActiveWindowSampler(options) {
  const {
    provider,
    getWindowBounds,
    getDisplays,
    onChange,
    intervalMs = 1000,
    refreshUnchangedIntervalMs = Infinity,
    platformOptions,
    screenToDipRect,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
  } = options;
  let lastKey = null;
  let lastPayload = null;
  let lastEmittedAt = null;
  let timer = null;
  let sampling = false;

  function shouldEmit(nextKey, payload) {
    if (nextKey !== lastKey) return true;
    if (!Number.isFinite(refreshUnchangedIntervalMs) || refreshUnchangedIntervalMs <= 0) return false;
    if (lastEmittedAt == null) return true;
    return payloadSampleTime(payload) - lastEmittedAt >= refreshUnchangedIntervalMs;
  }

  function emit(payload, nextKey) {
    lastKey = nextKey;
    lastEmittedAt = payloadSampleTime(payload);
    onChange?.(payload);
  }

  async function sampleOnce() {
    if (sampling) return lastPayload;
    sampling = true;
    try {
      const providerInfo = await provider.getActiveWindowInfo();
      const buildOptions = typeof screenToDipRect === 'function'
        ? { ...(platformOptions || {}), screenToDipRect }
        : platformOptions;
      const payload = buildActiveWindowPayload(
        providerInfo,
        getWindowBounds(),
        getDisplays(),
        buildOptions,
      );
      const nextKey = activeWindowPayloadKey(payload);
      lastPayload = payload;
      if (shouldEmit(nextKey, payload)) {
        emit(payload, nextKey);
      }
      return payload;
    } catch {
      const payload = {
        ...unavailableActiveWindowInfo('provider-failed'),
        platform: null,
      };
      const nextKey = activeWindowPayloadKey(payload);
      lastPayload = payload;
      if (shouldEmit(nextKey, payload)) {
        emit(payload, nextKey);
      }
      return payload;
    } finally {
      sampling = false;
    }
  }

  function start() {
    if (timer) return;
    void sampleOnce();
    timer = setIntervalImpl(() => {
      void sampleOnce();
    }, intervalMs);
  }

  function stop() {
    if (!timer) return;
    clearIntervalImpl(timer);
    timer = null;
    if (typeof provider.dispose === 'function') {
      provider.dispose();
    } else if (typeof provider.stop === 'function') {
      provider.stop();
    }
  }

  function getLastPayload() {
    return lastPayload || {
      ...unavailableActiveWindowInfo('not-sampled'),
      platform: null,
    };
  }

  return {
    getLastPayload,
    sampleOnce,
    start,
    stop,
  };
}

module.exports = {
  activeWindowPayloadKey,
  buildActiveWindowPayload,
  createActiveWindowSampler,
};

const { getActiveWindowPlatformRelativeToBounds } = require('./displayBounds');
const { unavailableActiveWindowInfo } = require('./activeWindowProvider');

function buildActiveWindowPayload(activeWindowInfo, windowBounds, displays, options = {}) {
  const info = activeWindowInfo || unavailableActiveWindowInfo('unavailable');
  if (!info.active) {
    return {
      ...info,
      platform: null,
    };
  }

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

function createActiveWindowSampler(options) {
  const {
    provider,
    getWindowBounds,
    getDisplays,
    onChange,
    intervalMs = 1000,
    platformOptions,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
  } = options;
  let lastKey = null;
  let lastPayload = null;
  let timer = null;
  let sampling = false;

  async function sampleOnce() {
    if (sampling) return lastPayload;
    sampling = true;
    try {
      const providerInfo = await provider.getActiveWindowInfo();
      const payload = buildActiveWindowPayload(
        providerInfo,
        getWindowBounds(),
        getDisplays(),
        platformOptions,
      );
      const nextKey = activeWindowPayloadKey(payload);
      lastPayload = payload;
      if (nextKey !== lastKey) {
        lastKey = nextKey;
        onChange?.(payload);
      }
      return payload;
    } catch {
      const payload = {
        ...unavailableActiveWindowInfo('provider-failed'),
        platform: null,
      };
      const nextKey = activeWindowPayloadKey(payload);
      lastPayload = payload;
      if (nextKey !== lastKey) {
        lastKey = nextKey;
        onChange?.(payload);
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

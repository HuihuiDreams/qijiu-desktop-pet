/**
 * src/main/services/PresentationGuard.js
 * 统一的打扰守卫：判断当前系统前台窗口状态是否适合打扰。
 * 结合了原 presentationGuard 和 ScreensaverEligibilityGuard 的逻辑。
 */

const DEFAULT_MAX_CACHE_AGE_MS = 2000;

function createPresentationGuard(deps = {}, options = {}) {
  const {
    platform = process.platform,
    getActiveWindowInfo = null,
    getDisplays = null,
    now = Date.now,
  } = deps;

  const {
    mode = 'break-reminder', // 'break-reminder' | 'screensaver'
    maxCacheAgeMs = mode === 'screensaver' ? DEFAULT_MAX_CACHE_AGE_MS : null,
  } = options;

  // Linux / Unsupported behavior
  if (platform !== 'win32' && platform !== 'darwin') {
    return {
      canInterrupt() {
        if (mode === 'screensaver') {
          return { canInterrupt: false, reason: 'unsupported_platform' };
        }
        return { canInterrupt: true, reason: null };
      },
    };
  }

  return {
    canInterrupt() {
      if (!getActiveWindowInfo || typeof getActiveWindowInfo !== 'function') {
        if (mode === 'break-reminder' && platform === 'darwin') return { canInterrupt: true, reason: null };
        return { canInterrupt: false, reason: 'provider-error' };
      }

      let info;
      try {
        info = getActiveWindowInfo();
      } catch {
        if (mode === 'break-reminder' && platform === 'darwin') return { canInterrupt: true, reason: null };
        return { canInterrupt: false, reason: 'provider-error' };
      }

      if (info?.reason === 'disabled') {
        return { canInterrupt: true, reason: null };
      }

      if (!info || !info.active || !info.window) {
        if (mode === 'break-reminder' && platform === 'darwin') return { canInterrupt: true, reason: null };
        return { canInterrupt: false, reason: 'unknown-state' };
      }

      // Cache age validation (Screensaver strictness)
      if (maxCacheAgeMs !== null) {
        const ts = info.sampledAt ?? info.timestamp;
        if (!Number.isFinite(ts)) {
          return { canInterrupt: false, reason: 'stale_cache' };
        }
        const age = now() - ts;
        if (age > maxCacheAgeMs || age < 0) {
          return { canInterrupt: false, reason: 'stale_cache' };
        }
      }

      const win = info.window;
      if (win.isFullScreen) {
        return { canInterrupt: false, reason: 'fullscreen' };
      }

      // Check presentation mode
      if (!win.isMaximized && getDisplays && typeof getDisplays === 'function' && win.bounds) {
        try {
          const displays = getDisplays();
          if (!Array.isArray(displays)) {
            return { canInterrupt: mode === 'screensaver' ? false : true, reason: mode === 'screensaver' ? 'display-query-failed' : null };
          }
          const isPresentation = displays.some((display) => {
            // Both modes now use standard bounds checking logic from ScreensaverEligibilityGuard.
            // On Windows, win.bounds are physical pixels (GetWindowRect); display bounds are DIP.
            // Pass scaleFactor so coversBounds can normalize before comparison.
            const targetBounds = mode === 'screensaver'
              ? (display.bounds || display.workArea)
              : (display.workArea || display.bounds);
            return coversBounds(win.bounds, targetBounds, display.scaleFactor);
          });
          if (isPresentation) {
            return { canInterrupt: false, reason: 'presentation' };
          }
        } catch {
          return { canInterrupt: mode === 'screensaver' ? false : true, reason: mode === 'screensaver' ? 'display-query-failed' : null };
        }
      }

      return { canInterrupt: true, reason: null };
    },
  };
}

function coversBounds(windowBounds, targetBounds, scaleFactor) {
  if (!windowBounds || !targetBounds) return false;

  const sf = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;

  // Windows GetWindowRect returns physical pixels; Electron display bounds are DIP.
  // Divide by scaleFactor to normalise before comparison.
  const wx = Number(windowBounds.x) / sf;
  const wy = Number(windowBounds.y) / sf;
  const ww = Number(windowBounds.width) / sf;
  const wh = Number(windowBounds.height) / sf;

  const ax = Number(targetBounds.x);
  const ay = Number(targetBounds.y);
  const aw = Number(targetBounds.width);
  const ah = Number(targetBounds.height);

  if ([wx, wy, ww, wh, ax, ay, aw, ah].some((v) => !Number.isFinite(v))) return false;
  if (aw <= 0 || ah <= 0 || ww <= 0 || wh <= 0) return false;

  const tolerance = 8;
  return (
    wx <= ax + tolerance &&
    wy <= ay + tolerance &&
    wx + ww >= ax + aw - tolerance &&
    wy + wh >= ay + ah - tolerance
  );
}

module.exports = {
  createPresentationGuard,
  coversBounds,
  DEFAULT_MAX_CACHE_AGE_MS,
};

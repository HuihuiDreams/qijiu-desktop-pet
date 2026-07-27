/**
 * src/main/services/ScreensaverEligibilityGuard.js
 * 屏保前置打扰守卫：判断当前系统前台窗口状态是否适合打扰。
 * Windows 下校验活动窗口缓存（<=2s、非全屏、非演示）；macOS 始终返回 false。
 */

const DEFAULT_MAX_CACHE_AGE_MS = 2000;

function createScreensaverEligibilityGuard(deps = {}) {
  const {
    platform = process.platform,
    getActiveWindowInfo = null,
    getDisplays = null,
    now = Date.now,
    maxCacheAgeMs = DEFAULT_MAX_CACHE_AGE_MS,
  } = deps;

  // Non-Windows platforms (macOS / Linux) are unsupported
  if (platform !== 'win32') {
    return {
      canInterrupt() {
        return { canInterrupt: false, reason: 'unsupported_platform' };
      },
    };
  }

  return {
    canInterrupt() {
      if (!getActiveWindowInfo || typeof getActiveWindowInfo !== 'function') {
        return { canInterrupt: false, reason: 'provider-error' };
      }

      let info;
      try {
        info = getActiveWindowInfo();
      } catch {
        return { canInterrupt: false, reason: 'provider-error' };
      }

      if (info?.reason === 'disabled') {
        return { canInterrupt: true, reason: null };
      }

      if (!info || !info.active || !info.window) {
        return { canInterrupt: false, reason: 'unknown-state' };
      }

      const ts = info.sampledAt ?? info.timestamp;
      if (!Number.isFinite(ts)) {
        return { canInterrupt: false, reason: 'stale_cache' };
      }

      const age = now() - ts;
      if (age > maxCacheAgeMs || age < 0) {
        return { canInterrupt: false, reason: 'stale_cache' };
      }

      const win = info.window;
      if (win.isFullScreen) {
        return { canInterrupt: false, reason: 'fullscreen' };
      }

      if (getDisplays && typeof getDisplays === 'function' && win.bounds) {
        try {
          const displays = getDisplays();
          if (Array.isArray(displays)) {
            const isPresentation = displays.some((display) => {
              const workArea = display.workArea || display.bounds;
              return coversWorkArea(win.bounds, workArea);
            });
            if (isPresentation) {
              return { canInterrupt: false, reason: 'presentation' };
            }
          }
        } catch {
          // Ignore display lookup failures and fall through safely
        }
      }

      return { canInterrupt: true, reason: null };
    },
  };
}

function coversWorkArea(windowBounds, workArea) {
  if (!windowBounds || !workArea) return false;

  const wx = Number(windowBounds.x);
  const wy = Number(windowBounds.y);
  const ww = Number(windowBounds.width);
  const wh = Number(windowBounds.height);

  const ax = Number(workArea.x);
  const ay = Number(workArea.y);
  const aw = Number(workArea.width);
  const ah = Number(workArea.height);

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
  createScreensaverEligibilityGuard,
  coversWorkArea,
  DEFAULT_MAX_CACHE_AGE_MS,
};

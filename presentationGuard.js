/**
 * presentationGuard.js — 提醒前置守卫
 *
 * 用于判断当前是否处于全屏或演示场景。
 * 它不负责活跃计时，只返回 canInterrupt / deferReason。
 *
 * 隐私边界：
 *   - Windows：只读取前台窗口几何信息和 isFullScreen 标记。
 *   - 不保存窗口标题、进程名、URL 或历史记录。
 *   - macOS：不做全屏检测，始终返回 canInterrupt = true。
 *   - 只在提醒到期或延后重试时调用，不做持续采样。
 */

/**
 * Create a PresentationGuard instance.
 *
 * @param {object} deps
 * @param {'win32'|'darwin'|string} deps.platform - current platform
 * @param {function} [deps.getActiveWindowInfo] - async function returning
 *   { active, window: { bounds, isFullScreen, isMaximized } } or null.
 *   Only used on Windows.
 * @param {function} [deps.getDisplays] - returns array of Electron Display objects.
 *   Only used on Windows.
 * @returns {{ canInterrupt(): { canInterrupt: boolean, deferReason: string|null } }}
 */
function createPresentationGuard(deps) {
  const {
    platform,
    getActiveWindowInfo = null,
    getDisplays = null,
  } = deps;

  // macOS: always allow interrupt, no fullscreen detection
  if (platform !== 'win32') {
    return {
      canInterrupt() {
        return { canInterrupt: true, deferReason: null };
      },
    };
  }

  // Windows: check foreground window geometry for fullscreen/presentation
  return {
    canInterrupt() {
      // If provider is not available, be conservative: defer
      if (!getActiveWindowInfo) {
        return { canInterrupt: false, deferReason: 'provider-unavailable' };
      }

      let info;
      try {
        // getActiveWindowInfo may be sync (from cached sampler) or the
        // last-known payload. The guard is called synchronously from the
        // service, so we accept the last-sampled value.
        info = typeof getActiveWindowInfo === 'function' ? getActiveWindowInfo() : null;
      } catch {
        return { canInterrupt: false, deferReason: 'provider-error' };
      }

      if (!info || !info.active || !info.window) {
        // Cannot determine — conservative: defer on Windows
        return { canInterrupt: false, deferReason: 'unknown-state' };
      }

      const win = info.window;

      // Explicit fullscreen flag
      if (win.isFullScreen) {
        return { canInterrupt: false, deferReason: 'fullscreen' };
      }

      // Heuristic: check if window covers an entire display workArea
      if (getDisplays && win.bounds) {
        try {
          const displays = getDisplays();
          const isPresentation = displays.some((display) => {
            const workArea = display.workArea || display.bounds;
            return coversWorkArea(win.bounds, workArea);
          });

          if (isPresentation) {
            return { canInterrupt: false, deferReason: 'presentation' };
          }
        } catch {
          // If display check fails, allow interrupt rather than blocking forever
        }
      }

      return { canInterrupt: true, deferReason: null };
    },
  };
}

/**
 * Check if window bounds approximately cover a display's work area,
 * suggesting fullscreen or presentation mode.
 */
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

  // Window must be at least as large as workArea and positioned to cover it
  // Allow small tolerance (8px) for shadow/border decorations
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
  coversWorkArea,
};

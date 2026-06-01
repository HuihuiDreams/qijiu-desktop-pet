/**
 * breakReminderService.js — 久坐提醒主进程服务
 *
 * 负责：
 *   - 低频采样系统空闲状态（默认 30 秒一次）
 *   - 累计连续活跃时间
 *   - 触发提醒事件
 *   - 管理配置持久化
 *
 * 隐私边界：
 *   - 只读取系统级"空闲时长"，不监听键盘/鼠标/窗口标题/URL。
 *   - 不在 renderer 中轮询系统状态。
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  intervalMinutes: 60,
  idleResetMinutes: 5,
};

const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 240;
const MIN_SAMPLE_INTERVAL_MS = 10000;
const DEFAULT_SAMPLE_INTERVAL_MS = 30000;

// Threshold in seconds: if idle time < this, the user is considered active.
const ACTIVE_IDLE_THRESHOLD_SECONDS = 60;

/**
 * Normalize raw settings from electron-store, filling in defaults for
 * missing or invalid fields.
 * @param {*} raw - raw value from store (might be anything)
 * @returns {{ enabled: boolean, intervalMinutes: number, idleResetMinutes: number }}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };

  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled;

  let intervalMinutes = Number(raw.intervalMinutes);
  if (!Number.isFinite(intervalMinutes)
    || intervalMinutes < MIN_INTERVAL_MINUTES
    || intervalMinutes > MAX_INTERVAL_MINUTES) {
    intervalMinutes = DEFAULT_SETTINGS.intervalMinutes;
  }

  let idleResetMinutes = Number(raw.idleResetMinutes);
  if (!Number.isFinite(idleResetMinutes) || idleResetMinutes <= 0) {
    idleResetMinutes = DEFAULT_SETTINGS.idleResetMinutes;
  }

  return { enabled, intervalMinutes, idleResetMinutes };
}

/**
 * Create a BreakReminderService instance.
 *
 * @param {object} deps - injected dependencies
 * @param {object} deps.powerMonitor - Electron powerMonitor (or fake)
 *   Must provide: getSystemIdleTime(), getSystemIdleState(threshold)
 * @param {function} deps.onReminderDue - callback invoked when a reminder should fire
 * @param {object} [deps.presentationGuard] - optional guard with canInterrupt() method
 * @param {function} [deps.now] - clock function, defaults to Date.now
 * @param {function} [deps.setInterval] - timer, defaults to global setInterval
 * @param {function} [deps.clearInterval] - timer, defaults to global clearInterval
 * @param {function} [deps.setTimeout] - timer, defaults to global setTimeout
 * @param {function} [deps.clearTimeout] - timer, defaults to global clearTimeout
 * @param {number} [deps.sampleIntervalMs] - sampling interval, default 30000, min 10000
 * @param {object} [deps.settings] - initial settings override
 * @returns {object} service instance
 */
function createBreakReminderService(deps) {
  const {
    powerMonitor,
    onReminderDue,
    presentationGuard = null,
    now = Date.now,
    setInterval: _setInterval = globalThis.setInterval,
    clearInterval: _clearInterval = globalThis.clearInterval,
    setTimeout: _setTimeout = globalThis.setTimeout,
    clearTimeout: _clearTimeout = globalThis.clearTimeout,
  } = deps;

  const sampleIntervalMs = Math.max(
    MIN_SAMPLE_INTERVAL_MS,
    Number.isFinite(deps.sampleIntervalMs) ? deps.sampleIntervalMs : DEFAULT_SAMPLE_INTERVAL_MS,
  );

  // --- State ---
  let settings = normalizeSettings(deps.settings);
  let activeMs = 0;
  let lastSampleTime = 0;
  let samplerTimer = null;
  let deferTimer = null;
  let reminderPending = false;    // true while waiting for PresentationGuard retry
  let reminderShown = false;      // true while waiting for renderer dismiss
  let running = false;

  // Minimum defer retry interval (60 seconds per plan)
  const DEFER_RETRY_MS = 60000;

  function getSettings() {
    return { ...settings };
  }

  function updateSettings(newSettings) {
    settings = normalizeSettings(newSettings);
    // Reset active timer on settings change so the new interval takes effect
    // from now, but do not clear activeMs — the user has been active this long.
  }

  function getState() {
    return {
      activeMs,
      running,
      reminderPending,
      reminderShown,
    };
  }

  /**
   * Core sample tick. Called every sampleIntervalMs.
   */
  function sample() {
    if (!settings.enabled || !running) return;

    const currentTime = now();
    const elapsed = lastSampleTime > 0 ? currentTime - lastSampleTime : sampleIntervalMs;
    lastSampleTime = currentTime;

    // Read system idle state
    const idleResetSeconds = settings.idleResetMinutes * 60;
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const idleState = powerMonitor.getSystemIdleState(idleResetSeconds);

    // Determine if user is active, idle, or in an unknown state
    if (idleState === 'unknown') {
      // Conservative: do not trigger, do not accumulate, just wait
      return;
    }

    if (idleState === 'locked' || idleState === 'idle' || idleSeconds >= idleResetSeconds) {
      // User has rested — reset counter
      resetActiveTime();
      return;
    }

    // User is active (idleSeconds < ACTIVE_IDLE_THRESHOLD_SECONDS and state is 'active')
    if (idleSeconds < ACTIVE_IDLE_THRESHOLD_SECONDS && idleState === 'active') {
      activeMs += elapsed;
      checkReminder();
    }
  }

  function checkReminder() {
    if (reminderShown || reminderPending) return;

    const intervalMs = settings.intervalMinutes * 60 * 1000;
    if (activeMs >= intervalMs) {
      triggerReminder();
    }
  }

  function triggerReminder() {
    // Check PresentationGuard before firing
    if (presentationGuard) {
      const result = presentationGuard.canInterrupt();
      if (!result.canInterrupt) {
        // Defer — retry after DEFER_RETRY_MS
        if (!reminderPending) {
          reminderPending = true;
          deferTimer = _setTimeout(() => {
            reminderPending = false;
            deferTimer = null;
            // Re-check if still eligible
            if (settings.enabled && running && !reminderShown) {
              const intervalMs = settings.intervalMinutes * 60 * 1000;
              if (activeMs >= intervalMs) {
                triggerReminder();
              }
            }
          }, DEFER_RETRY_MS);
        }
        return;
      }
    }

    reminderPending = false;
    reminderShown = true;

    onReminderDue({
      triggeredAt: now(),
      intervalMinutes: settings.intervalMinutes,
    });
  }

  /**
   * Called by the main process when the renderer acknowledges dismissal.
   */
  function onDismissed() {
    reminderShown = false;
    // Reset active timer — next interval starts from now
    activeMs = 0;
    lastSampleTime = now();
  }

  function resetActiveTime() {
    activeMs = 0;
    reminderPending = false;
    if (deferTimer) {
      _clearTimeout(deferTimer);
      deferTimer = null;
    }
  }

  /**
   * Handle lock-screen or suspend: pause/clear active time.
   */
  function onLockOrSuspend() {
    resetActiveTime();
  }

  /**
   * Handle unlock-screen or resume: start fresh count.
   */
  function onUnlockOrResume() {
    resetActiveTime();
    lastSampleTime = now();
  }

  function start() {
    if (running) return;
    running = true;
    lastSampleTime = now();
    activeMs = 0;
    reminderPending = false;
    reminderShown = false;
    samplerTimer = _setInterval(sample, sampleIntervalMs);
  }

  function stop() {
    running = false;
    if (samplerTimer) {
      _clearInterval(samplerTimer);
      samplerTimer = null;
    }
    if (deferTimer) {
      _clearTimeout(deferTimer);
      deferTimer = null;
    }
    resetActiveTime();
    reminderShown = false;
  }

  function dispose() {
    stop();
  }

  return {
    start,
    stop,
    dispose,
    getSettings,
    updateSettings,
    getState,
    onDismissed,
    onLockOrSuspend,
    onUnlockOrResume,
    // Expose for testing
    _sample: sample,
  };
}

module.exports = {
  createBreakReminderService,
  normalizeSettings,
  DEFAULT_SETTINGS,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_SAMPLE_INTERVAL_MS,
  DEFAULT_SAMPLE_INTERVAL_MS,
};

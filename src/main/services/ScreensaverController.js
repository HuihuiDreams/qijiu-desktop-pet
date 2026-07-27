/**
 * src/main/services/ScreensaverController.js
 * CP 屏保主进程控制器与会话状态机管理。
 */

const { SCREENSAVER_STORE_KEY } = require('../constants');
const { isSenderMainWindow } = require('./IpcSenderAuthorization');

const DEFAULT_SETTINGS = {
  enabled: false,
  idleThresholdMinutes: 5,
};

const MIN_IDLE_MINUTES = 1;
const MAX_IDLE_MINUTES = 60;
const STANDBY_POLL_INTERVAL_MS = 5000;
const ACTIVE_POLL_INTERVAL_MS = 1000;
const ACTIVE_IDLE_THRESHOLD_SECONDS = 60;

function normalizeScreensaverSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };

  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled;

  let idleThresholdMinutes = Number(raw.idleThresholdMinutes);
  if (!Number.isFinite(idleThresholdMinutes)
    || idleThresholdMinutes < MIN_IDLE_MINUTES
    || idleThresholdMinutes > MAX_IDLE_MINUTES) {
    idleThresholdMinutes = DEFAULT_SETTINGS.idleThresholdMinutes;
  }

  return { enabled, idleThresholdMinutes: Math.floor(idleThresholdMinutes) };
}

function createScreensaverController(deps = {}) {
  const {
    powerMonitor = null,
    interruptionCoordinator = null,
    eligibilityGuard = null,
    StoreManager = null,
    getMainWindow = () => null,
    isPetCurrentlyHidden = () => false,
    getIsPaused = () => false,
    ipcMain = null,
    now = Date.now,
    setInterval: _setInterval = globalThis.setInterval,
    clearInterval: _clearInterval = globalThis.clearInterval,
  } = deps;

  let settings = normalizeScreensaverSettings(deps.settings);
  let state = 'inactive'; // 'inactive' | 'eligible' | 'active' | 'exiting' | 'blocked'
  let sessionId = 0;
  let pollTimer = null;
  let requiresFreshActiveCycle = false;
  let isStarted = false;

  let onLockHandler = null;
  let onSuspendHandler = null;
  let onUnlockHandler = null;
  let onResumeHandler = null;
  let handleReadyHandler = null;
  let handleFinishedHandler = null;
  let storeUnsubscribe = null;

  function getSettings() {
    return { ...settings };
  }

  function updateSettings(newSettings) {
    settings = normalizeScreensaverSettings(newSettings);
    if (StoreManager && typeof StoreManager.getStore === 'function') {
      const store = StoreManager.getStore();
      if (store && typeof store.set === 'function') {
        const currentInStore = store.get ? store.get(SCREENSAVER_STORE_KEY) : null;
        if (JSON.stringify(currentInStore) !== JSON.stringify(settings)) {
          store.set(SCREENSAVER_STORE_KEY, settings);
        }
      }
    }
    if (!settings.enabled && (state === 'active' || state === 'exiting')) {
      cancelSession('settings-disabled');
    }
  }

  function getState() {
    return { state, sessionId, requiresFreshActiveCycle };
  }

  function poll() {
    if (!isStarted) return;
    if (!powerMonitor || typeof powerMonitor.getSystemIdleTime !== 'function') return;

    const idleSeconds = powerMonitor.getSystemIdleTime();

    if (idleSeconds < ACTIVE_IDLE_THRESHOLD_SECONDS) {
      if (requiresFreshActiveCycle) {
        requiresFreshActiveCycle = false;
      }
      if (state === 'active') {
        stopSession('input');
      }
      return;
    }

    if (state === 'active') {
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        cancelSession('window-destroyed');
        return;
      }

      if (isPetCurrentlyHidden() || getIsPaused()) {
        cancelSession('pet-hidden');
        return;
      }

      if (eligibilityGuard && typeof eligibilityGuard.canInterrupt === 'function') {
        const guardResult = eligibilityGuard.canInterrupt();
        if (!guardResult || !guardResult.canInterrupt) {
          cancelSession(guardResult?.reason || 'eligibility-lost');
          return;
        }
      }
      return;
    }

    if (!settings.enabled || requiresFreshActiveCycle) {
      return;
    }

    if (state === 'inactive' || state === 'eligible' || state === 'blocked') {
      evaluateTrigger(idleSeconds);
    }
  }

  function evaluateTrigger(idleSeconds) {
    const thresholdSeconds = settings.idleThresholdMinutes * 60;
    if (idleSeconds < thresholdSeconds) {
      state = 'eligible';
      return;
    }

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      state = 'blocked';
      return;
    }

    if (isPetCurrentlyHidden() || getIsPaused()) {
      state = 'blocked';
      return;
    }

    if (!interruptionCoordinator || typeof interruptionCoordinator.tryAcquire !== 'function') {
      state = 'blocked';
      return;
    }

    if (!interruptionCoordinator.tryAcquire('screensaver')) {
      state = 'blocked';
      return;
    }

    if (!eligibilityGuard || typeof eligibilityGuard.canInterrupt !== 'function') {
      interruptionCoordinator.release('screensaver');
      state = 'blocked';
      return;
    }

    const guardResult = eligibilityGuard.canInterrupt();
    if (!guardResult || !guardResult.canInterrupt) {
      interruptionCoordinator.release('screensaver');
      state = 'blocked';
      return;
    }

    sessionId += 1;
    state = 'active';
    requiresFreshActiveCycle = true;
    resetPollTimer(ACTIVE_POLL_INTERVAL_MS);

    if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('screensaver-start', {
        sessionId,
        startedAt: now(),
      });
    }
  }

  function stopSession(reason = 'input') {
    if (state !== 'active') return;
    const currentSessionId = sessionId;
    state = 'exiting';

    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('screensaver-stop', {
        sessionId: currentSessionId,
        reason,
      });
    }

    if (interruptionCoordinator && typeof interruptionCoordinator.release === 'function') {
      interruptionCoordinator.release('screensaver');
    }
    state = 'inactive';
    resetPollTimer(STANDBY_POLL_INTERVAL_MS);
  }

  function cancelSession(reason = 'canceled') {
    if (state !== 'active' && state !== 'exiting' && state !== 'blocked') return;
    const currentSessionId = sessionId;

    if (state === 'active' || state === 'exiting') {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('screensaver-cancel', {
          sessionId: currentSessionId,
          reason,
        });
      }
    }

    if (interruptionCoordinator && typeof interruptionCoordinator.release === 'function') {
      interruptionCoordinator.release('screensaver');
    }
    state = 'inactive';
    resetPollTimer(STANDBY_POLL_INTERVAL_MS);
  }

  function resetPollTimer(intervalMs) {
    if (pollTimer) _clearInterval(pollTimer);
    if (isStarted) {
      pollTimer = _setInterval(poll, intervalMs);
    }
  }

  function detachListeners() {
    if (powerMonitor) {
      if (typeof powerMonitor.removeListener === 'function') {
        if (onLockHandler) powerMonitor.removeListener('lock-screen', onLockHandler);
        if (onSuspendHandler) powerMonitor.removeListener('suspend', onSuspendHandler);
        if (onUnlockHandler) powerMonitor.removeListener('unlock-screen', onUnlockHandler);
        if (onResumeHandler) powerMonitor.removeListener('resume', onResumeHandler);
      } else if (typeof powerMonitor.off === 'function') {
        if (onLockHandler) powerMonitor.off('lock-screen', onLockHandler);
        if (onSuspendHandler) powerMonitor.off('suspend', onSuspendHandler);
        if (onUnlockHandler) powerMonitor.off('unlock-screen', onUnlockHandler);
        if (onResumeHandler) powerMonitor.off('resume', onResumeHandler);
      }
    }
    onLockHandler = null;
    onSuspendHandler = null;
    onUnlockHandler = null;
    onResumeHandler = null;

    if (ipcMain && typeof ipcMain.removeListener === 'function') {
      if (handleReadyHandler) ipcMain.removeListener('screensaver-ready', handleReadyHandler);
      if (handleFinishedHandler) ipcMain.removeListener('screensaver-finished', handleFinishedHandler);
    }
    handleReadyHandler = null;
    handleFinishedHandler = null;

    if (typeof storeUnsubscribe === 'function') {
      storeUnsubscribe();
      storeUnsubscribe = null;
    }
  }

  function lock() {
    requiresFreshActiveCycle = true;
    if (state === 'active' || state === 'exiting') {
      cancelSession('system-lock');
    } else {
      if (interruptionCoordinator && typeof interruptionCoordinator.release === 'function') {
        interruptionCoordinator.release('screensaver');
      }
      state = 'inactive';
    }
  }

  function suspend() {
    requiresFreshActiveCycle = true;
    if (state === 'active' || state === 'exiting') {
      cancelSession('system-suspend');
    } else {
      if (interruptionCoordinator && typeof interruptionCoordinator.release === 'function') {
        interruptionCoordinator.release('screensaver');
      }
      state = 'inactive';
    }
  }

  function unlock() {
    requiresFreshActiveCycle = true;
    resetPollTimer(STANDBY_POLL_INTERVAL_MS);
  }

  function resume() {
    requiresFreshActiveCycle = true;
    resetPollTimer(STANDBY_POLL_INTERVAL_MS);
  }

  function start() {
    if (isStarted) return;
    isStarted = true;

    if (StoreManager && typeof StoreManager.getStore === 'function') {
      const store = StoreManager.getStore();
      if (store) {
        if (typeof store.get === 'function') {
          const stored = store.get(SCREENSAVER_STORE_KEY);
          if (stored !== undefined) {
            settings = normalizeScreensaverSettings(stored);
          }
        }
        if (typeof store.onDidChange === 'function') {
          storeUnsubscribe = store.onDidChange(SCREENSAVER_STORE_KEY, (newVal) => {
            updateSettings(newVal);
          });
        }
      }
    }

    if (powerMonitor && typeof powerMonitor.on === 'function') {
      onLockHandler = () => lock();
      onSuspendHandler = () => suspend();
      onUnlockHandler = () => unlock();
      onResumeHandler = () => resume();

      powerMonitor.on('lock-screen', onLockHandler);
      powerMonitor.on('suspend', onSuspendHandler);
      powerMonitor.on('unlock-screen', onUnlockHandler);
      powerMonitor.on('resume', onResumeHandler);
    }

    if (ipcMain && typeof ipcMain.on === 'function') {
      handleReadyHandler = (event) => {
        const mainWindow = getMainWindow();
        if (!isSenderMainWindow(event, mainWindow)) return;
        if (state !== 'inactive') {
          cancelSession('renderer-reload');
        }
      };

      handleFinishedHandler = (event, payload) => {
        const mainWindow = getMainWindow();
        if (!isSenderMainWindow(event, mainWindow)) return;
        if (payload && payload.sessionId === sessionId) {
          // Session observability receipt confirmed
        }
      };

      ipcMain.on('screensaver-ready', handleReadyHandler);
      ipcMain.on('screensaver-finished', handleFinishedHandler);
    }

    resetPollTimer(STANDBY_POLL_INTERVAL_MS);
  }

  function stop() {
    if (pollTimer) {
      _clearInterval(pollTimer);
      pollTimer = null;
    }
    if (state === 'active' || state === 'exiting' || state === 'blocked') {
      cancelSession('stopped');
    }
    detachListeners();
    isStarted = false;
  }

  function dispose() {
    stop();

    if (interruptionCoordinator && typeof interruptionCoordinator.release === 'function') {
      interruptionCoordinator.release('screensaver');
    }

    state = 'inactive';
  }

  return {
    start,
    stop,
    suspend,
    resume,
    lock,
    unlock,
    dispose,
    getSettings,
    updateSettings,
    getState,
    stopSession,
    cancelSession,
    _poll: poll,
  };
}

module.exports = {
  createScreensaverController,
  normalizeScreensaverSettings,
  DEFAULT_SETTINGS,
  MIN_IDLE_MINUTES,
  MAX_IDLE_MINUTES,
  STANDBY_POLL_INTERVAL_MS,
  ACTIVE_POLL_INTERVAL_MS,
  ACTIVE_IDLE_THRESHOLD_SECONDS,
};

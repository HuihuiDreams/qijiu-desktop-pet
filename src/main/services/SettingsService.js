/**
 * src/main/services/SettingsService.js
 * 统一设置窗口的主进程聚合控制器：snapshot 聚合、IPC 参数校验与 sender 鉴权、
 * 以及 store 外部变更时的事件推送。
 */
const { ipcMain: electronIpcMain } = require('electron');
const {
  PET_SCALE_DEFAULT_PERCENT,
  PET_SCALE_MAX_PERCENT,
  PET_SCALE_MIN_PERCENT,
  PET_SCALE_STEP_PERCENT,
  createIpcFailure,
  createIpcSuccess,
  normalizePetScalePercent,
} = require('../../../ipcContracts');
const {
  BREAK_REMINDER_STORE_KEY,
  LOCALE_KEY,
  PET_SCALE_STORE_KEY,
  SCREENSAVER_STORE_KEY,
} = require('../constants');
const { SCREENSAVER_ALLOWED_IDLE_MINUTES } = require('./screensaverAllowedMinutes');
const { isSenderWindow } = require('./IpcSenderAuthorization');

const VALID_LOCALES = new Set(['zh', 'en', 'ja']);
const STORE_WATCHED_KEYS = [
  PET_SCALE_STORE_KEY,
  LOCALE_KEY,
  BREAK_REMINDER_STORE_KEY,
  SCREENSAVER_STORE_KEY,
  'weatherSyncSettings',
  'windowAwarenessEnabled',
  'autoLaunch',
];

let deps = {};
let storeUnsubscribers = [];

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isWindowAwarenessSupported() {
  if (typeof deps.WindowAwarenessService?.isSupported === 'function') {
    return Boolean(deps.WindowAwarenessService.isSupported());
  }
  return process.platform === 'win32' || process.platform === 'darwin';
}

function getSnapshot() {
  const weather = deps.WeatherSyncController?.getWeatherSyncSettings?.() || {};
  const screensaver = deps.getScreensaverSettings?.() || { enabled: false, idleThresholdMinutes: 3 };
  const autoLaunchState = deps.AutoLaunchService?.getAutoLaunchState?.() || {
    enabled: Boolean(deps.AutoLaunchService?.isAutoLaunchEnabled?.()),
    preference: false,
    pendingApproval: false,
  };
  const skinId = deps.SkinService?.getCurrentSkinId?.() || 'default';
  const skinDisplayName = typeof deps.SkinService?.getSkinDisplayName === 'function'
    ? deps.SkinService.getSkinDisplayName(skinId)
    : skinId;
  const allowedIntervals = Array.isArray(deps.BreakReminderController?.BREAK_REMINDER_TRAY_INTERVALS)
    ? [...deps.BreakReminderController.BREAK_REMINDER_TRAY_INTERVALS]
    : [30, 45, 60, 90, 120];
  const windowAwarenessSupported = isWindowAwarenessSupported();
  const autoLaunchPendingApproval = Boolean(autoLaunchState.pendingApproval);

  return {
    locale: deps.LocaleService?.getCurrentLocale?.() || 'zh',
    petScale: {
      currentPercent: deps.PetScaleService?.getPreviewPercent?.() ?? PET_SCALE_DEFAULT_PERCENT,
      committedPercent: deps.PetScaleService?.getCommittedPercent?.() ?? PET_SCALE_DEFAULT_PERCENT,
      defaultPercent: PET_SCALE_DEFAULT_PERCENT,
      minPercent: PET_SCALE_MIN_PERCENT,
      maxPercent: PET_SCALE_MAX_PERCENT,
      stepPercent: PET_SCALE_STEP_PERCENT,
    },
    skin: {
      id: skinId,
      displayName: skinDisplayName,
    },
    windowAwareness: {
      enabled: Boolean(deps.WindowAwarenessService?.isEnabled?.()),
      supported: windowAwarenessSupported,
    },
    weather: {
      enabled: Boolean(weather.enabled),
      city: typeof weather.city === 'string' ? weather.city : '',
    },
    breakReminder: {
      enabled: Boolean(deps.BreakReminderController?.getBreakReminderEnabled?.()),
      intervalMinutes: Number(deps.BreakReminderController?.getBreakReminderIntervalMinutes?.()) || 60,
      allowedIntervals,
    },
    screensaver: {
      enabled: Boolean(screensaver.enabled),
      idleThresholdMinutes: Number(screensaver.idleThresholdMinutes) || 3,
      allowedThresholds: [...SCREENSAVER_ALLOWED_IDLE_MINUTES],
    },
    autoLaunch: {
      enabled: Boolean(autoLaunchState.enabled),
      preference: Boolean(autoLaunchState.preference),
      pendingApproval: autoLaunchPendingApproval,
    },
    windowAwarenessSupported,
    autoLaunchPendingApproval,
  };
}

function notifySettingsUpdated() {
  const settingsWin = deps.windowManager?.settingsWindow;
  if (!settingsWin || settingsWin.isDestroyed?.() || !settingsWin.webContents || settingsWin.webContents.isDestroyed?.()) {
    return;
  }
  settingsWin.webContents.send('settings-updated', getSnapshot());
}

function clearStoreSubscriptions() {
  for (const unsubscribe of storeUnsubscribers) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  storeUnsubscribers = [];
}

function init(dependencies = {}) {
  clearStoreSubscriptions();
  deps = { ...dependencies };
  const ipc = deps.ipcMain || electronIpcMain;

  if (ipc && typeof ipc.handle === 'function') {
    ipc.handle('settings-get-snapshot', (event) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) return null;
      return getSnapshot();
    });

    ipc.handle('settings-preview-pet-scale', (event, percent) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (typeof percent !== 'number' || !Number.isFinite(percent)) {
        return createIpcFailure('VALIDATION_ERROR', 'Invalid pet scale percent');
      }
      const normalized = normalizePetScalePercent(percent);
      const applied = deps.PetScaleService.preview(normalized);
      return createIpcSuccess({ percent: applied });
    });

    ipc.handle('settings-commit-pet-scale', (event, percent) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (percent !== undefined && (typeof percent !== 'number' || !Number.isFinite(percent))) {
        return createIpcFailure('VALIDATION_ERROR', 'Invalid pet scale percent');
      }
      const normalized = percent === undefined ? undefined : normalizePetScalePercent(percent);
      const finalPercent = deps.PetScaleService.confirm(normalized);
      const snapshot = getSnapshot();
      return createIpcSuccess({ percent: finalPercent, snapshot });
    });

    ipc.handle('settings-reset-pet-scale', (event) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      const finalPercent = deps.PetScaleService.confirm(PET_SCALE_DEFAULT_PERCENT);
      const snapshot = getSnapshot();
      return createIpcSuccess({ percent: finalPercent, snapshot });
    });

    ipc.handle('settings-set-window-awareness', (event, enabled) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (typeof enabled !== 'boolean') {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid window awareness flag'),
          snapshot: getSnapshot(),
        };
      }
      if (!isWindowAwarenessSupported()) {
        return {
          ...createIpcFailure('UNSUPPORTED_PLATFORM', 'Window awareness is not supported on this platform'),
          snapshot: getSnapshot(),
        };
      }
      deps.WindowAwarenessService.setWindowAwarenessEnabled(enabled);
      const snapshot = getSnapshot();
      return createIpcSuccess({ enabled: snapshot.windowAwareness.enabled, snapshot });
    });

    ipc.handle('settings-set-weather-enabled', async (event, enabled) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (typeof enabled !== 'boolean') {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid weather enabled flag'),
          snapshot: getSnapshot(),
        };
      }
      const currentStored = deps.WeatherSyncController.getStoredWeatherSyncSettings();
      await deps.WeatherSyncController.updateWeatherSyncSettings({
        ...currentStored,
        enabled,
      });
      const snapshot = getSnapshot();
      return createIpcSuccess({
        enabled: snapshot.weather.enabled,
        needsCityPrompt: Boolean(enabled && !snapshot.weather.city),
        snapshot,
      });
    });

    ipc.handle('settings-set-city-name', async (event, cityName) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (typeof cityName !== 'string' || !cityName.trim()) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid city name'),
          snapshot: getSnapshot(),
        };
      }
      const result = await deps.WeatherSyncController.setCityName(cityName);
      const snapshot = getSnapshot();
      if (!result?.success) {
        return {
          ...createIpcFailure('GEOCODE_FAILED', 'City not found'),
          snapshot,
        };
      }
      return createIpcSuccess({ city: result.city, snapshot });
    });

    ipc.handle('settings-set-break-reminder', (event, patch) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (!isPlainObject(patch)) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid break reminder settings'),
          snapshot: getSnapshot(),
        };
      }

      const allowedIntervals = deps.BreakReminderController?.BREAK_REMINDER_TRAY_INTERVALS || [30, 45, 60, 90, 120];
      const hasEnabled = 'enabled' in patch && patch.enabled !== undefined;
      const hasInterval = 'intervalMinutes' in patch && patch.intervalMinutes !== undefined;
      if (!hasEnabled && !hasInterval) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'No break reminder fields specified'),
          snapshot: getSnapshot(),
        };
      }
      if (hasEnabled && typeof patch.enabled !== 'boolean') {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid break reminder enabled flag'),
          snapshot: getSnapshot(),
        };
      }
      if (hasInterval && (!Number.isInteger(patch.intervalMinutes) || !allowedIntervals.includes(patch.intervalMinutes))) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid break reminder interval'),
          snapshot: getSnapshot(),
        };
      }

      const result = deps.BreakReminderController.updateBreakReminderSettings({
        ...(hasEnabled ? { enabled: patch.enabled } : {}),
        ...(hasInterval ? { intervalMinutes: patch.intervalMinutes } : {}),
      });
      const snapshot = getSnapshot();
      if (!result?.success) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Failed to update break reminder settings'),
          snapshot,
        };
      }
      return createIpcSuccess({ breakReminder: snapshot.breakReminder, snapshot });
    });

    ipc.handle('settings-set-screensaver', (event, patch) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (!isPlainObject(patch)) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid screensaver settings'),
          snapshot: getSnapshot(),
        };
      }

      const hasEnabled = 'enabled' in patch && patch.enabled !== undefined;
      const hasThreshold = 'idleThresholdMinutes' in patch && patch.idleThresholdMinutes !== undefined;
      if (!hasEnabled && !hasThreshold) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'No screensaver fields specified'),
          snapshot: getSnapshot(),
        };
      }
      if (hasEnabled && typeof patch.enabled !== 'boolean') {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid screensaver enabled flag'),
          snapshot: getSnapshot(),
        };
      }
      if (hasThreshold && (!Number.isInteger(patch.idleThresholdMinutes) || !SCREENSAVER_ALLOWED_IDLE_MINUTES.includes(patch.idleThresholdMinutes))) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid screensaver threshold'),
          snapshot: getSnapshot(),
        };
      }

      const current = deps.getScreensaverSettings();
      const nextSettings = {
        ...current,
        ...(hasEnabled ? { enabled: patch.enabled } : {}),
        ...(hasThreshold ? { idleThresholdMinutes: patch.idleThresholdMinutes } : {}),
      };
      deps.updateScreensaverSettings(nextSettings);
      deps.trayManager?.refreshTrayMenu?.();
      const snapshot = getSnapshot();
      notifySettingsUpdated();
      return createIpcSuccess({ screensaver: snapshot.screensaver, snapshot });
    });

    ipc.handle('settings-set-locale', async (event, lang) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (!VALID_LOCALES.has(lang)) {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Unsupported locale'),
          snapshot: getSnapshot(),
        };
      }
      const result = await deps.LocaleService.changeLocale(lang);
      const snapshot = getSnapshot();
      if (!result?.success) {
        return {
          ...createIpcFailure('INTERNAL_ERROR', 'Failed to change locale'),
          snapshot,
        };
      }
      notifySettingsUpdated();
      return createIpcSuccess({ locale: result.locale, snapshot });
    });

    ipc.handle('settings-set-auto-launch', async (event, enabled) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      if (typeof enabled !== 'boolean') {
        return {
          ...createIpcFailure('VALIDATION_ERROR', 'Invalid auto launch flag'),
          snapshot: getSnapshot(),
        };
      }
      try {
        const result = await deps.AutoLaunchService.setAutoLaunchPreference(enabled);
        deps.trayManager?.refreshTrayMenu?.();
        const snapshot = getSnapshot();
        notifySettingsUpdated();
        if (!result?.success) {
          return {
            ...createIpcFailure('AUTO_LAUNCH_FAILED', 'Failed to update auto launch setting'),
            snapshot,
          };
        }
        return createIpcSuccess({
          enabled: snapshot.autoLaunch.enabled,
          preference: snapshot.autoLaunch.preference,
          pendingApproval: Boolean(result.pendingApproval || snapshot.autoLaunch.pendingApproval),
          snapshot,
        });
      } catch (error) {
        const snapshot = getSnapshot();
        notifySettingsUpdated();
        return {
          ...createIpcFailure('AUTO_LAUNCH_FAILED', error?.message || 'Failed to update auto launch setting'),
          snapshot,
        };
      }
    });

    ipc.handle('settings-open-skin-selector', (event) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      deps.skinSelectorWindowModule.openSkinSelectorWindow({ fromSettings: true });
      return createIpcSuccess();
    });

    ipc.handle('settings-close-window', (event) => {
      if (!isSenderWindow(event, deps.windowManager?.settingsWindow)) {
        return createIpcFailure('FORBIDDEN', 'Settings window access denied');
      }
      deps.settingsWindowModule.closeSettingsWindow();
      return createIpcSuccess();
    });
  }

  const store = deps.StoreManager?.getStore?.();
  if (store && typeof store.onDidChange === 'function') {
    for (const key of STORE_WATCHED_KEYS) {
      const unsub = store.onDidChange(key, () => {
        notifySettingsUpdated();
      });
      if (typeof unsub === 'function') {
        storeUnsubscribers.push(unsub);
      }
    }
  }
}

module.exports = {
  init,
  getSnapshot,
  notifySettingsUpdated,
};

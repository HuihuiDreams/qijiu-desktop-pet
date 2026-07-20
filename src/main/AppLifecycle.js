const { app } = require('electron');
const { BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  initUpdateManager,
  checkForUpdatesFromTray,
  getUpdateMenuState,
} = require('../../updateManager');
const {
  createIpcFailure,
  createIpcSuccess,
  normalizeMousePassthroughRequest,
  normalizePomodoroMinutes,
} = require('../../ipcContracts');
const {
  createBreakReminderService,
  normalizeSettings: normalizeBreakReminderSettings,
  DEFAULT_SETTINGS: DEFAULT_BREAK_REMINDER_SETTINGS,
} = require('../../breakReminderService');
const { createPresentationGuard } = require('../../presentationGuard');
const { createMeetingDetector } = require('../../meetingDetector');
const { PomodoroSystem } = require('../../src/systems/PomodoroSystem');
const { registerProtectedAssetProtocol } = require('../../protectedAssetProtocol');
const { I18N } = require('../../src/data/i18n');
const {
  DEFAULT_WEATHER_SYNC_SETTINGS,
  normalizeSettings: normalizeWeatherSyncSettings,
  fetchWeather,
  processSettingsChange,
} = require('../../weatherSyncService');
const StoreManager = require('./services/StoreManager');
const AutoLaunchService = require('./services/AutoLaunchService');
const SkinService = require('./services/SkinService');
const LocaleService = require('./services/LocaleService');
const StorageIpc = require('./services/StorageIpc');
const DisplayService = require('./DisplayService');
const WindowAwarenessService = require('./services/WindowAwarenessService');
const windowManager = require('./windows/WindowManager');
const statusWindowModule = require('./windows/StatusWindow');
const citySettingWindowModule = require('./windows/CitySettingWindow');
const skinSelectorWindowModule = require('./windows/SkinSelectorWindow');
const pomodoroWindowModule = require('./windows/PomodoroWindow');
const updateProgressWindowModule = require('./windows/UpdateProgressWindow');
const trayManager = require('./TrayManager');
const { LOCALE_KEY, BREAK_REMINDER_STORE_KEY, POMODORO_LAST_MINUTES_KEY } = require('./constants');

// 常量定义
const AUTO_LAUNCH_KEY = 'autoLaunch';
const DEFAULT_AUTO_LAUNCH = true;
const APP_USER_MODEL_ID = 'com.deskpet.yueqi-shenjiu';
const LOGIN_ITEM_NAME = '七九爱宠';
const BREAK_REMINDER_TRAY_INTERVALS = [30, 45, 60, 90, 120];
const WEATHER_SYNC_STORE_KEY = 'weatherSyncSettings';

protocol.registerSchemesAsPrivileged([{
  scheme: 'pet-asset',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
  },
}]);





let petHidden = false;         // 桌宠隐藏状态
let meetingHidden = false;     // 会议检测导致的自动隐藏状态
let isPaused = false;          // 走动暂停状态
let keepOnTopTimer = null;     // 置顶守卫计时器
let mousePassthroughResetTimer = null;
let allowMainWindowClose = false;
let finalSaveInProgress = false;
let breakReminderService = null;
let meetingDetector = null;
let breakReminderEnabled = true;
let breakReminderIntervalMinutes = 60;
let weatherSyncSettings = { ...DEFAULT_WEATHER_SYNC_SETTINGS };
let weatherSyncIntervalTimer = null;
let weatherSyncSettingsUpdateId = 0;
let finalSaveRequestId = 0;
let suspendTimestamp = 0; // Date.now() recorded at system suspend for sleep-decay calculation
let pomodoroSystem = new PomodoroSystem();
let pomodoroTickTimer = null;
let pomodoroFocusSnapshot = null;
let pomodoroPetHidden = false;
const FINAL_SAVE_TIMEOUT_MS = 2500;

function configureChromiumMemoryBudget() {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
  app.commandLine.appendSwitch('disable-site-isolation-trials');
  app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
}

function disableApplicationMenu() {
  Menu.setApplicationMenu(null);
}

configureChromiumMemoryBudget();

/**
 * 刷新托盘菜单显示
 */


/**
 * 窗口置顶逻辑 (ADR-018)
 */
function keepPetWindowOnTop() {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;
  // screen-saver 级别确保在全屏应用上方
  windowManager.mainWindow.setAlwaysOnTop(true, 'screen-saver');
  windowManager.mainWindow.moveTop();
}

function setPetWindowMousePassthrough(ignore, options = {}) {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;

  if (mousePassthroughResetTimer) {
    clearTimeout(mousePassthroughResetTimer);
    mousePassthroughResetTimer = null;
  }

  const { leaseMs, ...electronOptions } = options || {};
  windowManager.mainWindow.setIgnoreMouseEvents(ignore, electronOptions);

  if (!ignore && Number.isFinite(leaseMs) && leaseMs > 0) {
    const timeoutMs = leaseMs;
    mousePassthroughResetTimer = setTimeout(() => {
      mousePassthroughResetTimer = null;
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }, timeoutMs);
  }
}

/**
 * 启动置顶守卫监控器
 */
function startKeepOnTopWatcher() {
  keepPetWindowOnTop();
  if (keepOnTopTimer) clearInterval(keepOnTopTimer);
  keepOnTopTimer = setInterval(keepPetWindowOnTop, 3000); // 每3秒检查一次
}

// 多屏几何（虚拟桌面边界、屏幕信息广播、窗口锁定/适配/迁移、拖拽跨屏轮询）
// 及活动窗口感知的 bounds/displays 查询已下沉至 DisplayService / WindowAwarenessService。


// Playwright smoke 钩子：E2E 冒烟测试通过此入口直接唤起选肤窗口，绕过渲染进程 UI 交互。
// 实现委托给 SkinService/SkinSelectorWindow，这里仅保留 QA 入口本身。
app.openSkinSelectorForQA = skinSelectorWindowModule.openSkinSelectorWindow;

function getStoredPomodoroMinutes() {
  const store = StoreManager.getStore();
  if (!store) return normalizePomodoroMinutes(null);
  return normalizePomodoroMinutes(store.get(POMODORO_LAST_MINUTES_KEY));
}

function savePomodoroMinutes(minutes) {
  const store = StoreManager.getStore();
  if (!store) return;
  store.set(POMODORO_LAST_MINUTES_KEY, normalizePomodoroMinutes(minutes));
}

function getStoredWeatherSyncSettings() {
  const store = StoreManager.getStore();
  if (!store) return { ...DEFAULT_WEATHER_SYNC_SETTINGS };
  const raw = store.get(WEATHER_SYNC_STORE_KEY);
  return normalizeWeatherSyncSettings(raw);
}

function saveWeatherSyncSettings(settings) {
  const store = StoreManager.getStore();
  if (!store) return { ...DEFAULT_WEATHER_SYNC_SETTINGS };
  const normalized = normalizeWeatherSyncSettings(settings);
  store.set(WEATHER_SYNC_STORE_KEY, normalized);
  return normalized;
}

async function startWeatherSync() {
  if (weatherSyncIntervalTimer) {
    clearInterval(weatherSyncIntervalTimer);
    weatherSyncIntervalTimer = null;
  }
  if (!weatherSyncSettings.enabled) {
    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
      windowManager.mainWindow.webContents.send('weather-update', { active: false });
    }
    return;
  }

  const doFetch = async () => {
    const payload = await fetchWeather(weatherSyncSettings);
    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed() && payload) {
      windowManager.mainWindow.webContents.send('weather-update', payload);
    }
  };

  await doFetch(); // immediately fetch
  const intervalMs = weatherSyncSettings.refreshIntervalMinutes * 60 * 1000;
  weatherSyncIntervalTimer = setInterval(doFetch, intervalMs);
}

async function updateWeatherSyncSettings(newSettings) {
  const updateId = ++weatherSyncSettingsUpdateId;
  weatherSyncSettings = normalizeWeatherSyncSettings(newSettings);
  trayManager.refreshTrayMenu();

  const processedSettings = await processSettingsChange(weatherSyncSettings);
  if (updateId !== weatherSyncSettingsUpdateId) return;

  weatherSyncSettings = processedSettings;
  saveWeatherSyncSettings(weatherSyncSettings);
  trayManager.refreshTrayMenu();
  startWeatherSync();
}

// --- 城市设置窗口 ---











// resolvePomodoroAsset 现由 SkinService 提供；此处保留同名局部绑定以复用原有调用形态。
let cachedPomodoroAssets = null;
let cachedPomodoroAssetsSkinId = null;

function getPomodoroAssets() {
  const resolvePomodoroAsset = SkinService.resolvePomodoroAsset;
  const currentSkinId = SkinService.getCurrentSkinId();
  if (cachedPomodoroAssets && cachedPomodoroAssetsSkinId === currentSkinId) {
    return cachedPomodoroAssets;
  }
  const assets = {
    yueqi: resolvePomodoroAsset(currentSkinId, 'left_cultivate.webp'),
    shenjiu: resolvePomodoroAsset(currentSkinId, 'right_cultivate.webp'),
    cultivate: resolvePomodoroAsset(currentSkinId, 'cultivate.webp'),
    kiss: resolvePomodoroAsset(currentSkinId, 'kiss.webp'),
  };
  cachedPomodoroAssets = assets;
  cachedPomodoroAssetsSkinId = currentSkinId;
  return assets;
}

function getPomodoroSnapshot(now) {
  const snapshot = pomodoroSystem.getSnapshot(now);
  return {
    ...snapshot,
    lastPomodoroMinutes: snapshot.durationMinutes || getStoredPomodoroMinutes(),
    isAlwaysOnTop: pomodoroWindowModule.isPomodoroAlwaysOnTop(),
    skinId: SkinService.getCurrentSkinId(),
    assets: getPomodoroAssets(),
  };
}

function sendPomodoroState() {
  if (!windowManager.pomodoroWindow || windowManager.pomodoroWindow.isDestroyed()) return;
  windowManager.pomodoroWindow.webContents.send('pomodoro-state', getPomodoroSnapshot());
}

function stopPomodoroTicker() {
  if (pomodoroTickTimer) {
    clearInterval(pomodoroTickTimer);
    pomodoroTickTimer = null;
  }
}

function startPomodoroTicker() {
  stopPomodoroTicker();
  pomodoroTickTimer = setInterval(() => {
    const snapshot = getPomodoroSnapshot();
    sendPomodoroState();
    if (snapshot.status === 'completed') {
      stopPomodoroTicker();
      restorePomodoroPetFocus();
      trayManager.refreshTrayMenu();
    }
  }, 1000);
}







async function startPomodoroSession(minutes) {
  await StoreManager.initStore();
  const normalizedMinutes = normalizePomodoroMinutes(minutes, getStoredPomodoroMinutes());
  savePomodoroMinutes(normalizedMinutes);
  const snapshot = pomodoroSystem.start(normalizedMinutes);
  enterPomodoroPetFocus();
  startPomodoroTicker();
  trayManager.refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}

function stopPomodoroSession() {
  stopPomodoroTicker();
  const snapshot = pomodoroSystem.stop();
  restorePomodoroPetFocus();
  trayManager.refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}



function requestRendererFinalSave(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const requestId = ++finalSaveRequestId;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      ipcMain.removeListener('save-before-quit-complete', handleComplete);
    };

    const settle = (success) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Boolean(success));
    };

    const handleComplete = (event, completedRequestId, success) => {
      if (event.sender !== win.webContents || completedRequestId !== requestId) return;
      settle(success);
    };

    const timeout = setTimeout(() => {
      console.warn('Timed out waiting for renderer final save.');
      settle(false);
    }, FINAL_SAVE_TIMEOUT_MS);

    ipcMain.on('save-before-quit-complete', handleComplete);
    win.webContents.send('save-before-quit', requestId);
  });
}

function installFinalSaveBeforeClose(win) {
  win.on('close', (event) => {
    if (allowMainWindowClose) return;

    event.preventDefault();
    if (finalSaveInProgress) return;

    finalSaveInProgress = true;
    requestRendererFinalSave(win).finally(() => {
      allowMainWindowClose = true;
      finalSaveInProgress = false;
      if (!win.isDestroyed()) {
        win.close();
      }
    });
  });
}

function isPetCurrentlyHidden() {
  return petHidden || meetingHidden || pomodoroPetHidden;
}

function getPetVisibilityState() {
  const sources = {
    manual: petHidden,
    meeting: meetingHidden,
    pomodoro: pomodoroPetHidden,
  };

  if (petHidden) return { visible: false, reason: 'manual', sources };
  if (meetingHidden) return { visible: false, reason: 'meeting', sources };
  if (pomodoroPetHidden) return { visible: false, reason: 'pomodoro', sources };
  return { visible: true, reason: 'visible', sources };
}

function sendPetVisibility(visible) {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;
  windowManager.mainWindow.webContents.send('toggle-pet-visibility', visible, getPetVisibilityState());
}

function enterPomodoroPetFocus() {
  if (!pomodoroFocusSnapshot) {
    pomodoroFocusSnapshot = { wasPaused: isPaused };
  }
  pomodoroPetHidden = true;
  sendPetVisibility(false);
  if (!isPaused) {
    isPaused = true;
    if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('toggle-pause', true);
  }
  trayManager.refreshTrayMenu();
}

function restorePomodoroPetFocus() {
  if (!pomodoroFocusSnapshot && !pomodoroPetHidden) return;
  const wasPaused = pomodoroFocusSnapshot ? pomodoroFocusSnapshot.wasPaused : isPaused;
  pomodoroPetHidden = false;
  if (isPaused !== wasPaused) {
    isPaused = wasPaused;
    if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('toggle-pause', isPaused);
  }
  sendPetVisibility(!isPetCurrentlyHidden());
  pomodoroFocusSnapshot = null;
  trayManager.refreshTrayMenu();
}

function showPetManually() {
  petHidden = false;
  meetingHidden = false;
  sendPetVisibility(!isPetCurrentlyHidden());
  trayManager.refreshTrayMenu();
}

function hidePetManually() {
  petHidden = true;
  meetingHidden = false;
  sendPetVisibility(false);
  trayManager.refreshTrayMenu();
}

function hidePetForMeeting() {
  if (meetingHidden) return;
  meetingHidden = true;
  if (!petHidden && !pomodoroPetHidden) {
    sendPetVisibility(false);
  }
  trayManager.refreshTrayMenu();
}

function showPetAfterMeeting() {
  if (!meetingHidden) return;
  meetingHidden = false;
  if (!petHidden && !pomodoroPetHidden) {
    sendPetVisibility(true);
  }
  trayManager.refreshTrayMenu();
}

function stopMeetingDetector() {
  if (!meetingDetector) return;
  meetingDetector.stop();
  meetingDetector = null;
}

function startMeetingDetector() {
  stopMeetingDetector();
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;

  meetingDetector = createMeetingDetector({
    platform: process.platform,
    onMeetingStart: hidePetForMeeting,
    onMeetingEnd: showPetAfterMeeting,
    onError: (error) => {
      console.warn('Meeting detector scan failed:', error.message);
    },
  });
  meetingDetector.start();
}

/**
 * 第二次点击应用图标时，唤起已存在的实例。
 */
function showExistingInstance() {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;

  if (windowManager.mainWindow.isMinimized()) {
    windowManager.mainWindow.restore();
  }

  if (!windowManager.mainWindow.isVisible()) {
    windowManager.mainWindow.showInactive();
  }

  showPetManually();
  keepPetWindowOnTop();
}

/**
 * 创建主渲染窗口
 */
function createWindow() {
  if (process.platform === 'darwin') {
    DisplayService.setCurrentPetDisplay(screen.getPrimaryDisplay());
  }

  const { x, y, width, height } = DisplayService.getDesktopWindowBounds();

  windowManager.mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,     // 背景透明
    frame: false,           // 无边框
    alwaysOnTop: true,      // 始终置顶
    skipTaskbar: true,      // 任务栏隐藏
    focusable: false,       // 不可聚焦，防止抢占输入
    resizable: true,
    enableLargerThanScreen: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 清理缓存并加载页面
  windowManager.mainWindow.webContents.session.clearCache().finally(() => {
    windowManager.mainWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'index.html'));
  });

  // 设置鼠标穿透逻辑
  setPetWindowMousePassthrough(true, { forward: true });

  DisplayService.lockPetWindowToBounds({ x, y, width, height });

  // macOS 特有：全工作区可见
  windowManager.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 启动置顶守护
  startKeepOnTopWatcher();

  windowManager.mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded successfully');
    DisplayService.sendScreenInfo();
    WindowAwarenessService.sendActiveWindowInfo(WindowAwarenessService.getLastPayload());
    sendPetVisibility(!isPetCurrentlyHidden());
    updateWeatherSyncSettings(weatherSyncSettings);
    keepPetWindowOnTop();
    startMeetingDetector();
  });

  // 安全加固：禁止新窗口和导航 (ADR-014)
  windowManager.mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // 关键事件触发置顶重刷
  windowManager.mainWindow.on('show', keepPetWindowOnTop);
  windowManager.mainWindow.on('restore', keepPetWindowOnTop);
  windowManager.mainWindow.on('blur', keepPetWindowOnTop);
  installFinalSaveBeforeClose(windowManager.mainWindow);

  windowManager.mainWindow.on('closed', () => {
    if (keepOnTopTimer) {
      clearInterval(keepOnTopTimer);
      keepOnTopTimer = null;
    }
    if (mousePassthroughResetTimer) {
      clearTimeout(mousePassthroughResetTimer);
      mousePassthroughResetTimer = null;
    }
    DisplayService.stopDragPoll();
    DisplayService.displayFitScheduler.clear();
    WindowAwarenessService.stopActiveWindowAwareness();
    if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {
      windowManager.statusWindow.close();
    }
    if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
      windowManager.pomodoroWindow.close();
    }
    citySettingWindowModule.closeCitySettingWindow();
    if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
      windowManager.skinSelectorWindow.close();
    }
    windowManager.mainWindow = null;
  });

  screen.on('display-added', DisplayService.displayFitScheduler.schedule);
  screen.on('display-removed', DisplayService.displayFitScheduler.schedule);
  screen.on('display-metrics-changed', DisplayService.displayFitScheduler.schedule);
  WindowAwarenessService.startActiveWindowAwareness();
}

/**
 * 构建托盘菜单
 */





/**
 * 创建系统托盘
 */


/**
 * 绘制简单的托盘图标像素图
 */


// --- IPC 通信监听 ---

ipcMain.on('set-ignore-mouse-events', (_event, ignore, options) => {
  const request = normalizeMousePassthroughRequest(ignore, options);
  if (!request) return;
  setPetWindowMousePassthrough(request.ignore, request.options);
});

ipcMain.handle('get-pet-visibility-state', () => {
  return getPetVisibilityState();
});

// 城市设置 IPC
ipcMain.handle('get-city-settings', () => {
  return { city: weatherSyncSettings.city || '' };
});

ipcMain.handle('set-city-name', async (_event, cityName) => {
  if (typeof cityName !== 'string' || !cityName.trim()) {
    return { success: false };
  }

  const trimmed = cityName.trim().slice(0, 100);
  const currentStored = getStoredWeatherSyncSettings();
  
  // Force enabled to true temporarily to bypass processSettingsChange's fast-return
  // and ensure geocoding validation runs.
  const newSettings = {
    ...currentStored,
    city: trimmed,
    lat: null,
    lon: null,
    enabled: true,
  };

  try {
    const processed = await processSettingsChange(newSettings);
    if (processed.lat === null || processed.lon === null) {
      return { success: false };
    }

    // Restore the user's actual enabled preference before saving
    processed.enabled = currentStored.enabled;

    weatherSyncSettings = processed;
    saveWeatherSyncSettings(weatherSyncSettings);
    trayManager.refreshTrayMenu();
    startWeatherSync();
    return { success: true, city: processed.city };
  } catch (err) {
    console.error('Failed to set city:', err);
    return { success: false };
  }
});

ipcMain.handle('close-city-setting-window', () => {
  citySettingWindowModule.closeCitySettingWindow();
  return { success: true };
});

// 久坐提醒 IPC
ipcMain.on('break-reminder-dismissed', () => {
  if (breakReminderService) breakReminderService.onDismissed();
});

// --- 应用生命周期 ---

class AppLifecycle {
  static init() {
    app.setAppUserModelId(APP_USER_MODEL_ID);


  app.on('second-instance', showExistingInstance);
  app.on('before-quit', () => {
    stopMeetingDetector();
    stopPomodoroTicker();
  });

  app.whenReady().then(async () => { 
    disableApplicationMenu();
    registerProtectedAssetProtocol({ protocol, app });

    // macOS: 隐藏 Dock 图标，桌宠不应在 Dock 栏占位
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    // 设置权限拦截
    const { session, powerMonitor } = require('electron');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    await StoreManager.initStore();
    // 加载持久化语言设置，若无则自动检测
    LocaleService.loadInitialLocale();
    await AutoLaunchService.syncAutoLaunchPreference();

    // --- 久坐提醒服务初始化 ---
    const storedBreakSettings = StoreManager.getStore() ? StoreManager.getStore().get(BREAK_REMINDER_STORE_KEY) : null;
    const breakSettings = normalizeBreakReminderSettings(storedBreakSettings);
    breakReminderEnabled = breakSettings.enabled;
    breakReminderIntervalMinutes = breakSettings.intervalMinutes;

    // Load persisted weather settings for the tray; the first fetch waits until renderer load.
    weatherSyncSettings = getStoredWeatherSyncSettings();
    trayManager.refreshTrayMenu();

    // Listen to config changes if users open the editor and save it
    StoreManager.getStore().onDidChange(WEATHER_SYNC_STORE_KEY, (newValue) => {
      // Ignore undefined/null newValue which can happen during atomic file writes
      if (!newValue) return;
      updateWeatherSyncSettings(newValue);
    });

    const presentationGuard = createPresentationGuard({
      platform: process.platform,
      getActiveWindowInfo: () => WindowAwarenessService.getLastPayload() || null,
      getDisplays: () => screen.getAllDisplays(),
    });

    breakReminderService = createBreakReminderService({
      powerMonitor,
      presentationGuard,
      settings: breakSettings,
      onReminderDue: (payload) => {
        // 桌宠隐藏时不提示
        if (isPetCurrentlyHidden()) return false;
        if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return false;
        windowManager.mainWindow.webContents.send('break-reminder-triggered', payload);
        return true;
      },
    });

    // 支持的平台才启动服务
    if (process.platform === 'win32' || process.platform === 'darwin') {
      breakReminderService.start();
    }

    // 监听系统事件
    powerMonitor.on('lock-screen', () => {
      if (breakReminderService) breakReminderService.onLockOrSuspend();
    });
    powerMonitor.on('suspend', () => {
      if (breakReminderService) breakReminderService.onLockOrSuspend();
      // macOS: performance.now() freezes during sleep, so deltaMs in the
      // renderer game-loop never jumps. Record wall-clock time here and
      // tell the renderer to save immediately so the timestamp is fresh.
      suspendTimestamp = Date.now();
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.webContents.send('system-suspended');
      }
    });
    powerMonitor.on('unlock-screen', () => {
      if (breakReminderService) breakReminderService.onUnlockOrResume();
    });
    powerMonitor.on('resume', () => {
      if (breakReminderService) breakReminderService.onUnlockOrResume();
      // Calculate real wall-clock sleep duration and notify renderer
      const offlineMs = suspendTimestamp > 0 ? Math.max(0, Date.now() - suspendTimestamp) : 0;
      suspendTimestamp = 0;
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.webContents.send('system-resumed', { offlineMs });
      }
    });

    updateProgressWindowModule.init({
      trayT: trayManager.trayT,
      trayText: trayManager.trayText,
    });

    initUpdateManager({
      app,
      dialog,
      getMainWindow: () => windowManager.mainWindow,
      refreshTrayMenu: () => trayManager.refreshTrayMenu(),
      updateProgressUi: {
        showChecking: ({ title, message }) => updateProgressWindowModule.showUpdateProgressWindow({
          mode: 'checking',
          title,
          message,
        }),
        showDownloading: ({ title, message, percent }) => updateProgressWindowModule.showUpdateProgressWindow({
          mode: 'downloading',
          title,
          message,
          percent,
        }),
        setProgress: updateProgressWindowModule.setUpdateProgress,
        close: updateProgressWindowModule.closeUpdateProgressWindow,
      },
      t: trayManager.trayT,
    });

    DisplayService.init({
      windowManager,
      trayManager,
    });

    WindowAwarenessService.init({
      windowManager,
      trayManager,
      getActiveWindowDisplays: DisplayService.getActiveWindowDisplays,
      getActiveWindowMainBounds: DisplayService.getActiveWindowMainBounds,
    });

    createWindow();


    trayManager.init({
      getPomodoroSnapshot,
      getUpdateMenuState,
      getCurrentLocale: LocaleService.getCurrentLocale,
      setCurrentLocale: LocaleService.setCurrentLocale,
      I18N, initStore: () => StoreManager.initStore(),
      getStore: () => StoreManager.getStore(),
      LOCALE_KEY,
      sendSkinSelectorData: () => skinSelectorWindowModule.sendSkinSelectorData(),
      openPomodoroWindow: () => pomodoroWindowModule.openPomodoroWindow(),
      openSkinSelector: () => skinSelectorWindowModule.openSkinSelectorWindow(),
      getIsPaused: () => isPaused,
      getPomodoroPetHidden: () => pomodoroPetHidden,
      setIsPaused: (val) => { isPaused = val; if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) windowManager.mainWindow.webContents.send('toggle-pause', isPaused); },
      isPetCurrentlyHidden,
      showPetManually,
      hidePetManually,
      getCurrentPetDisplay: DisplayService.getCurrentPetDisplay,
      migrateWindowToDisplay: DisplayService.migrateWindowToDisplay,
      getBreakReminderEnabled: () => breakReminderEnabled,
      setBreakReminderEnabled: (val) => breakReminderEnabled = val,
      getBreakReminderIntervalMinutes: () => breakReminderIntervalMinutes,
      setBreakReminderIntervalMinutes: (val) => breakReminderIntervalMinutes = val,
      getBreakReminderService: () => breakReminderService,
      BREAK_REMINDER_STORE_KEY,
      BREAK_REMINDER_TRAY_INTERVALS,
      getWeatherSyncSettings: () => weatherSyncSettings,
      getStoredWeatherSyncSettings,
      updateWeatherSyncSettings,
      openCitySettingWindow: () => citySettingWindowModule.openCitySettingWindow(),
      getWindowAwarenessEnabled: WindowAwarenessService.isEnabled,
      setWindowAwarenessEnabled: (val) => WindowAwarenessService.setWindowAwarenessEnabled(val),
      AutoLaunchService,
      checkForUpdatesFromTray,

      windowManager
    });
    trayManager.createTray();


    statusWindowModule.init({
      refreshTrayMenu: () => trayManager.refreshTrayMenu()
    });
    citySettingWindowModule.init();
    LocaleService.init({
      windowManager,
      skinSelectorWindowModule,
      trayManager
    });
    StorageIpc.init();
    SkinService.init({
      windowManager,
      skinSelectorWindowModule,
      trayManager,
      sendPomodoroState
    });
    skinSelectorWindowModule.init({
      selectSkin: SkinService.selectSkin,
      getCurrentSkinId: SkinService.getCurrentSkinId,
      getSkinGalleryItems: SkinService.getSkinGalleryItems
    });
    pomodoroWindowModule.init({
      getPomodoroSystem: () => pomodoroSystem,
      createIpcSuccess,
      createIpcFailure,
      initStore: () => StoreManager.initStore(),
      startPomodoroSession,
      stopPomodoroSession,
      sendPomodoroState,
      getPomodoroSnapshot
    });

  }).catch(err => { console.error('WHEN READY ERROR:', err); });

  app.on('window-all-closed', () => {
    app.quit();
  });
  }
}
module.exports = AppLifecycle;

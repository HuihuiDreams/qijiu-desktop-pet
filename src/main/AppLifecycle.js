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
} = require('../../ipcContracts');
const { registerProtectedAssetProtocol } = require('../../protectedAssetProtocol');
const { I18N } = require('../../src/data/i18n');
const StoreManager = require('./services/StoreManager');
const AutoLaunchService = require('./services/AutoLaunchService');
const SkinService = require('./services/SkinService');
const LocaleService = require('./services/LocaleService');
const StorageIpc = require('./services/StorageIpc');
const DisplayService = require('./DisplayService');
const WindowAwarenessService = require('./services/WindowAwarenessService');
const PetVisibilityService = require('./services/PetVisibilityService');
const MeetingDetectorController = require('./services/MeetingDetectorController');
const PomodoroService = require('./services/PomodoroService');
const WeatherSyncController = require('./services/WeatherSyncController');
const BreakReminderController = require('./services/BreakReminderController');
const { isPetCurrentlyHidden, showPetManually, hidePetManually } = PetVisibilityService;
const { getStoredWeatherSyncSettings, updateWeatherSyncSettings } = WeatherSyncController;
const windowManager = require('./windows/WindowManager');
const statusWindowModule = require('./windows/StatusWindow');
const citySettingWindowModule = require('./windows/CitySettingWindow');
const skinSelectorWindowModule = require('./windows/SkinSelectorWindow');
const pomodoroWindowModule = require('./windows/PomodoroWindow');
const updateProgressWindowModule = require('./windows/UpdateProgressWindow');
const trayManager = require('./TrayManager');
const { LOCALE_KEY, BREAK_REMINDER_STORE_KEY } = require('./constants');

// 常量定义
const AUTO_LAUNCH_KEY = 'autoLaunch';
const DEFAULT_AUTO_LAUNCH = true;
const APP_USER_MODEL_ID = 'com.deskpet.yueqi-shenjiu';
const LOGIN_ITEM_NAME = '七九爱宠';

protocol.registerSchemesAsPrivileged([{
  scheme: 'pet-asset',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
  },
}]);





let keepOnTopTimer = null;     // 置顶守卫计时器
let mousePassthroughResetTimer = null;
let allowMainWindowClose = false;
let finalSaveInProgress = false;
let finalSaveRequestId = 0;
// 启动引导期的天气同步设置局部缓存：仅用于 whenReady 内的初次加载赋值与
// createWindow() did-finish-load 首帧 bootstrap 调用两处字面量调用点；真正的
// 状态所有权与后续读写均归 WeatherSyncController，此变量本身不再被其他位置读取。
// Phase 8 将 createWindow() 连同这两处调用点一并下沉至 PetWindow.js 后可彻底消灭。
let weatherSyncSettings;
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

// 天气感知与时空同步设置存取、周期同步定时器与 store.onDidChange 订阅
// 已下沉至 WeatherSyncController；此处仅保留 getStoredWeatherSyncSettings/
// updateWeatherSyncSettings 两个字面量绑定（见上方 require 区），供 whenReady
// 引导流程与 createWindow() 的 did-finish-load 首帧调用使用。











// 番茄钟会话状态机（分钟数存取、皮肤素材缓存、tick 定时器、启停会话、
// 状态快照/推送）已下沉至 PomodoroService。



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

// 桌宠可见性状态机（手动/会议/番茄钟三来源合并与优先级仲裁）已下沉至
// PetVisibilityService；会议检测器生命周期已下沉至 MeetingDetectorController。

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
    PetVisibilityService.sendPetVisibility(!isPetCurrentlyHidden());
    updateWeatherSyncSettings(weatherSyncSettings);
    keepPetWindowOnTop();
    MeetingDetectorController.startMeetingDetector();
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

// 城市设置 IPC（get-city-settings/set-city-name）已下沉至 WeatherSyncController；
// close-city-setting-window 已下沉至 CitySettingWindow.init；
// 久坐提醒 IPC（break-reminder-dismissed）已下沉至 BreakReminderController。

// --- 应用生命周期 ---

class AppLifecycle {
  static init() {
    app.setAppUserModelId(APP_USER_MODEL_ID);


  app.on('second-instance', showExistingInstance);
  app.on('before-quit', () => {
    MeetingDetectorController.stopMeetingDetector();
    PomodoroService.stopPomodoroTicker();
  });

  app.whenReady().then(async () => { 
    disableApplicationMenu();
    registerProtectedAssetProtocol({ protocol, app });

    // macOS: 隐藏 Dock 图标，桌宠不应在 Dock 栏占位
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    // 设置权限拦截
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    await StoreManager.initStore();
    // 加载持久化语言设置，若无则自动检测
    LocaleService.loadInitialLocale();
    await AutoLaunchService.syncAutoLaunchPreference();

    BreakReminderController.init({
      ipcMain,
      StoreManager,
      PetVisibilityService,
      WindowAwarenessService,
      windowManager,
    });

    WeatherSyncController.init({
      windowManager,
      trayManager,
      StoreManager,
    });

    // Load persisted weather settings for the tray; the first fetch waits until renderer load.
    weatherSyncSettings = getStoredWeatherSyncSettings();
    trayManager.refreshTrayMenu();

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

    PetVisibilityService.init({
      ipcMain,
      windowManager,
      trayManager,
    });

    MeetingDetectorController.init({
      hidePetForMeeting: PetVisibilityService.hidePetForMeeting,
      showPetAfterMeeting: PetVisibilityService.showPetAfterMeeting,
    });

    PomodoroService.init({
      SkinService,
      PetVisibilityService,
      pomodoroWindowModule,
      windowManager,
      trayManager,
      StoreManager,
    });

    createWindow();


    trayManager.init({
      getPomodoroSnapshot: PomodoroService.getPomodoroSnapshot,
      getUpdateMenuState,
      getCurrentLocale: LocaleService.getCurrentLocale,
      setCurrentLocale: LocaleService.setCurrentLocale,
      I18N, initStore: () => StoreManager.initStore(),
      getStore: () => StoreManager.getStore(),
      LOCALE_KEY,
      sendSkinSelectorData: () => skinSelectorWindowModule.sendSkinSelectorData(),
      openPomodoroWindow: () => pomodoroWindowModule.openPomodoroWindow(),
      openSkinSelector: () => skinSelectorWindowModule.openSkinSelectorWindow(),
      getIsPaused: PetVisibilityService.getIsPaused,
      getPomodoroPetHidden: PetVisibilityService.getPomodoroPetHidden,
      setIsPaused: PetVisibilityService.setPaused,
      isPetCurrentlyHidden,
      showPetManually,
      hidePetManually,
      getCurrentPetDisplay: DisplayService.getCurrentPetDisplay,
      migrateWindowToDisplay: DisplayService.migrateWindowToDisplay,
      getBreakReminderEnabled: BreakReminderController.getBreakReminderEnabled,
      setBreakReminderEnabled: BreakReminderController.setBreakReminderEnabled,
      getBreakReminderIntervalMinutes: BreakReminderController.getBreakReminderIntervalMinutes,
      setBreakReminderIntervalMinutes: BreakReminderController.setBreakReminderIntervalMinutes,
      getBreakReminderService: BreakReminderController.getBreakReminderService,
      BREAK_REMINDER_STORE_KEY,
      BREAK_REMINDER_TRAY_INTERVALS: BreakReminderController.BREAK_REMINDER_TRAY_INTERVALS,
      getWeatherSyncSettings: WeatherSyncController.getWeatherSyncSettings,
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
      sendPomodoroState: PomodoroService.sendPomodoroState
    });
    skinSelectorWindowModule.init({
      selectSkin: SkinService.selectSkin,
      getCurrentSkinId: SkinService.getCurrentSkinId,
      getSkinGalleryItems: SkinService.getSkinGalleryItems
    });
    pomodoroWindowModule.init({
      getPomodoroSystem: PomodoroService.getPomodoroSystem,
      createIpcSuccess,
      createIpcFailure,
      initStore: () => StoreManager.initStore(),
      startPomodoroSession: PomodoroService.startPomodoroSession,
      stopPomodoroSession: PomodoroService.stopPomodoroSession,
      sendPomodoroState: PomodoroService.sendPomodoroState,
      getPomodoroSnapshot: PomodoroService.getPomodoroSnapshot
    });

  }).catch(err => { console.error('WHEN READY ERROR:', err); });

  app.on('window-all-closed', () => {
    app.quit();
  });
  }
}
module.exports = AppLifecycle;

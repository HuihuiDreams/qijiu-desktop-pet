const { app, ipcMain, Menu, dialog, protocol, session, powerMonitor, screen } = require('electron');
const {
  initUpdateManager,
  checkForUpdatesFromTray,
  getUpdateMenuState,
} = require('../../updateManager');
const { createIpcFailure, createIpcSuccess } = require('../../ipcContracts');
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
const PetScaleService = require('./services/PetScaleService');
const SettingsService = require('./services/SettingsService');
const windowManager = require('./windows/WindowManager');
const statusWindowModule = require('./windows/StatusWindow');
const settingsWindowModule = require('./windows/SettingsWindow');
const skinSelectorWindowModule = require('./windows/SkinSelectorWindow');
const pomodoroWindowModule = require('./windows/PomodoroWindow');
const updateProgressWindowModule = require('./windows/UpdateProgressWindow');
const petWindowModule = require('./windows/PetWindow');
const trayManager = require('./TrayManager');
const { createInterruptionCoordinator } = require('./services/InterruptionCoordinator');
const { createPresentationGuard } = require('./services/PresentationGuard');
const { createScreensaverController } = require('./services/ScreensaverController');

const APP_USER_MODEL_ID = 'com.deskpet.good-omens';
let screensaverController = null;
let interruptionCoordinator = null;

protocol.registerSchemesAsPrivileged([{
  scheme: 'pet-asset',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
  },
}]);

function configureChromiumMemoryBudget() {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
  app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
}

function disableApplicationMenu() {
  Menu.setApplicationMenu(null);
}

configureChromiumMemoryBudget();

// Playwright smoke 钩子：E2E 冒烟测试通过此入口直接唤起选肤窗口，绕过渲染进程 UI 交互。
// 实现委托给 SkinService/SkinSelectorWindow，这里仅保留 QA 入口本身。
app.openSkinSelectorForQA = skinSelectorWindowModule.openSkinSelectorWindow;
app.setQaExtraSkinIdForQA = (skinId) => SkinService.setQaExtraSkinId(skinId);
// 统一设置窗同样只能从托盘打开，QA 入口让 E2E 不依赖原生托盘菜单（可选参数为初始标签页）。
app.openSettingsForQA = settingsWindowModule.openSettingsWindow;

// --- 应用生命周期 ---

class AppLifecycle {
  static initPlatformSecurity() {
    disableApplicationMenu();
    registerProtectedAssetProtocol({ protocol, app });

    // macOS: 隐藏 Dock 图标，桌宠不应在 Dock 栏占位
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    // 设置权限拦截
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
  }

  static async initCoreServices() {
    await StoreManager.initStore();
    // 渲染进程首次 save-data 前先同步已保存的皮肤，避免 StorageIpc 把 skinId 写回 default
    SkinService.restoreConfirmedSkinFromStore(StoreManager.getStore());
    // 加载持久化语言设置，若无则自动检测
    LocaleService.loadInitialLocale();
    await AutoLaunchService.syncAutoLaunchPreference();
  }

  static initScreensaverSystem() {
    interruptionCoordinator = createInterruptionCoordinator();
    const eligibilityGuard = createPresentationGuard(
      {
        platform: process.platform,
        getActiveWindowInfo: () => WindowAwarenessService.getLastPayload(),
        getDisplays: () => screen.getAllDisplays(),
        now: Date.now,
      },
      { mode: 'screensaver' }
    );
    screensaverController = createScreensaverController({
      powerMonitor,
      interruptionCoordinator,
      eligibilityGuard,
      StoreManager,
      getMainWindow: () => windowManager.mainWindow,
      isPetCurrentlyHidden: PetVisibilityService.isPetCurrentlyHidden,
      getIsPaused: PetVisibilityService.getIsPaused,
      ipcMain,
    });
    screensaverController.start();
  }

  static initFeatureServices() {
    BreakReminderController.init({
      StoreManager,
      PetVisibilityService,
      WindowAwarenessService,
      windowManager,
      trayManager,
      interruptionCoordinator,
      onSettingsChanged: () => SettingsService.notifySettingsUpdated(),
    });

    WeatherSyncController.init({
      windowManager,
      trayManager,
      StoreManager,
      onWeatherSettingsChanged: () => SettingsService.notifySettingsUpdated(),
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
      cancelScreensaverSession: (reason) => screensaverController?.cancelSession(reason),
    });

    WindowAwarenessService.init({
      windowManager,
      trayManager,
      StoreManager,
      powerMonitor,
      getActiveWindowDisplays: DisplayService.getActiveWindowDisplays,
      getActiveWindowMainBounds: DisplayService.getActiveWindowMainBounds,
      onActiveWindowChanged: petWindowModule.onActiveWindowChanged,
      onSettingsChanged: () => SettingsService.notifySettingsUpdated(),
    });

    PetVisibilityService.init({
      ipcMain,
      windowManager,
      trayManager,
      cancelScreensaverSession: (reason) => screensaverController?.cancelSession(reason),
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
  }

  static initPetWindow() {
    petWindowModule.init({
      DisplayService,
      WindowAwarenessService,
      PetVisibilityService,
      MeetingDetectorController,
      WeatherSyncController,
      StoreManager,
      app,
    });
    petWindowModule.createWindow();
  }

  static initTray() {
    trayManager.init({
      getPomodoroSnapshot: PomodoroService.getPomodoroSnapshot,
      getUpdateMenuState,
      getCurrentLocale: LocaleService.getCurrentLocale,
      I18N,
      openPomodoroWindow: () => pomodoroWindowModule.openPomodoroWindow(),
      openSkinSelector: () => skinSelectorWindowModule.openSkinSelectorWindow({ fromSettings: false }),
      openSettingsWindow: (initialTab) => settingsWindowModule.openSettingsWindow(initialTab),
      getIsPaused: PetVisibilityService.getIsPaused,
      getPomodoroPetHidden: PetVisibilityService.getPomodoroPetHidden,
      setIsPaused: PetVisibilityService.setPaused,
      isPetCurrentlyHidden: PetVisibilityService.isPetCurrentlyHidden,
      showPetManually: PetVisibilityService.showPetManually,
      hidePetManually: PetVisibilityService.hidePetManually,
      getCurrentPetDisplay: DisplayService.getCurrentPetDisplay,
      migrateWindowToDisplay: DisplayService.migrateWindowToDisplay,
      checkForUpdatesFromTray,
      windowManager,
    });
    trayManager.createTray();
  }

  static initSubWindowsAndIpc() {
    statusWindowModule.init({
      refreshTrayMenu: () => trayManager.refreshTrayMenu()
    });
    settingsWindowModule.init({
      flushPetScalePreview: PetScaleService.flushPreview,
    });
    PetScaleService.init({
      windowManager,
      StoreManager,
      onScaleChanged: () => SettingsService.notifySettingsUpdated(),
    });
    LocaleService.init({
      windowManager,
      skinSelectorWindowModule,
      trayManager,
      onLocaleChanged: () => SettingsService.notifySettingsUpdated(),
    });
    StorageIpc.init({
      windowManager,
      getConfirmedSkinId: SkinService.getConfirmedSkinId,
    });
    SkinService.init({
      windowManager,
      skinSelectorWindowModule,
      trayManager,
      StoreManager,
      sendPomodoroState: PomodoroService.sendPomodoroState,
      cancelScreensaverSession: (reason) => screensaverController?.cancelSession(reason),
      onSkinConfirmed: () => SettingsService.notifySettingsUpdated(),
    });
    SettingsService.init({
      windowManager,
      StoreManager,
      trayManager,
      settingsWindowModule,
      skinSelectorWindowModule,
      PetScaleService,
      LocaleService,
      WeatherSyncController,
      BreakReminderController,
      WindowAwarenessService,
      AutoLaunchService,
      SkinService,
      getScreensaverSettings: () => (screensaverController ? screensaverController.getSettings() : { enabled: false, idleThresholdMinutes: 3 }),
      updateScreensaverSettings: (s) => { if (screensaverController) screensaverController.updateSettings(s); },
    });
    skinSelectorWindowModule.init({
      selectSkin: SkinService.selectSkin,
      getCurrentSkinId: SkinService.getCurrentSkinId,
      getSkinGalleryItems: SkinService.getSkinGalleryItems,
      revertSkinPreview: SkinService.revertSkinPreview,
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
  }

  static init() {
    app.setAppUserModelId(APP_USER_MODEL_ID);

    app.on('second-instance', petWindowModule.showExistingInstance);
    app.on('before-quit', () => {
      MeetingDetectorController.stopMeetingDetector();
      PomodoroService.stopPomodoroTicker();
      if (screensaverController) {
        screensaverController.dispose();
      }
    });

    app.whenReady().then(async () => {
      AppLifecycle.initPlatformSecurity();
      await AppLifecycle.initCoreServices();
      AppLifecycle.initScreensaverSystem();
      AppLifecycle.initFeatureServices();
      AppLifecycle.initPetWindow();
      AppLifecycle.initTray();
      AppLifecycle.initSubWindowsAndIpc();
    }).catch(err => { console.error('WHEN READY ERROR:', err); });

    app.on('window-all-closed', () => {
      app.quit();
    });
  }
}
module.exports = AppLifecycle;

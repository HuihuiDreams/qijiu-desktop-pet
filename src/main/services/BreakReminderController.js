/**
 * src/main/services/BreakReminderController.js
 * 久坐提醒控制器：breakReminderService 生命周期、presentationGuard 接线、
 * powerMonitor（lock-screen/suspend/unlock-screen/resume）事件、
 * break-reminder-dismissed IPC，以及托盘菜单读取的开关/间隔状态。
 * init(deps) 模式，deps: { StoreManager, PetVisibilityService,
 * WindowAwarenessService, windowManager }。
 */
const { ipcMain } = require('electron');
const {
  createBreakReminderService,
  normalizeSettings: normalizeBreakReminderSettings,
} = require('../../../breakReminderService');
const { createPresentationGuard } = require('../../../presentationGuard');
const { BREAK_REMINDER_STORE_KEY } = require('../constants');

const BREAK_REMINDER_TRAY_INTERVALS = [30, 45, 60, 90, 120];

let deps = {};
let breakReminderService = null;
let breakReminderEnabled = true;
let breakReminderIntervalMinutes = 60;
let suspendTimestamp = 0; // Date.now() recorded at system suspend for sleep-decay calculation

function init(dependencies) {
  deps = dependencies;
  const { StoreManager, PetVisibilityService, WindowAwarenessService, windowManager } = deps;
  const { isPetCurrentlyHidden } = PetVisibilityService;
  const { powerMonitor, screen } = require('electron');

  ipcMain.on('break-reminder-dismissed', () => {
    if (breakReminderService) breakReminderService.onDismissed();
  });

  // --- 久坐提醒服务初始化 ---
  const storedBreakSettings = StoreManager.getStore() ? StoreManager.getStore().get(BREAK_REMINDER_STORE_KEY) : null;
  const breakSettings = normalizeBreakReminderSettings(storedBreakSettings);
  breakReminderEnabled = breakSettings.enabled;
  breakReminderIntervalMinutes = breakSettings.intervalMinutes;

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
}

module.exports = {
  init,
  BREAK_REMINDER_TRAY_INTERVALS,
  getBreakReminderEnabled: () => breakReminderEnabled,
  setBreakReminderEnabled: (val) => { breakReminderEnabled = val; },
  getBreakReminderIntervalMinutes: () => breakReminderIntervalMinutes,
  setBreakReminderIntervalMinutes: (val) => { breakReminderIntervalMinutes = val; },
  getBreakReminderService: () => breakReminderService,
};

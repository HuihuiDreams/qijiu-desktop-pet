const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  getTaskbarPlatformsRelativeToBounds,
  getVirtualDisplayBounds,
  getWalkAreasRelativeToBounds,
  findAdjacentDisplay,
} = require('./displayBounds');
const { createActiveWindowProvider, unavailableActiveWindowInfo } = require('./activeWindowProvider');
const { createActiveWindowSampler } = require('./activeWindowAwareness');
const {
  areWindowBoundsEqual,
  createDisplayFitScheduler,
  getResizeBridgeConstraints,
} = require('./displayFit');
const {
  initUpdateManager,
  checkForUpdatesFromTray,
  getUpdateMenuState,
} = require('./updateManager');
const {
  createIpcFailure,
  createIpcSuccess,
  isAllowedSkinId,
  normalizeMousePassthroughRequest,
  normalizePomodoroMinutes,
  normalizeStatusWindowSize,
  normalizeWindowMigrationDirection,
} = require('./ipcContracts');
const {
  createBreakReminderService,
  normalizeSettings: normalizeBreakReminderSettings,
  DEFAULT_SETTINGS: DEFAULT_BREAK_REMINDER_SETTINGS,
} = require('./breakReminderService');
const { createPresentationGuard } = require('./presentationGuard');
const { createMeetingDetector } = require('./meetingDetector');
const { PomodoroSystem } = require('./src/systems/PomodoroSystem');
const { I18N } = require('./src/data/i18n');

// 常量定义
const AUTO_LAUNCH_KEY = 'autoLaunch';
const LOCALE_KEY = 'locale';
const DEFAULT_AUTO_LAUNCH = true;
const APP_USER_MODEL_ID = 'com.deskpet.yueqi-shenjiu';
const DISPLAY_METRICS_SETTLE_MS = 250;
const ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 10000;
const LOGIN_ITEM_NAME = '七九爱宠';
const BREAK_REMINDER_STORE_KEY = 'breakReminderSettings';
const BREAK_REMINDER_TRAY_INTERVALS = [30, 45, 60, 90, 120];
const POMODORO_LAST_MINUTES_KEY = 'lastPomodoroMinutes';

// 皮肤显示名多语言 key 映射表（文件夹名 → I18N.ui key）
const SKIN_NAME_KEYS = {
  'default': 'skinDefault',
  'birds': 'skinBirds',
  'animal_ears': 'skinAnimalEars',
  // 新增皮肤时在此添加映射，例如：
  // 'qban': 'skinQban',
};

/**
 * 根据 app.getLocale() 的返回值推断语言代码。
 * 规则：zh-Hans-* / zh-CN → 'zh'；zh-Hant-* / zh-TW / zh-HK → 'zh'；ja-* → 'ja'；其余 → 'en'
 * @returns {'zh'|'en'|'ja'}
 */
function detectLocale() {
  const raw = (app.getLocale() || '').toLowerCase();
  if (raw.startsWith('zh')) return 'zh';
  if (raw.startsWith('ja')) return 'ja';
  return 'en';
}

/** 返回当前语言字典的 UI 节点（主进程用） */
function trayT(key) {
  return (I18N[currentLocale]?.ui?.[key]) ?? (I18N.zh.ui[key]) ?? key;
}

function trayText(key, fallback) {
  const value = trayT(key);
  return value === key ? fallback : value;
}

function escapeElectronMenuLabel(label) {
  return String(label).replaceAll('&', '&&');
}

function trayMenuLabel(key, fallback) {
  const value = fallback === undefined ? trayT(key) : trayText(key, fallback);
  return escapeElectronMenuLabel(value);
}

function getSkinDisplayName(skinId) {
  const key = SKIN_NAME_KEYS[skinId];
  return escapeElectronMenuLabel(key ? trayT(key) : skinId);
}

let mainWindow = null;
let statusWindow = null;
let pomodoroWindow = null;
let updateProgressWindow = null;
let lastStatusWindowData = null;
let tray = null;
let store = null;
let petHidden = false;         // 桌宠隐藏状态
let meetingHidden = false;     // 会议检测导致的自动隐藏状态
let isPaused = false;          // 走动暂停状态
let autoLaunchEnabled = false; // 开机自动启动状态
let currentSkinId = 'default'; // 当前皮肤 ID（用于托盘菜单 radio 标记）
let currentLocale = 'zh';      // 当前语言（zh / en / ja），启动时从 store 加载或自动检测
let keepOnTopTimer = null;     // 置顶守卫计时器
let mousePassthroughResetTimer = null;
let activeWindowSampler = null;
let windowAwarenessEnabled = true;
let allowMainWindowClose = false;
let finalSaveInProgress = false;
let breakReminderService = null;
let meetingDetector = null;
let breakReminderEnabled = true;
let breakReminderIntervalMinutes = 60;
let finalSaveRequestId = 0;
let currentPetDisplay = null;
let dragPollTimer = null;
let suspendTimestamp = 0; // Date.now() recorded at system suspend for sleep-decay calculation
let pomodoroSystem = new PomodoroSystem();
let pomodoroTickTimer = null;
let pomodoroAlwaysOnTop = true;
let pomodoroFocusSnapshot = null;
let pomodoroPetHidden = false;
const FINAL_SAVE_TIMEOUT_MS = 2500;
const POMODORO_ALWAYS_ON_TOP_LEVEL = 'screen-saver';
const displayFitScheduler = createDisplayFitScheduler({
  fitNow: fitWindowToAllDisplays,
  delayMs: DISPLAY_METRICS_SETTLE_MS,
});

function configureChromiumMemoryBudget() {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
  app.commandLine.appendSwitch('disable-site-isolation-trials');
  app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
}

function disableApplicationMenu() {
  Menu.setApplicationMenu(null);
}

configureChromiumMemoryBudget();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

/**
 * 初始化持久化存储 (electron-store)
 */
async function initStore() {
  if (store) return store;
  try {
    const Store = (await import('electron-store')).default;
    store = new Store();
  } catch (error) {
    console.error('Failed to init electron-store:', error);
  }
  return store;
}

/**
 * 获取存储的开机启动首选项
 */
function getStoredAutoLaunchPreference() {
  if (!store) return DEFAULT_AUTO_LAUNCH;
  const value = store.get(AUTO_LAUNCH_KEY);
  return typeof value === 'boolean' ? value : DEFAULT_AUTO_LAUNCH;
}

/**
 * 获取当前系统的登录启动状态（Windows / macOS）
 */
function getLoginItemStatus() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return { openAtLogin: false };
  if (!app.isPackaged) {
    return { openAtLogin: false, executableWillLaunchAtLogin: false, launchItems: [] };
  }
  try {
    if (process.platform === 'darwin') {
      return app.getLoginItemSettings();
    }
    return app.getLoginItemSettings({
      path: process.execPath,
      args: [],
    });
  } catch (error) {
    console.error('Failed to read login item settings:', error);
    return { openAtLogin: false };
  }
}

/**
 * 应用开机启动设置到系统
 */
function applyAutoLaunchSetting(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return getLoginItemStatus();
  if (!app.isPackaged) return getLoginItemStatus();
  try {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,   // 开机后以后台方式启动，不弹到前台
      });
    } else {
      const settings = {
        openAtLogin: enabled,
        path: process.execPath,
        args: [],
        name: LOGIN_ITEM_NAME,
      };
      app.setLoginItemSettings(settings);
    }
  } catch (error) {
    console.error('Failed to update login item settings:', error);
  }
  return getLoginItemStatus();
}

/**
 * 同步存储的设置到系统状态
 */
async function syncAutoLaunchPreference() {
  await initStore();
  if (!store) return { preference: DEFAULT_AUTO_LAUNCH, loginItem: getLoginItemStatus() };

  let preference = store.get(AUTO_LAUNCH_KEY);
  if (typeof preference !== 'boolean') {
    preference = DEFAULT_AUTO_LAUNCH;
    store.set(AUTO_LAUNCH_KEY, preference);
  }

  const loginItem = applyAutoLaunchSetting(preference);
  return { preference, loginItem };
}

/**
 * 修改并保存开机启动首选项
 */
async function setAutoLaunchPreference(enabled) {
  await initStore();
  if (!store) return { success: false, preference: DEFAULT_AUTO_LAUNCH, loginItem: getLoginItemStatus() };

  const preference = Boolean(enabled);
  store.set(AUTO_LAUNCH_KEY, preference);
  autoLaunchEnabled = preference;
  const loginItem = applyAutoLaunchSetting(preference);
  refreshTrayMenu();

  return { success: true, preference, loginItem };
}

/**
 * 获取当前完整的自启动信息
 */
async function getAutoLaunchPreference() {
  await initStore();
  return {
    success: Boolean(store),
    preference: getStoredAutoLaunchPreference(),
    loginItem: getLoginItemStatus(),
  };
}

/**
 * 刷新托盘菜单显示
 */
function refreshTrayMenu() {
  if (tray) {
    tray.setToolTip(trayT('trayTitle'));
    tray.setContextMenu(buildTrayMenu());
  }
}

/**
 * 窗口置顶逻辑 (ADR-018)
 */
function keepPetWindowOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // screen-saver 级别确保在全屏应用上方
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.moveTop();
}

function setPetWindowMousePassthrough(ignore, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mousePassthroughResetTimer) {
    clearTimeout(mousePassthroughResetTimer);
    mousePassthroughResetTimer = null;
  }

  const { leaseMs, ...electronOptions } = options || {};
  mainWindow.setIgnoreMouseEvents(ignore, electronOptions);

  if (!ignore && Number.isFinite(leaseMs) && leaseMs > 0) {
    const timeoutMs = leaseMs;
    mousePassthroughResetTimer = setTimeout(() => {
      mousePassthroughResetTimer = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
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

/**
 * 获取覆盖所有显示器的虚拟桌面边界。
 */
function getDesktopWindowBounds() {
  if (process.platform === 'darwin') {
    const display = currentPetDisplay || screen.getPrimaryDisplay();
    return display.bounds;
  }

  const virtualBounds = getVirtualDisplayBounds(screen.getAllDisplays());
  if (virtualBounds.width > 0 && virtualBounds.height > 0) {
    return virtualBounds;
  }

  return screen.getPrimaryDisplay().bounds;
}

function sendScreenInfo() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const windowDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const windowScaleFactor = Number.isFinite(windowDisplay?.scaleFactor) ? windowDisplay.scaleFactor : 1;
  let walkAreas = getWalkAreasRelativeToBounds(displays, bounds, windowScaleFactor, {
    primaryDisplayId: primaryDisplay?.id,
  });

  if (process.platform === 'darwin') {
    walkAreas = walkAreas.filter((area) => (
      area.x + area.width > 0
      && area.y + area.height > 0
      && area.x < bounds.width
      && area.y < bounds.height
    ));
  }

  let adjacentDisplays = null;
  if (process.platform === 'darwin' && currentPetDisplay) {
    adjacentDisplays = {
      left: Boolean(findAdjacentDisplay(currentPetDisplay, 'left', displays)),
      right: Boolean(findAdjacentDisplay(currentPetDisplay, 'right', displays)),
      top: Boolean(findAdjacentDisplay(currentPetDisplay, 'top', displays)),
      bottom: Boolean(findAdjacentDisplay(currentPetDisplay, 'bottom', displays)),
    };
  }

  const taskbarPlatforms = (process.platform === 'win32' || process.platform === 'darwin')
    ? getTaskbarPlatformsRelativeToBounds(displays, bounds, windowScaleFactor)
    : [];

  mainWindow.webContents.send('screen-info', {
    width: bounds.width,
    height: bounds.height,
    walkAreas,
    taskbarPlatforms,
    windowScaleFactor,
    adjacentDisplays,
    displays: displays.map((display) => ({
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      internal: display.internal,
    })),
  });
}

let lastDisplaysState = '';

function getActiveWindowDisplays() {
  const displays = screen.getAllDisplays();
  const currentState = displays.map(d => `${d.id}:${d.bounds.x},${d.bounds.y},${d.bounds.width},${d.bounds.height}`).join('|');
  if (lastDisplaysState && currentState !== lastDisplaysState) {
    displayFitScheduler.schedule();
  }
  lastDisplaysState = currentState;
  return displays;
}

function getActiveWindowMainBounds() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : getDesktopWindowBounds();
}

function sendActiveWindowInfo(activeWindowInfo) {
  if (!mainWindow || mainWindow.isDestroyed() || !activeWindowInfo) return;
  mainWindow.webContents.send('active-window-info', activeWindowInfo);
}

function unavailableActiveWindowPayload(reason) {
  return {
    ...unavailableActiveWindowInfo(reason),
    platform: null,
  };
}

function stopActiveWindowAwareness() {
  if (!activeWindowSampler) return;
  activeWindowSampler.stop();
  activeWindowSampler = null;
}

function startActiveWindowAwareness() {
  stopActiveWindowAwareness();
  const provider = windowAwarenessEnabled
    ? createActiveWindowProvider(process.platform)
    : { getActiveWindowInfo: async () => unavailableActiveWindowInfo('disabled') };

  activeWindowSampler = createActiveWindowSampler({
    provider,
    getWindowBounds: getActiveWindowMainBounds,
    getDisplays: getActiveWindowDisplays,
    onChange: sendActiveWindowInfo,
    intervalMs: ACTIVE_WINDOW_SAMPLE_INTERVAL_MS,
    refreshUnchangedIntervalMs: ACTIVE_WINDOW_SAMPLE_INTERVAL_MS,
  });
  activeWindowSampler.start();
}

function setWindowAwarenessEnabled(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  windowAwarenessEnabled = Boolean(enabled);
  if (mainWindow && !mainWindow.isDestroyed()) {
    startActiveWindowAwareness();
    if (!windowAwarenessEnabled) {
      sendActiveWindowInfo(unavailableActiveWindowPayload('disabled'));
    }
  }
  refreshTrayMenu();
}

function lockPetWindowToBounds(bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const currentBounds = mainWindow.getBounds();
  if (!areWindowBoundsEqual(currentBounds, bounds)) {
    const bridgeConstraints = getResizeBridgeConstraints(currentBounds, bounds);
    if (bridgeConstraints) {
      mainWindow.setMinimumSize(bridgeConstraints.minWidth, bridgeConstraints.minHeight);
      mainWindow.setMaximumSize(bridgeConstraints.maxWidth, bridgeConstraints.maxHeight);
    }
    mainWindow.setBounds(bounds);
  }

  mainWindow.setMinimumSize(bounds.width, bounds.height);
  mainWindow.setMaximumSize(bounds.width, bounds.height);
}

function fitWindowToAllDisplays() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (process.platform === 'darwin') {
    const allDisplays = screen.getAllDisplays();
    if (currentPetDisplay) {
      const stillExists = allDisplays.some((d) => d.id === currentPetDisplay.id);
      if (!stillExists) {
        currentPetDisplay = screen.getPrimaryDisplay();
      } else {
        currentPetDisplay = allDisplays.find((d) => d.id === currentPetDisplay.id)
          || screen.getPrimaryDisplay();
      }
    } else {
      currentPetDisplay = screen.getPrimaryDisplay();
    }
  }

  const bounds = getDesktopWindowBounds();
  lockPetWindowToBounds(bounds);
  sendScreenInfo();
  refreshTrayMenu();
}

function migrateWindowToDisplay(targetDisplay) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (!targetDisplay || !targetDisplay.bounds) return null;
  if (currentPetDisplay && currentPetDisplay.id === targetDisplay.id) return null;

  const oldBounds = mainWindow.getBounds();
  const newBounds = targetDisplay.bounds;

  const offset = {
    x: oldBounds.x - newBounds.x,
    y: oldBounds.y - newBounds.y,
  };

  currentPetDisplay = targetDisplay;
  lockPetWindowToBounds(newBounds);

  mainWindow.webContents.send('window-migrated', {
    offset,
    displayId: targetDisplay.id,
    displayBounds: newBounds,
  });

  sendScreenInfo();
  return offset;
}

function startDragPoll() {
  stopDragPoll();
  dragPollTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !currentPetDisplay) {
      stopDragPoll();
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const cursorDisplay = screen.getDisplayNearestPoint(cursor);
    if (cursorDisplay.id !== currentPetDisplay.id) {
      migrateWindowToDisplay(cursorDisplay);
    }
  }, 100);
}

function stopDragPoll() {
  if (dragPollTimer) {
    clearInterval(dragPollTimer);
    dragPollTimer = null;
  }
}

function getInitialStatusWindowBounds() {
  const width = 400;
  const height = 460;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;

  return {
    width,
    height,
    x: Math.round(x + (areaWidth - width) / 2),
    y: Math.round(y + (areaHeight - height) / 2),
  };
}

function sendStatusWindowData() {
  if (!statusWindow || statusWindow.isDestroyed() || !lastStatusWindowData) return;
  statusWindow.webContents.send('status-window-data', lastStatusWindowData);
}

function createStatusWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) return statusWindow;

  const bounds = getInitialStatusWindowBounds();
  statusWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  statusWindow.setAlwaysOnTop(true, 'floating');
  statusWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  statusWindow.loadFile(path.join(__dirname, 'src', 'status.html'));

  statusWindow.webContents.on('did-finish-load', sendStatusWindowData);
  statusWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  statusWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  statusWindow.on('closed', () => {
    statusWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-window-closed');
    }
  });

  return statusWindow;
}

function showStatusWindow(data) {
  lastStatusWindowData = data;
  const win = createStatusWindow();
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  sendStatusWindowData();
}

function updateStatusWindow(data) {
  lastStatusWindowData = data;
  sendStatusWindowData();
}

function hideStatusWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.hide();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-window-closed');
  }
}

function resizeStatusWindow(size) {
  if (!statusWindow || statusWindow.isDestroyed()) return;

  const { width, height } = normalizeStatusWindowSize(size);
  statusWindow.setContentSize(width, height);
}

function getStoredPomodoroMinutes() {
  if (!store) return normalizePomodoroMinutes(null);
  return normalizePomodoroMinutes(store.get(POMODORO_LAST_MINUTES_KEY));
}

function savePomodoroMinutes(minutes) {
  if (!store) return;
  store.set(POMODORO_LAST_MINUTES_KEY, normalizePomodoroMinutes(minutes));
}

function resolvePomodoroAsset(skinId, filename) {
  const safeSkinId = isAllowedSkinId(skinId, scanAvailableSkins()) ? skinId : 'default';
  const candidatePath = path.join(__dirname, 'src', 'assets', safeSkinId, filename);
  if (fs.existsSync(candidatePath)) {
    return `assets/${safeSkinId}/${filename}`;
  }
  return `assets/default/${filename}`;
}

function getPomodoroAssets() {
  return {
    yueqi: resolvePomodoroAsset(currentSkinId, 'left_cultivate.webp'),
    shenjiu: resolvePomodoroAsset(currentSkinId, 'right_cultivate.webp'),
  };
}

function getPomodoroSnapshot(now) {
  const snapshot = pomodoroSystem.getSnapshot(now);
  return {
    ...snapshot,
    lastPomodoroMinutes: snapshot.durationMinutes || getStoredPomodoroMinutes(),
    isAlwaysOnTop: pomodoroAlwaysOnTop,
    skinId: currentSkinId,
    assets: getPomodoroAssets(),
  };
}

function sendPomodoroState() {
  if (!pomodoroWindow || pomodoroWindow.isDestroyed()) return;
  pomodoroWindow.webContents.send('pomodoro-state', getPomodoroSnapshot());
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
      refreshTrayMenu();
    }
  }, 1000);
}

function getInitialPomodoroWindowBounds() {
  const width = 360;
  const height = 440;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;

  return {
    width,
    height,
    x: Math.round(x + (areaWidth - width) / 2),
    y: Math.round(y + (areaHeight - height) / 2),
  };
}

function createPomodoroWindow() {
  if (pomodoroWindow && !pomodoroWindow.isDestroyed()) return pomodoroWindow;

  pomodoroAlwaysOnTop = true;
  const bounds = getInitialPomodoroWindowBounds();
  pomodoroWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: pomodoroAlwaysOnTop,
    skipTaskbar: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyPomodoroWindowPinState();
  pomodoroWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pomodoroWindow.loadFile(path.join(__dirname, 'src', 'pomodoro.html'));

  pomodoroWindow.webContents.on('did-finish-load', sendPomodoroState);
  pomodoroWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pomodoroWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  pomodoroWindow.on('closed', () => {
    pomodoroWindow = null;
    stopPomodoroSession();
  });

  return pomodoroWindow;
}

function openPomodoroWindow() {
  const win = createPomodoroWindow();
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  win.focus();
  sendPomodoroState();
  return win;
}

async function startPomodoroSession(minutes) {
  await initStore();
  const normalizedMinutes = normalizePomodoroMinutes(minutes, getStoredPomodoroMinutes());
  savePomodoroMinutes(normalizedMinutes);
  const snapshot = pomodoroSystem.start(normalizedMinutes);
  enterPomodoroPetFocus();
  startPomodoroTicker();
  refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}

function stopPomodoroSession() {
  stopPomodoroTicker();
  const snapshot = pomodoroSystem.stop();
  restorePomodoroPetFocus();
  refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}

function closePomodoroWindow() {
  stopPomodoroSession();
  if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
    pomodoroWindow.close();
  }
  return getPomodoroSnapshot();
}

function applyPomodoroWindowPinState(shouldRaise = false) {
  if (!pomodoroWindow || pomodoroWindow.isDestroyed()) return;

  pomodoroWindow.setAlwaysOnTop(pomodoroAlwaysOnTop, POMODORO_ALWAYS_ON_TOP_LEVEL);

  if (!shouldRaise) return;

  if (pomodoroWindow.isMinimized()) {
    pomodoroWindow.restore();
  }
  if (!pomodoroWindow.isVisible()) {
    pomodoroWindow.show();
  }
  pomodoroWindow.moveTop();
  pomodoroWindow.focus();
}

function setPomodoroAlwaysOnTop(enabled) {
  pomodoroAlwaysOnTop = Boolean(enabled);
  applyPomodoroWindowPinState(true);
  sendPomodoroState();
  return getPomodoroSnapshot();
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

function sendPetVisibility(visible) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('toggle-pet-visibility', visible);
}

function enterPomodoroPetFocus() {
  if (!pomodoroFocusSnapshot) {
    pomodoroFocusSnapshot = { wasPaused: isPaused };
  }
  pomodoroPetHidden = true;
  sendPetVisibility(false);
  if (!isPaused) {
    isPaused = true;
    if (mainWindow) mainWindow.webContents.send('toggle-pause', true);
  }
  refreshTrayMenu();
}

function restorePomodoroPetFocus() {
  if (!pomodoroFocusSnapshot && !pomodoroPetHidden) return;
  const wasPaused = pomodoroFocusSnapshot ? pomodoroFocusSnapshot.wasPaused : isPaused;
  pomodoroPetHidden = false;
  if (isPaused !== wasPaused) {
    isPaused = wasPaused;
    if (mainWindow) mainWindow.webContents.send('toggle-pause', isPaused);
  }
  sendPetVisibility(!isPetCurrentlyHidden());
  pomodoroFocusSnapshot = null;
  refreshTrayMenu();
}

function showPetManually() {
  petHidden = false;
  meetingHidden = false;
  sendPetVisibility(!isPetCurrentlyHidden());
  refreshTrayMenu();
}

function hidePetManually() {
  petHidden = true;
  meetingHidden = false;
  sendPetVisibility(false);
  refreshTrayMenu();
}

function hidePetForMeeting() {
  if (meetingHidden) return;
  meetingHidden = true;
  if (!petHidden && !pomodoroPetHidden) {
    sendPetVisibility(false);
  }
  refreshTrayMenu();
}

function showPetAfterMeeting() {
  if (!meetingHidden) return;
  meetingHidden = false;
  if (!petHidden && !pomodoroPetHidden) {
    sendPetVisibility(true);
  }
  refreshTrayMenu();
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
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }

  showPetManually();
  keepPetWindowOnTop();
}

/**
 * 创建主渲染窗口
 */
function createWindow() {
  if (process.platform === 'darwin') {
    currentPetDisplay = screen.getPrimaryDisplay();
  }

  const { x, y, width, height } = getDesktopWindowBounds();

  mainWindow = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 清理缓存并加载页面
  mainWindow.webContents.session.clearCache().finally(() => {
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  });

  // 设置鼠标穿透逻辑
  setPetWindowMousePassthrough(true, { forward: true });

  lockPetWindowToBounds({ x, y, width, height });

  // macOS 特有：全工作区可见
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 启动置顶守护
  startKeepOnTopWatcher();

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded successfully');
    sendScreenInfo();
    sendActiveWindowInfo(activeWindowSampler?.getLastPayload());
    sendPetVisibility(!isPetCurrentlyHidden());
    keepPetWindowOnTop();
    startMeetingDetector();
  });

  // 安全加固：禁止新窗口和导航 (ADR-014)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // 关键事件触发置顶重刷
  mainWindow.on('show', keepPetWindowOnTop);
  mainWindow.on('restore', keepPetWindowOnTop);
  mainWindow.on('blur', keepPetWindowOnTop);
  installFinalSaveBeforeClose(mainWindow);

  mainWindow.on('closed', () => {
    if (keepOnTopTimer) {
      clearInterval(keepOnTopTimer);
      keepOnTopTimer = null;
    }
    if (mousePassthroughResetTimer) {
      clearTimeout(mousePassthroughResetTimer);
      mousePassthroughResetTimer = null;
    }
    stopDragPoll();
    displayFitScheduler.clear();
    stopActiveWindowAwareness();
    if (statusWindow && !statusWindow.isDestroyed()) {
      statusWindow.close();
    }
    if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
      pomodoroWindow.close();
    }
    mainWindow = null;
  });

  screen.on('display-added', displayFitScheduler.schedule);
  screen.on('display-removed', displayFitScheduler.schedule);
  screen.on('display-metrics-changed', displayFitScheduler.schedule);
  startActiveWindowAwareness();
}

/**
 * 构建托盘菜单
 */
/**
 * 扫描 src/assets/ 下的子目录，返回可用皮肤 ID 列表。
 * 使用 fs.statSync 过滤，仅返回文件夹名，排除非目录文件。
 */
function scanAvailableSkins() {
  try {
    const assetsDir = path.join(__dirname, 'src', 'assets');
    const entries = fs.readdirSync(assetsDir);
    return entries.filter(entry => {
      try {
        const fullPath = path.normalize(path.join(assetsDir, entry));
        if (!fullPath.startsWith(assetsDir)) return false;
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    }).sort((a, b) => {
      const keys = Object.keys(SKIN_NAME_KEYS);
      const indexA = keys.indexOf(a);
      const indexB = keys.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
  } catch (error) {
    console.error('Failed to scan skins:', error);
    return ['default'];
  }
}

function getPomodoroTrayLabel() {
  const snapshot = getPomodoroSnapshot();
  if (snapshot.status === 'running') {
    const minutes = Math.max(1, Math.ceil(snapshot.remainingMs / 60000));
    return `${trayText('trayPomodoroRunning', 'Pomodoro')} ${minutes} ${trayMenuLabel('trayMinuteUnit')}`;
  }
  if (snapshot.status === 'completed') {
    return trayMenuLabel('trayPomodoroCompleted', 'Pomodoro complete');
  }
  return trayMenuLabel('trayPomodoroOpen');
}

function buildTrayMenu() {
  const updateMenuState = getUpdateMenuState();
  const appVersion = app.getVersion();

  // 构建皮肤切换子菜单
  const availableSkins = scanAvailableSkins();
  const skinSubmenu = availableSkins.map(skinId => ({
    label: getSkinDisplayName(skinId),
    type: 'radio',
    checked: skinId === currentSkinId,
    click: () => {
      currentSkinId = skinId;
      if (mainWindow) mainWindow.webContents.send('switch-skin', skinId);
      sendPomodoroState();
      refreshTrayMenu();
    },
  }));

  // 构建语言切换子菜单
  const langSubmenu = [
    { lang: 'zh', key: 'langZh' },
    { lang: 'en', key: 'langEn' },
    { lang: 'ja', key: 'langJa' },
  ].map(({ lang, key }) => ({
    label: trayMenuLabel(key),
    type: 'radio',
    checked: lang === currentLocale,
    click: async () => {
      currentLocale = lang;
      await initStore();
      if (store) store.set(LOCALE_KEY, lang);
      refreshTrayMenu();
      if (mainWindow) mainWindow.webContents.send('locale-changed', lang);
      if (statusWindow && !statusWindow.isDestroyed()) {
        statusWindow.webContents.send('locale-changed', lang);
      }
      if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
        pomodoroWindow.webContents.send('locale-changed', lang);
      }
    },
  }));

  return Menu.buildFromTemplate([
    {
      label: trayMenuLabel('trayTitle'),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: trayMenuLabel('trayStatusPanel'),
      click: () => {
        if (mainWindow) mainWindow.webContents.send('toggle-status-panel');
      },
    },
    {
      label: getPomodoroTrayLabel(),
      click: () => {
        openPomodoroWindow();
      },
    },
    {
      label: trayMenuLabel('traySwitchSkin'),
      submenu: skinSubmenu,
    },
    {
      label: isPaused ? trayMenuLabel('trayResumeWalk') : trayMenuLabel('trayPauseWalk'),
      enabled: !pomodoroPetHidden,
      click: () => {
        isPaused = !isPaused;
        if (mainWindow) mainWindow.webContents.send('toggle-pause', isPaused);
        refreshTrayMenu();
      },
    },
    {
      label: isPetCurrentlyHidden() ? trayMenuLabel('trayShowPet') : trayMenuLabel('trayHidePet'),
      enabled: !pomodoroPetHidden,
      click: () => {
        if (isPetCurrentlyHidden()) {
          showPetManually();
        } else {
          hidePetManually();
        }
      },
    },
    {
      label: trayMenuLabel('trayResetPos'),
      click: () => {
        if (mainWindow) mainWindow.webContents.send('reset-positions');
      },
    },
    ...(process.platform === 'darwin' && screen.getAllDisplays().length > 1 ? [{
      label: trayMenuLabel('traySwitchScreen'),
      submenu: screen.getAllDisplays().map((display, idx) => ({
        label: `${trayMenuLabel('trayScreen')} ${idx + 1}${currentPetDisplay && display.id === currentPetDisplay.id ? ' \u2713' : ''}`,
        click: () => {
          migrateWindowToDisplay(display);
          refreshTrayMenu();
        },
      })),
    }] : []),
    { type: 'separator' },
    {
      label: breakReminderEnabled ? trayMenuLabel('trayBreakReminderOn') : trayMenuLabel('trayBreakReminderOff'),
      click: async () => {
        breakReminderEnabled = !breakReminderEnabled;
        const newSettings = { enabled: breakReminderEnabled, intervalMinutes: breakReminderIntervalMinutes, idleResetMinutes: 5 };
        if (breakReminderService) breakReminderService.updateSettings(newSettings);
        await initStore();
        if (store) store.set(BREAK_REMINDER_STORE_KEY, newSettings);
        refreshTrayMenu();
      },
    },
    {
      label: trayMenuLabel('trayBreakReminderInterval'),
      submenu: BREAK_REMINDER_TRAY_INTERVALS.map(minutes => ({
        label: `${minutes} ${trayMenuLabel('trayMinuteUnit')}`,
        type: 'radio',
        checked: breakReminderIntervalMinutes === minutes,
        click: async () => {
          breakReminderIntervalMinutes = minutes;
          const newSettings = { enabled: breakReminderEnabled, intervalMinutes: minutes, idleResetMinutes: 5 };
          if (breakReminderService) breakReminderService.updateSettings(newSettings);
          await initStore();
          if (store) store.set(BREAK_REMINDER_STORE_KEY, newSettings);
          refreshTrayMenu();
        },
      })),
    },
    {
      label: (process.platform === 'win32' || process.platform === 'darwin')
        ? (windowAwarenessEnabled ? trayMenuLabel('trayWindowAwarenessOff') : trayMenuLabel('trayWindowAwarenessOn'))
        : trayMenuLabel('trayWindowAwarenessUnavailable'),
      enabled: process.platform === 'win32' || process.platform === 'darwin',
      click: () => setWindowAwarenessEnabled(!windowAwarenessEnabled),
    },
    {
      label: trayMenuLabel('trayLanguage'),
      submenu: langSubmenu,
    },
    {
      label: autoLaunchEnabled ? trayMenuLabel('trayAutoLaunchOn') : trayMenuLabel('trayAutoLaunchOff'),
      click: async () => {
        autoLaunchEnabled = !autoLaunchEnabled;
        await setAutoLaunchPreference(autoLaunchEnabled);
        refreshTrayMenu();
      },
    },
    {
      label: updateMenuState.checking ? trayMenuLabel('trayUpdateChecking')
        : updateMenuState.downloading ? trayMenuLabel('trayUpdateDownloading')
          : trayMenuLabel('trayUpdateCheck'),
      enabled: updateMenuState.enabled,
      click: () => {
        void checkForUpdatesFromTray();
      },
    },
    ...(!app.isPackaged ? [
      {
        label: trayMenuLabel('trayDevTools'),
        click: () => {
          if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
        },
      },
    ] : []),
    {
      label: trayMenuLabel('trayQuit'),
      click: () => {
        app.quit();
      },
    },
    { type: 'separator' },
    {
      label: `${trayMenuLabel('trayVersion', 'Version')} ${appVersion}`,
      enabled: false,
    },
  ]);
}

/**
 * 创建系统托盘
 */
function createTray() {
  const icon = nativeImage.createFromBitmap(createTrayIconBuffer(), {
    width: 16,
    height: 16,
  });

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  refreshTrayMenu();
}

function sendUpdateProgressPayload(payload) {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
  updateProgressWindow.webContents.send('update-progress', payload);
}

function showUpdateProgressWindow(payload) {
  const normalizedPayload = {
    mode: payload.mode,
    title: payload.title,
    message: payload.message,
    percent: payload.percent ?? 0,
  };

  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) {
    updateProgressWindow = new BrowserWindow({
      width: 380,
      height: 172,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: normalizedPayload.title,
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      webPreferences: {
        preload: path.join(__dirname, 'updateProgressPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    updateProgressWindow.setMenuBarVisibility(false);
    updateProgressWindow.on('closed', () => {
      updateProgressWindow = null;
    });
    updateProgressWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    updateProgressWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    updateProgressWindow.loadFile(path.join(__dirname, 'src', 'update-progress.html'));

    updateProgressWindow.webContents.once('did-finish-load', () => {
      sendUpdateProgressPayload(normalizedPayload);
    });
    return;
  }

  updateProgressWindow.setTitle(normalizedPayload.title);
  updateProgressWindow.show();
  updateProgressWindow.focus();
  sendUpdateProgressPayload(normalizedPayload);
}

function setUpdateProgress(percent) {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
  sendUpdateProgressPayload({
    mode: 'downloading',
    title: trayText('updateDownloadingTitle', 'Downloading Update'),
    message: trayT('updateDownloadingMsg'),
    percent,
  });
}

function closeUpdateProgressWindow() {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
  updateProgressWindow.close();
  updateProgressWindow = null;
}

/**
 * 绘制简单的托盘图标像素图
 */
function createTrayIconBuffer() {
  const size = 16;
  const pixels = Buffer.alloc(size * size * 4);
  const bitmap = [
    '                ',
    '                ',
    '                ',
    '  XXXXX   XXXX  ',
    '      X  X    X ',
    '     X   X    X ',
    '     X    XXXXX ',
    '    X         X ',
    '    X         X ',
    '   X      XXXX  ',
    '                ',
    '                ',
    '                ',
    '                ',
    '                ',
    '                ',
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const isFilled = bitmap[y]?.[x] === 'X';

      if (isFilled) {
        pixels[idx] = 0;      // R
        pixels[idx + 1] = 128;  // G
        pixels[idx + 2] = 0;    // B
        pixels[idx + 3] = 255;  // A
      } else {
        pixels[idx + 3] = 0;    // 透明
      }
    }
  }
  return pixels;
}

// --- IPC 通信监听 ---

ipcMain.on('set-ignore-mouse-events', (_event, ignore, options) => {
  const request = normalizeMousePassthroughRequest(ignore, options);
  if (!request) return;
  setPetWindowMousePassthrough(request.ignore, request.options);
});

ipcMain.on('request-window-migration', (_event, direction) => {
  const normalizedDirection = normalizeWindowMigrationDirection(direction);
  if (!normalizedDirection) return;
  if (process.platform !== 'darwin' || !currentPetDisplay) return;
  const allDisplays = screen.getAllDisplays();
  const adjacent = findAdjacentDisplay(currentPetDisplay, normalizedDirection, allDisplays);
  if (adjacent) {
    migrateWindowToDisplay(adjacent);
  }
});

ipcMain.on('drag-started', () => {
  if (process.platform !== 'darwin') return;
  startDragPoll();
});

ipcMain.on('drag-ended', () => {
  stopDragPoll();
});

ipcMain.on('show-status-window', (_event, data) => {
  showStatusWindow(data);
});

ipcMain.on('hide-status-window', () => {
  hideStatusWindow();
});

ipcMain.on('update-status-window', (_event, data) => {
  updateStatusWindow(data);
});

ipcMain.on('resize-status-window', (_event, size) => {
  resizeStatusWindow(size);
});

// 允许存储的合法 Key 列表 (安全白名单)
const ALLOWED_STORE_KEYS = [
  'autoLaunch',
  'petState',
  'locale',
  BREAK_REMINDER_STORE_KEY,
  POMODORO_LAST_MINUTES_KEY,
];

ipcMain.handle('save-data', async (_event, key, value) => {
  if (!ALLOWED_STORE_KEYS.includes(key)) {
    console.warn(`[Security] 拦截到非法的数据保存请求: ${key}`);
    return false;
  }
  try {
    await initStore();
    if (!store) return false;
    store.set(key, value);
    return true;
  } catch (error) {
    console.error('Save failed:', error);
    return false;
  }
});

ipcMain.handle('load-data', async (_event, key) => {
  if (!ALLOWED_STORE_KEYS.includes(key)) {
    console.warn(`[Security] 拦截到非法的数据读取请求: ${key}`);
    return null;
  }
  try {
    await initStore();
    return store ? store.get(key) : null;
  } catch (error) {
    console.error('Load failed:', error);
    return null;
  }
});

ipcMain.handle('set-auto-launch', async (_event, enabled) => {
  return setAutoLaunchPreference(enabled);
});

ipcMain.handle('get-auto-launch', async () => {
  return getAutoLaunchPreference();
});

ipcMain.handle('get-available-skins', () => {
  return scanAvailableSkins();
});

ipcMain.handle('get-active-window-info', async () => {
  if (!activeWindowSampler) startActiveWindowAwareness();
  return activeWindowSampler.sampleOnce();
});

ipcMain.handle('set-current-skin', async (_event, skinId) => {
  if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
    return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
  }
  try {
    currentSkinId = skinId;
    sendPomodoroState();
    refreshTrayMenu();
    return createIpcSuccess({ skinId });
  } catch (error) {
    console.error('Failed to set current skin:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to set current skin');
  }
});

// 多语言系统 IPC
ipcMain.handle('pomodoro-open-window', async () => {
  try {
    await initStore();
    openPomodoroWindow();
    return createIpcSuccess(getPomodoroSnapshot());
  } catch (error) {
    console.error('Failed to open pomodoro window:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to open pomodoro window');
  }
});

ipcMain.handle('pomodoro-get-state', async () => {
  try {
    await initStore();
    return createIpcSuccess(getPomodoroSnapshot());
  } catch (error) {
    console.error('Failed to read pomodoro state:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to read pomodoro state');
  }
});

ipcMain.handle('pomodoro-start', async (_event, minutes) => {
  try {
    await startPomodoroSession(minutes);
    return createIpcSuccess(getPomodoroSnapshot());
  } catch (error) {
    console.error('Failed to start pomodoro:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to start pomodoro');
  }
});

ipcMain.handle('pomodoro-stop', async () => {
  try {
    stopPomodoroSession();
    return createIpcSuccess(getPomodoroSnapshot());
  } catch (error) {
    console.error('Failed to stop pomodoro:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to stop pomodoro');
  }
});

ipcMain.handle('pomodoro-close-window', async () => {
  try {
    return createIpcSuccess(closePomodoroWindow());
  } catch (error) {
    console.error('Failed to close pomodoro window:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to close pomodoro window');
  }
});

ipcMain.handle('pomodoro-set-always-on-top', async (_event, enabled) => {
  try {
    return createIpcSuccess(setPomodoroAlwaysOnTop(enabled));
  } catch (error) {
    console.error('Failed to update pomodoro pin state:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to update pomodoro pin state');
  }
});

ipcMain.handle('get-locale', () => currentLocale);

ipcMain.handle('set-locale', async (_event, lang) => {
  if (!['zh', 'en', 'ja'].includes(lang)) return { success: false };
  currentLocale = lang;
  await initStore();
  if (store) store.set(LOCALE_KEY, lang);
  refreshTrayMenu();
  if (mainWindow) mainWindow.webContents.send('locale-changed', lang);
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.webContents.send('locale-changed', lang);
  }
  if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
    pomodoroWindow.webContents.send('locale-changed', lang);
  }
  return { success: true, locale: lang };
});

// 久坐提醒 IPC
ipcMain.on('break-reminder-dismissed', () => {
  if (breakReminderService) breakReminderService.onDismissed();
});

// --- 应用生命周期 ---

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId(APP_USER_MODEL_ID);


  app.on('second-instance', showExistingInstance);
  app.on('before-quit', () => {
    stopMeetingDetector();
    stopPomodoroTicker();
  });

  app.whenReady().then(async () => {
    disableApplicationMenu();

    // macOS: 隐藏 Dock 图标，桌宠不应在 Dock 栏占位
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    // 设置权限拦截
    const { session, powerMonitor } = require('electron');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    await initStore();
    // 加载持久化语言设置，若无则自动检测
    const storedLocale = store ? store.get(LOCALE_KEY) : null;
    currentLocale = ['zh', 'en', 'ja'].includes(storedLocale) ? storedLocale : detectLocale();
    const syncResult = await syncAutoLaunchPreference();
    autoLaunchEnabled = syncResult.preference;

    // --- 久坐提醒服务初始化 ---
    const storedBreakSettings = store ? store.get(BREAK_REMINDER_STORE_KEY) : null;
    const breakSettings = normalizeBreakReminderSettings(storedBreakSettings);
    breakReminderEnabled = breakSettings.enabled;
    breakReminderIntervalMinutes = breakSettings.intervalMinutes;

    const presentationGuard = createPresentationGuard({
      platform: process.platform,
      getActiveWindowInfo: () => activeWindowSampler?.getLastPayload() || null,
      getDisplays: () => screen.getAllDisplays(),
    });

    breakReminderService = createBreakReminderService({
      powerMonitor,
      presentationGuard,
      settings: breakSettings,
      onReminderDue: (payload) => {
        // 桌宠隐藏时不提示
        if (isPetCurrentlyHidden()) return false;
        if (!mainWindow || mainWindow.isDestroyed()) return false;
        mainWindow.webContents.send('break-reminder-triggered', payload);
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-suspended');
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-resumed', { offlineMs });
      }
    });

    initUpdateManager({
      app,
      dialog,
      getMainWindow: () => mainWindow,
      refreshTrayMenu,
      updateProgressUi: {
        showChecking: ({ title, message }) => showUpdateProgressWindow({
          mode: 'checking',
          title,
          message,
        }),
        showDownloading: ({ title, message, percent }) => showUpdateProgressWindow({
          mode: 'downloading',
          title,
          message,
          percent,
        }),
        setProgress: setUpdateProgress,
        close: closeUpdateProgressWindow,
      },
      t: trayT,
    });
    createWindow();
    createTray();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

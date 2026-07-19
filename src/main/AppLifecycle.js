const { app } = require('electron');
const { BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  getTaskbarPlatformsRelativeToBounds,
  getVirtualDisplayBounds,
  getWalkAreasRelativeToBounds,
  findAdjacentDisplay,
} = require('../../displayBounds');
const { createActiveWindowProvider, unavailableActiveWindowInfo } = require('../../activeWindowProvider');
const { createActiveWindowSampler } = require('../../activeWindowAwareness');
const {
  areWindowBoundsEqual,
  createDisplayFitScheduler,
  getResizeBridgeConstraints,
} = require('../../displayFit');
const {
  initUpdateManager,
  checkForUpdatesFromTray,
  getUpdateMenuState,
} = require('../../updateManager');
const {
  createIpcFailure,
  createIpcSuccess,
  isAllowedSkinId,
  normalizeMousePassthroughRequest,
  normalizePomodoroMinutes,
  normalizeStatusWindowSize,
  normalizeWindowMigrationDirection,
} = require('../../ipcContracts');
const {
  createBreakReminderService,
  normalizeSettings: normalizeBreakReminderSettings,
  DEFAULT_SETTINGS: DEFAULT_BREAK_REMINDER_SETTINGS,
} = require('../../breakReminderService');
const { createPresentationGuard } = require('../../presentationGuard');
const { createMeetingDetector } = require('../../meetingDetector');
const { PomodoroSystem } = require('../../src/systems/PomodoroSystem');
const { createAssetUrl, hasProtectedAsset, listAvailableSkinIds } = require('../../protectedAssetLoader');
const { registerProtectedAssetProtocol } = require('../../protectedAssetProtocol');
const { buildSkinGalleryItems } = require('../../skinGallery');
const { I18N } = require('../../src/data/i18n');
const {
  DEFAULT_WEATHER_SYNC_SETTINGS,
  normalizeSettings: normalizeWeatherSyncSettings,
  fetchWeather,
  processSettingsChange,
} = require('../../weatherSyncService');
const StoreManager = require('./services/StoreManager');
const AutoLaunchService = require('./services/AutoLaunchService');
const windowManager = require('./windows/WindowManager');
const statusWindowModule = require('./windows/StatusWindow');
const citySettingWindowModule = require('./windows/CitySettingWindow');
const skinSelectorWindowModule = require('./windows/SkinSelectorWindow');
const pomodoroWindowModule = require('./windows/PomodoroWindow');
const trayManager = require('./TrayManager');

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
const WEATHER_SYNC_STORE_KEY = 'weatherSyncSettings';

protocol.registerSchemesAsPrivileged([{
  scheme: 'pet-asset',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
  },
}]);



// 皮肤显示名多语言 key 映射表（文件夹名 → I18N.ui key）
const SKIN_NAME_KEYS = {
  'default': 'skinDefault',
  'birds': 'skinBirds',
  'animal_ears': 'skinAnimalEars',
  'school_au': 'skinSchoolAu',
};

// 皮肤选择器用：皮肤名（不含画师）
const SKIN_LABEL_KEYS = {
  'default': 'skinDefaultLabel',
  'birds': 'skinBirdsLabel',
  'animal_ears': 'skinAnimalEarsLabel',
  'school_au': 'skinSchoolAuLabel',
};

// 皮肤选择器用：画师名
const SKIN_ARTIST_KEYS = {
  'default': 'skinDefaultArtist',
  'birds': 'skinBirdsArtist',
  'animal_ears': 'skinAnimalEarsArtist',
  'school_au': 'skinSchoolAuArtist',
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









function getSkinGalleryDisplayName(skinId) {
  const key = SKIN_NAME_KEYS[skinId];
  return key ? trayManager.trayT(key) : skinId;
}

function getSkinLabel(skinId) {
  const key = SKIN_LABEL_KEYS[skinId];
  return key ? trayManager.trayT(key) : skinId;
}

function getSkinArtistName(skinId) {
  const key = SKIN_ARTIST_KEYS[skinId];
  return key ? trayManager.trayT(key) : '';
}

let lastStatusWindowData = null;
let store = null;
let petHidden = false;         // 桌宠隐藏状态
let meetingHidden = false;     // 会议检测导致的自动隐藏状态
let isPaused = false;          // 走动暂停状态
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
let weatherSyncSettings = { ...DEFAULT_WEATHER_SYNC_SETTINGS };
let weatherSyncIntervalTimer = null;
let weatherSyncSettingsUpdateId = 0;
let finalSaveRequestId = 0;
let currentPetDisplay = null;
let dragPollTimer = null;
let suspendTimestamp = 0; // Date.now() recorded at system suspend for sleep-decay calculation
let pomodoroSystem = new PomodoroSystem();
let pomodoroTickTimer = null;
let pomodoroFocusSnapshot = null;
let pomodoroPetHidden = false;
const FINAL_SAVE_TIMEOUT_MS = 2500;
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
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;
  const bounds = windowManager.mainWindow.getBounds();
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

  windowManager.mainWindow.webContents.send('screen-info', {
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
  return windowManager.mainWindow && !windowManager.mainWindow.isDestroyed() ? windowManager.mainWindow.getBounds() : getDesktopWindowBounds();
}

function sendActiveWindowInfo(activeWindowInfo) {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed() || !activeWindowInfo) return;
  windowManager.mainWindow.webContents.send('active-window-info', activeWindowInfo);
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
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    startActiveWindowAwareness();
    if (!windowAwarenessEnabled) {
      sendActiveWindowInfo(unavailableActiveWindowPayload('disabled'));
    }
  }
  trayManager.refreshTrayMenu();
}

function lockPetWindowToBounds(bounds) {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;

  const currentBounds = windowManager.mainWindow.getBounds();
  if (!areWindowBoundsEqual(currentBounds, bounds)) {
    const bridgeConstraints = getResizeBridgeConstraints(currentBounds, bounds);
    if (bridgeConstraints) {
      windowManager.mainWindow.setMinimumSize(bridgeConstraints.minWidth, bridgeConstraints.minHeight);
      windowManager.mainWindow.setMaximumSize(bridgeConstraints.maxWidth, bridgeConstraints.maxHeight);
    }
    windowManager.mainWindow.setBounds(bounds);
  }

  windowManager.mainWindow.setMinimumSize(bounds.width, bounds.height);
  windowManager.mainWindow.setMaximumSize(bounds.width, bounds.height);
}

function fitWindowToAllDisplays() {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;

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
  trayManager.refreshTrayMenu();
}

function migrateWindowToDisplay(targetDisplay) {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return null;
  if (!targetDisplay || !targetDisplay.bounds) return null;
  if (currentPetDisplay && currentPetDisplay.id === targetDisplay.id) return null;

  const oldBounds = windowManager.mainWindow.getBounds();
  const newBounds = targetDisplay.bounds;

  const offset = {
    x: oldBounds.x - newBounds.x,
    y: oldBounds.y - newBounds.y,
  };

  currentPetDisplay = targetDisplay;
  lockPetWindowToBounds(newBounds);

  windowManager.mainWindow.webContents.send('window-migrated', {
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
    if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed() || !currentPetDisplay) {
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





function sendStatusWindowData() {
  if (!windowManager.statusWindow || windowManager.statusWindow.isDestroyed() || !lastStatusWindowData) return;
  windowManager.statusWindow.webContents.send('status-window-data', lastStatusWindowData);
}



function showStatusWindow(data) {
  lastStatusWindowData = data;
  statusWindowModule.openStatusWindow();
  trayManager.refreshTrayMenu();
}

function updateStatusWindow(data) {
  lastStatusWindowData = data;
  sendStatusWindowData();
}

function hideStatusWindow() {
  if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {
    windowManager.statusWindow.hide();
    trayManager.refreshTrayMenu();
  }
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send('status-window-closed');
  }
}

function resizeStatusWindow(size) {
  if (!windowManager.statusWindow || windowManager.statusWindow.isDestroyed()) return;

  const { width, height } = normalizeStatusWindowSize(size);
  windowManager.statusWindow.setContentSize(width, height);
}



function isSkinSelectorRequest(event) {
  return Boolean(
    windowManager.skinSelectorWindow
    && !windowManager.skinSelectorWindow.isDestroyed()
    && event?.sender?.id === windowManager.skinSelectorWindow.webContents.id,
  );
}



app.openSkinSelectorForQA = skinSelectorWindowModule.openSkinSelectorWindow;

function cancelSkinPreview() {
  if (skinSelectorWindowModule.getSkinSelectorOriginalSkinId() != null && skinSelectorWindowModule.getSkinSelectorOriginalSkinId() !== currentSkinId) {
    selectSkin(skinSelectorWindowModule.getSkinSelectorOriginalSkinId());
  }
  skinSelectorWindowModule.setSkinSelectorOriginalSkinId();
  hideSkinSelector();
}

function hideSkinSelector() {
  skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
  if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
    windowManager.skinSelectorWindow.hide();
  }
}

function getStoredPomodoroMinutes() {
  if (!store) return normalizePomodoroMinutes(null);
  return normalizePomodoroMinutes(store.get(POMODORO_LAST_MINUTES_KEY));
}

function savePomodoroMinutes(minutes) {
  if (!store) return;
  store.set(POMODORO_LAST_MINUTES_KEY, normalizePomodoroMinutes(minutes));
}

function getStoredWeatherSyncSettings() {
  if (!store) return { ...DEFAULT_WEATHER_SYNC_SETTINGS };
  const raw = store.get(WEATHER_SYNC_STORE_KEY);
  return normalizeWeatherSyncSettings(raw);
}

function saveWeatherSyncSettings(settings) {
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











function resolvePomodoroAsset(skinId, filename) {
  const safeSkinId = isAllowedSkinId(skinId, scanAvailableSkins()) ? skinId : 'default';
  const protectedAssetId = `skin/${safeSkinId}/${filename}`;
  if (hasProtectedAsset(protectedAssetId, { appRoot: __dirname, resourcesPath: process.resourcesPath })) {
    return createAssetUrl(protectedAssetId);
  }

  const candidatePath = path.join(__dirname, '..', '..', 'src', 'assets', safeSkinId, filename);
  if (fs.existsSync(candidatePath)) {
    return createAssetUrl(protectedAssetId);
  }
  return createAssetUrl(`skin/default/${filename}`);
}

let cachedPomodoroAssets = null;
let cachedPomodoroAssetsSkinId = null;

function getPomodoroAssets() {
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
    skinId: currentSkinId,
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



function applyPomodoroWindowPinState(shouldRaise = false) {
  if (!windowManager.pomodoroWindow || windowManager.pomodoroWindow.isDestroyed()) return;

  windowManager.pomodoroWindow.setAlwaysOnTop(pomodoroWindowModule.isPomodoroAlwaysOnTop(), POMODORO_ALWAYS_ON_TOP_LEVEL);

  if (pomodoroWindowModule.isPomodoroAlwaysOnTop()) {
    windowManager.pomodoroWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    windowManager.pomodoroWindow.setVisibleOnAllWorkspaces(false);
  }

  if (!shouldRaise) return;

  if (windowManager.pomodoroWindow.isMinimized()) {
    windowManager.pomodoroWindow.restore();
  }
  if (!windowManager.pomodoroWindow.isVisible()) {
    windowManager.pomodoroWindow.show();
  }
  windowManager.pomodoroWindow.moveTop();
  windowManager.pomodoroWindow.focus();
}

function setPomodoroAlwaysOnTop(enabled) {
  pomodoroWindowModule.isPomodoroAlwaysOnTop() = Boolean(enabled);
  // Only raise when pinning; when unpinning the user is already looking at the
  // window and moveTop()/focus() would re-promote it into macOS fullscreen Spaces.
  applyPomodoroWindowPinState(pomodoroWindowModule.isPomodoroAlwaysOnTop());
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
    currentPetDisplay = screen.getPrimaryDisplay();
  }

  const { x, y, width, height } = getDesktopWindowBounds();

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

  lockPetWindowToBounds({ x, y, width, height });

  // macOS 特有：全工作区可见
  windowManager.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 启动置顶守护
  startKeepOnTopWatcher();

  windowManager.mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded successfully');
    sendScreenInfo();
    sendActiveWindowInfo(activeWindowSampler?.getLastPayload());
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
    stopDragPoll();
    displayFitScheduler.clear();
    stopActiveWindowAwareness();
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
let cachedAvailableSkins = null;
let cachedAvailableSkinsTimestamp = 0;
const SKINS_CACHE_TTL_MS = 2000;

function scanAvailableSkins(forceRefresh = false) {
  if (!forceRefresh && cachedAvailableSkins && Date.now() - cachedAvailableSkinsTimestamp < SKINS_CACHE_TTL_MS) {
    return cachedAvailableSkins;
  }
  try {
    const protectedSkinIds = listAvailableSkinIds({
      appRoot: __dirname,
      resourcesPath: process.resourcesPath,
      appPath: typeof app?.getAppPath === 'function' ? app.getAppPath() : null,
    });
    if (protectedSkinIds.length > 0) {
      cachedAvailableSkins = protectedSkinIds.sort(sortSkinIds);
      cachedAvailableSkinsTimestamp = Date.now();
      return cachedAvailableSkins;
    }

    const assetsDir = path.join(__dirname, '..', '..', 'src', 'assets');
    const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
    cachedAvailableSkins = entries.filter(dirent => {
      if (!dirent.isDirectory()) return false;
      const entry = path.basename(dirent.name); // Sanitize to prevent traversal
      try {
        const fullPath = path.join(assetsDir, entry);
        if (!fullPath.startsWith(assetsDir)) return false;
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }

    }).map(dirent => dirent.name).sort(sortSkinIds);
    cachedAvailableSkinsTimestamp = Date.now();
    return cachedAvailableSkins;
  } catch (error) {
    console.error('Failed to scan skins:', error);
    return ['default'];
  }
}

function sortSkinIds(a, b) {
  const keys = Object.keys(SKIN_NAME_KEYS);
  const indexA = keys.indexOf(a);
  const indexB = keys.indexOf(b);
  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  return a.localeCompare(b);
}

function hasSkinAsset(skinId, filename) {
  const assetId = `skin/${skinId}/${filename}`;
  try {
    if (hasProtectedAsset(assetId, { appRoot: __dirname, resourcesPath: process.resourcesPath })) {
      return true;
    }
  } catch (error) {
    console.warn(`Failed to inspect protected skin asset ${assetId}:`, error);
  }

  return fs.existsSync(path.join(__dirname, '..', '..', 'src', 'assets', skinId, filename));
}

function getSkinGalleryItems() {
  const activeSkinId = skinSelectorWindowModule.getSkinSelectorOriginalSkinId() != null ? skinSelectorWindowModule.getSkinSelectorOriginalSkinId() : currentSkinId;
  return buildSkinGalleryItems({
    skinIds: scanAvailableSkins(),
    currentSkinId: activeSkinId,
    getDisplayName: getSkinGalleryDisplayName,
    getSkinLabel,
    getArtistName: getSkinArtistName,
    assetExists: hasSkinAsset,
    createAssetUrl,
  });
}

function selectSkin(skinId) {
  currentSkinId = skinId;
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send('switch-skin', skinId);
  }
  sendPomodoroState();
  trayManager.refreshTrayMenu();
  return { skinId };
}





/**
 * 创建系统托盘
 */


function sendUpdateProgressPayload(payload) {
  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) return;
  windowManager.updateProgressWindow.webContents.send('update-progress', payload);
}

function showUpdateProgressWindow(payload) {
  const normalizedPayload = {
    mode: payload.mode,
    title: payload.title,
    message: payload.message,
    percent: payload.percent ?? 0,
  };

  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) {
    windowManager.updateProgressWindow = new BrowserWindow({
      width: 380,
      height: 172,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: normalizedPayload.title,
      parent: windowManager.mainWindow && !windowManager.mainWindow.isDestroyed() ? windowManager.mainWindow : undefined,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'updateProgressPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    windowManager.updateProgressWindow.setMenuBarVisibility(false);
    windowManager.updateProgressWindow.on('closed', () => {
      windowManager.updateProgressWindow = null;
    });
    windowManager.updateProgressWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    windowManager.updateProgressWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    windowManager.updateProgressWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'update-progress.html'));

    windowManager.updateProgressWindow.webContents.once('did-finish-load', () => {
      sendUpdateProgressPayload(normalizedPayload);
    });
    return;
  }

  windowManager.updateProgressWindow.setTitle(normalizedPayload.title);
  windowManager.updateProgressWindow.show();
  windowManager.updateProgressWindow.focus();
  sendUpdateProgressPayload(normalizedPayload);
}

function setUpdateProgress(percent) {
  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) return;
  sendUpdateProgressPayload({
    mode: 'downloading',
    title: trayManager.trayText('updateDownloadingTitle', 'Downloading Update'),
    message: trayManager.trayT('updateDownloadingMsg'),
    percent,
  });
}

function closeUpdateProgressWindow() {
  if (!windowManager.updateProgressWindow || windowManager.updateProgressWindow.isDestroyed()) return;
  windowManager.updateProgressWindow.close();
  windowManager.updateProgressWindow = null;
}

/**
 * 绘制简单的托盘图标像素图
 */


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
    await StoreManager.initStore();
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
    await StoreManager.initStore();
    return store ? store.get(key) : null;
  } catch (error) {
    console.error('Load failed:', error);
    return null;
  }
});

ipcMain.handle('set-auto-launch', async (_event, enabled) => {
  return AutoLaunchService.setAutoLaunchPreference(enabled);
});

ipcMain.handle('get-auto-launch', async () => {
  return AutoLaunchService.getAutoLaunchPreference();
});

ipcMain.handle('get-available-skins', () => {
  return scanAvailableSkins();
});

ipcMain.handle('get-skin-gallery-items', (event) => {
  if (!isSkinSelectorRequest(event)) {
    return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
  }
  return getSkinGalleryItems();
});

ipcMain.handle('get-active-window-info', async () => {
  if (!activeWindowSampler) startActiveWindowAwareness();
  return activeWindowSampler.sampleOnce();
});

ipcMain.handle('get-pet-visibility-state', () => {
  return getPetVisibilityState();
});

ipcMain.handle('set-current-skin', async (_event, skinId) => {
  if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
    return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
  }
  try {
    currentSkinId = skinId;
    sendPomodoroState();
    trayManager.refreshTrayMenu();
    return createIpcSuccess({ skinId });
  } catch (error) {
    console.error('Failed to set current skin:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to set current skin');
  }
});

ipcMain.handle('select-skin', async (event, skinId) => {
  if (!isSkinSelectorRequest(event)) {
    return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
  }
  if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
    return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
  }

  try {
    skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
    return createIpcSuccess(selectSkin(skinId));
  } catch (error) {
    skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
    console.error('Failed to select skin:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to select skin');
  }
});

ipcMain.handle('preview-skin', async (event, skinId) => {
  if (!isSkinSelectorRequest(event)) {
    return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
  }
  if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
    return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
  }

  try {
    skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
    selectSkin(skinId);
    return createIpcSuccess({ skinId });
  } catch (error) {
    console.error('Failed to preview skin:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to preview skin');
  }
});

ipcMain.handle('confirm-skin', async (event) => {
  if (!isSkinSelectorRequest(event)) {
    return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
  }
  try {
    skinSelectorWindowModule.setSkinSelectorOriginalSkinId();
    hideSkinSelector();
    return createIpcSuccess({ skinId: currentSkinId });
  } catch (error) {
    console.error('Failed to confirm skin:', error);
    return createIpcFailure('INTERNAL_ERROR', 'Failed to confirm skin');
  }
});

ipcMain.handle('cancel-skin', (event) => {
  if (!isSkinSelectorRequest(event)) {
    return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
  }
  cancelSkinPreview();
  return createIpcSuccess();
});

ipcMain.handle('close-skin-selector', (event) => {
  if (!isSkinSelectorRequest(event)) {
    return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
  }
  cancelSkinPreview();
  return createIpcSuccess();
});

// 多语言系统 IPC


ipcMain.handle('get-locale', () => currentLocale);
ipcMain.handle('set-locale', async (_event, lang) => {
  if (!['zh', 'en', 'ja'].includes(lang)) return { success: false };
  currentLocale = lang;
  await StoreManager.initStore();
  if (store) store.set(LOCALE_KEY, lang);
  trayManager.refreshTrayMenu();
  if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('locale-changed', lang);
  if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {
    windowManager.statusWindow.webContents.send('locale-changed', lang);
  }
  if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
    windowManager.pomodoroWindow.webContents.send('locale-changed', lang);
  }
  if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) {
    windowManager.citySettingWindow.webContents.send('locale-changed', lang);
  }
  if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
    windowManager.skinSelectorWindow.webContents.send('locale-changed', lang);
    skinSelectorWindowModule.sendSkinSelectorData({ resetSelection: false });
  }
  return { success: true, locale: lang };
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
    store = StoreManager.getStore();
    // 加载持久化语言设置，若无则自动检测
    const storedLocale = store ? store.get(LOCALE_KEY) : null;
    currentLocale = ['zh', 'en', 'ja'].includes(storedLocale) ? storedLocale : detectLocale();
    await AutoLaunchService.syncAutoLaunchPreference();

    // --- 久坐提醒服务初始化 ---
    const storedBreakSettings = store ? store.get(BREAK_REMINDER_STORE_KEY) : null;
    const breakSettings = normalizeBreakReminderSettings(storedBreakSettings);
    breakReminderEnabled = breakSettings.enabled;
    breakReminderIntervalMinutes = breakSettings.intervalMinutes;

    // Load persisted weather settings for the tray; the first fetch waits until renderer load.
    weatherSyncSettings = getStoredWeatherSyncSettings();
    trayManager.refreshTrayMenu();

    // Listen to config changes if users open the editor and save it
    store.onDidChange(WEATHER_SYNC_STORE_KEY, (newValue) => {
      // Ignore undefined/null newValue which can happen during atomic file writes
      if (!newValue) return;
      updateWeatherSyncSettings(newValue);
    });

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

    initUpdateManager({
      app,
      dialog,
      getMainWindow: () => windowManager.mainWindow,
      refreshTrayMenu: () => trayManager.refreshTrayMenu(),
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
      t: trayManager.trayT,
    });

    createWindow();


    trayManager.init({
      getPomodoroSnapshot,
      getUpdateMenuState,
      getCurrentLocale: () => currentLocale,
      setCurrentLocale: (val) => currentLocale = val,
      I18N, initStore: () => StoreManager.initStore(),
      getStore: () => store,
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
      getCurrentPetDisplay: () => currentPetDisplay,
      migrateWindowToDisplay,
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
      getWindowAwarenessEnabled: () => windowAwarenessEnabled,
      setWindowAwarenessEnabled: (val) => setWindowAwarenessEnabled(val),
      AutoLaunchService,
      checkForUpdatesFromTray,

      windowManager
    });
    trayManager.createTray();


    statusWindowModule.init({ sendStatusWindowData });
    citySettingWindowModule.init();
    skinSelectorWindowModule.init({
      selectSkin,
      getCurrentSkinId: () => currentSkinId,
      getSkinGalleryItems
    });
    pomodoroWindowModule.init({
      getPomodoroSystem: () => pomodoroSystem,
      createIpcSuccess,
      createIpcFailure,
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

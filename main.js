const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getVirtualDisplayBounds, getWalkAreasRelativeToBounds } = require('./displayBounds');
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
const { I18N } = require('./src/data/i18n');

// 常量定义
const AUTO_LAUNCH_KEY = 'autoLaunch';
const LOCALE_KEY = 'locale';
const DEFAULT_AUTO_LAUNCH = true;
const APP_USER_MODEL_ID = 'com.deskpet.yueqi-shenjiu';
const DISPLAY_METRICS_SETTLE_MS = 250;
const ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 3000;
const LOGIN_ITEM_NAME = '七九爱宠';

// 皮肤显示名多语言 key 映射表（文件夹名 → I18N.ui key）
const SKIN_NAME_KEYS = {
  'default': 'skinDefault',
  'birds': 'skinBirds',
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

function getSkinDisplayName(skinId) {
  const key = SKIN_NAME_KEYS[skinId];
  return key ? trayT(key) : skinId;
}

let mainWindow = null;
let statusWindow = null;
let updateProgressWindow = null;
let lastStatusWindowData = null;
let tray = null;
let store = null;
let petHidden = false;         // 桌宠隐藏状态
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
let finalSaveRequestId = 0;
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
  const windowDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const windowScaleFactor = Number.isFinite(windowDisplay?.scaleFactor) ? windowDisplay.scaleFactor : 1;
  const walkAreas = getWalkAreasRelativeToBounds(displays, bounds, windowScaleFactor);

  mainWindow.webContents.send('screen-info', {
    width: bounds.width,
    height: bounds.height,
    walkAreas,
    windowScaleFactor,
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

function getActiveWindowDisplays() {
  return screen.getAllDisplays();
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
  });
  activeWindowSampler.start();
}

function setWindowAwarenessEnabled(enabled) {
  if (process.platform !== 'win32') return;
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
  const bounds = getDesktopWindowBounds();
  lockPetWindowToBounds(bounds);
  sendScreenInfo();
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

  const width = Math.min(Math.max(Math.ceil(Number(size?.width) || 400), 360), 520);
  const height = Math.min(Math.max(Math.ceil(Number(size?.height) || 460), 360), 720);
  statusWindow.setContentSize(width, height);
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

  petHidden = false;
  mainWindow.webContents.send('toggle-pet-visibility', true);
  refreshTrayMenu();
  keepPetWindowOnTop();
}

/**
 * 创建主渲染窗口
 */
function createWindow() {
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
    keepPetWindowOnTop();
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
    displayFitScheduler.clear();
    stopActiveWindowAwareness();
    if (statusWindow && !statusWindow.isDestroyed()) {
      statusWindow.close();
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
        return fs.statSync(path.join(assetsDir, entry)).isDirectory();
      } catch {
        return false;
      }
    }).sort((a, b) => {
      if (a === 'default') return -1;
      if (b === 'default') return 1;
      return a.localeCompare(b);
    });
  } catch (error) {
    console.error('Failed to scan skins:', error);
    return ['default'];
  }
}

function buildTrayMenu() {
  const updateMenuState = getUpdateMenuState();

  // 构建皮肤切换子菜单
  const availableSkins = scanAvailableSkins();
  const skinSubmenu = availableSkins.map(skinId => ({
    label: getSkinDisplayName(skinId),
    type: 'radio',
    checked: skinId === currentSkinId,
    click: () => {
      currentSkinId = skinId;
      if (mainWindow) mainWindow.webContents.send('switch-skin', skinId);
      refreshTrayMenu();
    },
  }));

  // 构建语言切换子菜单
  const langSubmenu = [
    { lang: 'zh', key: 'langZh' },
    { lang: 'en', key: 'langEn' },
    { lang: 'ja', key: 'langJa' },
  ].map(({ lang, key }) => ({
    label: trayT(key),
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
    },
  }));

  return Menu.buildFromTemplate([
    {
      label: trayT('trayTitle'),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: trayT('trayStatusPanel'),
      click: () => {
        if (mainWindow) mainWindow.webContents.send('toggle-status-panel');
      },
    },
    {
      label: trayT('traySwitchSkin'),
      submenu: skinSubmenu,
    },
    {
      label: isPaused ? trayT('trayResumeWalk') : trayT('trayPauseWalk'),
      click: () => {
        isPaused = !isPaused;
        if (mainWindow) mainWindow.webContents.send('toggle-pause', isPaused);
        refreshTrayMenu();
      },
    },
    {
      label: process.platform === 'win32'
        ? (windowAwarenessEnabled ? trayT('trayWindowAwarenessOff') : trayT('trayWindowAwarenessOn'))
        : trayT('trayWindowAwarenessUnavailable'),
      enabled: process.platform === 'win32',
      click: () => setWindowAwarenessEnabled(!windowAwarenessEnabled),
    },
    {
      label: petHidden ? trayT('trayShowPet') : trayT('trayHidePet'),
      click: () => {
        petHidden = !petHidden;
        if (mainWindow) mainWindow.webContents.send('toggle-pet-visibility', !petHidden);
        refreshTrayMenu();
      },
    },
    {
      label: trayT('trayResetPos'),
      click: () => {
        if (mainWindow) mainWindow.webContents.send('reset-positions');
      },
    },
    { type: 'separator' },
    {
      label: trayT('trayLanguage'),
      submenu: langSubmenu,
    },
    {
      label: autoLaunchEnabled ? trayT('trayAutoLaunchOn') : trayT('trayAutoLaunchOff'),
      click: async () => {
        autoLaunchEnabled = !autoLaunchEnabled;
        await setAutoLaunchPreference(autoLaunchEnabled);
        refreshTrayMenu();
      },
    },
    {
      label: updateMenuState.checking ? trayT('trayUpdateChecking') 
           : updateMenuState.downloading ? trayT('trayUpdateDownloading') 
           : trayT('trayUpdateCheck'),
      enabled: updateMenuState.enabled,
      click: () => {
        void checkForUpdatesFromTray();
      },
    },
    ...(!app.isPackaged ? [
      {
        label: trayT('trayDevTools'),
        click: () => {
          if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
        },
      },
    ] : []),
    {
      label: trayT('trayQuit'),
      click: () => {
        app.quit();
      },
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getUpdateProgressHtml(payload) {
  const title = escapeHtml(payload.title);
  const message = escapeHtml(payload.message);
  const percent = Number.isFinite(payload.percent) ? Math.max(0, Math.min(100, payload.percent)) : 0;
  const isChecking = payload.mode === 'checking';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif;
      color: #202124;
      background: #fbfbf8;
      user-select: none;
    }
    .wrap {
      width: 100vw;
      height: 100vh;
      padding: 22px 24px;
      display: grid;
      align-content: center;
      gap: 14px;
    }
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 650;
      line-height: 1.3;
    }
    p {
      margin: 0;
      color: #5a5f66;
      font-size: 13px;
      line-height: 1.5;
    }
    .bar {
      position: relative;
      height: 10px;
      overflow: hidden;
      border-radius: 999px;
      background: #e3e6df;
    }
    .fill {
      width: ${isChecking ? '38%' : `${percent}%`};
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #4f9d69, #79b87f);
      transition: width 160ms ease;
    }
    .checking .fill {
      position: absolute;
      animation: sweep 1.25s ease-in-out infinite;
    }
    .meta {
      min-height: 18px;
      color: #6c726e;
      font-size: 12px;
      text-align: right;
    }
    .checking .meta { visibility: hidden; }
    @keyframes sweep {
      0% { left: -40%; }
      50% { left: 30%; }
      100% { left: 100%; }
    }
  </style>
</head>
<body>
  <main class="wrap ${isChecking ? 'checking' : 'downloading'}">
    <h1 id="title">${title}</h1>
    <p id="message">${message}</p>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}">
      <div id="fill" class="fill"></div>
    </div>
    <div id="meta" class="meta">${Math.round(percent)}%</div>
  </main>
  <script>
    window.updateProgress = function(payload) {
      document.body.querySelector('.wrap').className = 'wrap ' + payload.mode;
      document.getElementById('title').textContent = payload.title || '';
      document.getElementById('message').textContent = payload.message || '';
      const percent = Math.max(0, Math.min(100, Number(payload.percent) || 0));
      document.getElementById('fill').style.width = payload.mode === 'checking' ? '38%' : percent + '%';
      document.querySelector('.bar').setAttribute('aria-valuenow', Math.round(percent));
      document.getElementById('meta').textContent = Math.round(percent) + '%';
    };
  </script>
</body>
</html>`;
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
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    updateProgressWindow.setMenuBarVisibility(false);
    updateProgressWindow.on('closed', () => {
      updateProgressWindow = null;
    });
    updateProgressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getUpdateProgressHtml(normalizedPayload))}`);
    return;
  }

  updateProgressWindow.setTitle(normalizedPayload.title);
  updateProgressWindow.show();
  updateProgressWindow.focus();
  updateProgressWindow.webContents.executeJavaScript(
    `window.updateProgress(${JSON.stringify(normalizedPayload)})`,
  ).catch(() => {});
}

function setUpdateProgress(percent) {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return;
  updateProgressWindow.webContents.executeJavaScript(
    `window.updateProgress(${JSON.stringify({
      mode: 'downloading',
      title: trayText('updateDownloadingTitle', 'Downloading Update'),
      message: trayT('updateDownloadingMsg'),
      percent,
    })})`,
  ).catch(() => {});
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
  setPetWindowMousePassthrough(ignore, options || {});
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
  // 在这里添加其他合法的保存键值
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

ipcMain.on('set-current-skin', (_event, skinId) => {
  currentSkinId = skinId;
  refreshTrayMenu();
});

// 多语言系统 IPC
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
  return { success: true, locale: lang };
});

// --- 应用生命周期 ---

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId(APP_USER_MODEL_ID);


  app.on('second-instance', showExistingInstance);

  app.whenReady().then(async () => {
    // macOS: 隐藏 Dock 图标，桌宠不应在 Dock 栏占位
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    // 设置权限拦截
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    await initStore();
    // 加载持久化语言设置，若无则自动检测
    const storedLocale = store ? store.get(LOCALE_KEY) : null;
    currentLocale = ['zh', 'en', 'ja'].includes(storedLocale) ? storedLocale : detectLocale();
    const syncResult = await syncAutoLaunchPreference();
    autoLaunchEnabled = syncResult.preference;
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

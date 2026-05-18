const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getVirtualDisplayBounds, getWalkAreasRelativeToBounds } = require('./displayBounds');
const {
  initUpdateManager,
  checkForUpdatesFromTray,
  getUpdateMenuState,
} = require('./updateManager');

// 常量定义
const AUTO_LAUNCH_KEY = 'autoLaunch';
const DEFAULT_AUTO_LAUNCH = true;
const APP_USER_MODEL_ID = 'com.deskpet.yueqi-shenjiu';
const LOGIN_ITEM_NAME = '七九爱宠';

// 皮肤中文显示名映射表（文件夹名 → 托盘菜单显示名）
const SKIN_NAMES = {
  'default': '默认皮肤·凉拌仓鼠',
  // 新增皮肤时在此添加映射，例如：
  // 'qban': 'Q版·萌系',
};

let mainWindow = null;
let statusWindow = null;
let lastStatusWindowData = null;
let tray = null;
let store = null;
let petHidden = false; // 桌宠隐藏状态
let isPaused = false;  // 走动暂停状态
let autoLaunchEnabled = false; // 开机自动启动状态
let currentSkinId = 'default'; // 当前皮肤 ID（用于托盘菜单 radio 标记）
let keepOnTopTimer = null; // 置顶守卫计时器
let mousePassthroughResetTimer = null;
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
 * 获取当前 Windows 系统的登录启动状态
 */
function getLoginItemStatus() {
  if (process.platform !== 'win32') return { openAtLogin: false };
  if (!app.isPackaged) {
    return { openAtLogin: false, executableWillLaunchAtLogin: false, launchItems: [] };
  }
  try {
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
  if (process.platform !== 'win32') return getLoginItemStatus();
  if (!app.isPackaged) return getLoginItemStatus();
  try {
    const settings = {
      openAtLogin: enabled,
      path: process.execPath,
      args: [],
      name: LOGIN_ITEM_NAME,
    };
    app.setLoginItemSettings(settings);
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

  if (!ignore) {
    const timeoutMs = Number.isFinite(leaseMs) ? leaseMs : 2500;
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

function fitWindowToAllDisplays() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = getDesktopWindowBounds();
  mainWindow.setMinimumSize(bounds.width, bounds.height);
  mainWindow.setMaximumSize(bounds.width, bounds.height);
  mainWindow.setBounds(bounds);
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

  mainWindow.setMinimumSize(width, height);
  mainWindow.setMaximumSize(width, height);
  mainWindow.setBounds({ x, y, width, height });
  
  // macOS 特有：全工作区可见
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  // 启动置顶守护
  startKeepOnTopWatcher();

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded successfully');
    sendScreenInfo();
    keepPetWindowOnTop();
  });

  // 安全加固：禁止新窗口和导航 (ADR-014)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // 关键事件触发置顶重刷
  mainWindow.on('show', keepPetWindowOnTop);
  mainWindow.on('restore', keepPetWindowOnTop);
  mainWindow.on('blur', keepPetWindowOnTop);

  mainWindow.on('closed', () => {
    if (keepOnTopTimer) {
      clearInterval(keepOnTopTimer);
      keepOnTopTimer = null;
    }
    if (mousePassthroughResetTimer) {
      clearTimeout(mousePassthroughResetTimer);
      mousePassthroughResetTimer = null;
    }
    if (statusWindow && !statusWindow.isDestroyed()) {
      statusWindow.close();
    }
    mainWindow = null;
  });

  screen.on('display-added', fitWindowToAllDisplays);
  screen.on('display-removed', fitWindowToAllDisplays);
  screen.on('display-metrics-changed', fitWindowToAllDisplays);
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
    label: SKIN_NAMES[skinId] || skinId,
    type: 'radio',
    checked: skinId === currentSkinId,
    click: () => {
      currentSkinId = skinId;
      if (mainWindow) mainWindow.webContents.send('switch-skin', skinId);
      refreshTrayMenu();
    },
  }));

  return Menu.buildFromTemplate([
    {
      label: '岳清源x沈清秋 桌面爱宠',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '📊 显示状态面板',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('toggle-status-panel');
      },
    },
    {
      label: '🎨 切换皮肤',
      submenu: skinSubmenu,
    },
    {
      label: isPaused ? '🚶 恢复走动' : '⏸️ 暂停走动',
      click: () => {
        isPaused = !isPaused;
        if (mainWindow) mainWindow.webContents.send('toggle-pause', isPaused);
        refreshTrayMenu();
      },
    },
    {
      label: petHidden ? '👻 显示桌宠' : '👻 隐藏桌宠',
      click: () => {
        petHidden = !petHidden;
        if (mainWindow) mainWindow.webContents.send('toggle-pet-visibility', !petHidden);
        refreshTrayMenu();
      },
    },
    {
      label: autoLaunchEnabled ? '🚀 禁用开机启动' : '🚀 开机自动启动',
      click: async () => {
        autoLaunchEnabled = !autoLaunchEnabled;
        await setAutoLaunchPreference(autoLaunchEnabled);
        refreshTrayMenu();
      },
    },
    {
      label: updateMenuState.label,
      enabled: updateMenuState.enabled,
      click: () => {
        void checkForUpdatesFromTray();
      },
    },
    { type: 'separator' },
    {
      label: '🔄 重置位置',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('reset-positions');
      },
    },
    {
      label: '🛠️ 开发者工具',
      click: () => {
        if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
      },
    },
    { type: 'separator' },
    {
      label: '❌ 退出',
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

  tray = new Tray(icon);
  tray.setToolTip('岳七 & 沈九 桌面宠物');
  refreshTrayMenu();
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

ipcMain.handle('save-data', async (_event, key, value) => {
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

ipcMain.on('set-current-skin', (_event, skinId) => {
  currentSkinId = skinId;
  refreshTrayMenu();
});

// --- 应用生命周期 ---

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId(APP_USER_MODEL_ID);


  app.on('second-instance', showExistingInstance);

  app.whenReady().then(async () => {
    // 设置权限拦截
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    await initStore();
    const syncResult = await syncAutoLaunchPreference();
    autoLaunchEnabled = syncResult.preference;
    initUpdateManager({
      app,
      dialog,
      getMainWindow: () => mainWindow,
      refreshTrayMenu,
    });
    createWindow();
    createTray();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

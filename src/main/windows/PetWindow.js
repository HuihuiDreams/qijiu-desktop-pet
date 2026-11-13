/**
 * src/main/windows/PetWindow.js
 * 主宠物透明窗口：创建、置顶守卫、鼠标穿透、二次启动唤回。
 * 本文件是全应用的集成点——did-finish-load/closed 事件天然需要触达多个
 * 服务（多屏几何、窗口感知、可见性状态机、会议检测、天气同步），这些均经
 * init(deps) 注入；windowManager/citySettingWindowModule/updateProgressWindowModule 作为窗口注册表
 * 的兄弟模块，沿用既有窗口模块（StatusWindow/CitySettingWindow/PomodoroWindow）
 * 直接引入的约定。
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { normalizeMousePassthroughRequest } = require('../../../ipcContracts');
const windowManager = require('./WindowManager');
const citySettingWindowModule = require('./CitySettingWindow');
const updateProgressWindowModule = require('./UpdateProgressWindow');
const FinalSaveService = require('../services/FinalSaveService');
const { isSenderMainWindow } = require('../services/IpcSenderAuthorization');
const { shouldClearStartupCache } = require('../services/StartupCachePolicy');

// 与 preload.js 中的同名字符串保持一致（沙箱 preload 无法 require 本地模块）
const DEBUG_TOOLS_ARGUMENT = '--deskpet-debug-tools';

let deps = {};
let keepOnTopTimer = null;     // 置顶守卫计时器
let mousePassthroughResetTimer = null;
let fullscreenRdpSuppressed = false;
let restorePetWindowAfterRdp = false;
const restoreSubWindowsAfterRdp = new Set();
const subWindowFocusOrder = new WeakMap();
let nextSubWindowFocusOrder = 0;

function init(dependencies) {
  deps = dependencies;

  app?.on?.('browser-window-focus', (_event, win) => {
    if (win) subWindowFocusOrder.set(win, ++nextSubWindowFocusOrder);
  });

  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) {
      return;
    }
    const request = normalizeMousePassthroughRequest(ignore, options);
    if (!request) return;
    setPetWindowMousePassthrough(request.ignore, request.options);
  });
}

function getPetSubWindows() {
  return [
    windowManager.statusWindow,
    windowManager.pomodoroWindow,
    windowManager.skinSelectorWindow,
    windowManager.petScaleWindow,
    windowManager.citySettingWindow,
  ];
}

/**
 * 全屏 RDP 期间隐藏原生透明窗口和置顶子窗口，采样暂时失败时保留保护。
 * 不修改 renderer 的手动/会议/番茄钟隐藏状态。
 */
function syncFullscreenRdpSuppression() {
  const win = windowManager.mainWindow;
  const info = deps.WindowAwarenessService?.getNativePayload?.();
  if (process.platform !== 'win32') return false;

  if (info?.active === true && info.window) {
    fullscreenRdpSuppressed = !info.window.isMinimized
      && info.window.isFullScreen === true
      && /^(mstsc|msrdc)(?:\.exe)?$/i.test(info.window.ownerName || '');
  } else if (info?.reason === 'no-active-window') {
    fullscreenRdpSuppressed = false;
  }

  if (fullscreenRdpSuppressed) {
    for (const subWin of getPetSubWindows()) {
      if (!subWin || subWin.isDestroyed() || !subWin.isVisible() || subWin.isMinimized() || !subWin.isAlwaysOnTop()) continue;
      restoreSubWindowsAfterRdp.add(subWin);
      subWin.hide();
    }
    win.setAlwaysOnTop(false);
    if (win.isVisible()) {
      restorePetWindowAfterRdp = true;
      win.hide();
    }
    return true;
  }

  const currentSubWindows = getPetSubWindows();
  const subWindowsToRestore = [...restoreSubWindowsAfterRdp];
  restoreSubWindowsAfterRdp.clear();
  for (const subWin of subWindowsToRestore) {
    if (currentSubWindows.includes(subWin) && !subWin.isDestroyed() && !subWin.isVisible() && !subWin.isMinimized()) {
      subWin.showInactive();
    }
  }
  if (restorePetWindowAfterRdp) {
    restorePetWindowAfterRdp = false;
    win.showInactive();
  }
  return false;
}

function onActiveWindowChanged() {
  if (process.platform !== 'win32' || !windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;
  const wasSuppressed = fullscreenRdpSuppressed;
  if (!syncFullscreenRdpSuppression() && wasSuppressed) keepPetWindowOnTop();
}

/**
 * 窗口置顶逻辑 (ADR-018)
 */
function keepPetWindowOnTop() {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;
  if (syncFullscreenRdpSuppression()) return;
  // screen-saver 级别确保在全屏应用上方
  windowManager.mainWindow.setAlwaysOnTop(true, 'screen-saver');
  windowManager.mainWindow.moveTop();

  const visibleTopWindows = [];
  for (const subWin of getPetSubWindows()) {
    if (!subWin || (typeof subWin.isDestroyed === 'function' ? subWin.isDestroyed() : false)) {
      continue;
    }
    const isVisible = typeof subWin.isVisible === 'function' && subWin.isVisible();
    const isAlwaysOnTop = typeof subWin.isAlwaysOnTop === 'function'
      ? subWin.isAlwaysOnTop()
      : Boolean(subWin.alwaysOnTop);
    if (!subWindowFocusOrder.has(subWin)) {
      subWindowFocusOrder.set(subWin, 0);
      subWin.on?.('focus', () => subWindowFocusOrder.set(subWin, ++nextSubWindowFocusOrder));
    }
    if (subWin.isFocused?.()) {
      subWindowFocusOrder.set(subWin, ++nextSubWindowFocusOrder);
    }
    if (isVisible && isAlwaysOnTop && typeof subWin.moveTop === 'function') {
      visibleTopWindows.push(subWin);
    }
  }
  visibleTopWindows.sort((a, b) => subWindowFocusOrder.get(a) - subWindowFocusOrder.get(b));
  for (const subWin of visibleTopWindows) subWin.moveTop();
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
 * 第二次点击应用图标时，唤起已存在的实例。
 */
function showExistingInstance() {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;
  if (syncFullscreenRdpSuppression()) return;

  if (windowManager.mainWindow.isMinimized()) {
    windowManager.mainWindow.restore();
  }

  if (!windowManager.mainWindow.isVisible()) {
    windowManager.mainWindow.showInactive();
  }

  const { showPetManually } = deps.PetVisibilityService;
  showPetManually();
  keepPetWindowOnTop();
}

/**
 * 创建主渲染窗口
 */
function createWindow() {
  const { DisplayService, WindowAwarenessService, PetVisibilityService, MeetingDetectorController, WeatherSyncController } = deps;
  const { isPetCurrentlyHidden } = PetVisibilityService;
  fullscreenRdpSuppressed = false;
  restorePetWindowAfterRdp = false;
  restoreSubWindowsAfterRdp.clear();

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
      preload: path.join(__dirname, '..', '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 未打包运行时才下发调试开关，preload 据此决定是否启用 src/debug.js 的控制台辅助函数
      additionalArguments: deps.app && !deps.app.isPackaged ? [DEBUG_TOOLS_ARGUMENT] : [],
    },
  });

  // 检查是否需要清理缓存 (Task 4)
  const currentVersion = deps.app ? deps.app.getVersion() : null;
  const store = deps.StoreManager ? deps.StoreManager.getStore() : null;
  const lastCacheVersion = store ? store.get('lastCacheVersion') : null;
  const isDev = deps.app ? (!deps.app.isPackaged && process.env.DESKTOP_PET_SIMULATE_PACKAGED !== '1') : false;
  const forceClear = deps.app ? deps.app.commandLine.hasSwitch('clear-cache') : false;

  if (shouldClearStartupCache({
    isDevelopment: isDev,
    forceClear,
    lastCacheVersion,
    currentVersion,
  })) {
    windowManager.mainWindow.webContents.session.clearCache().then(() => {
      if (store && currentVersion) store.set('lastCacheVersion', currentVersion);
    }).catch((error) => {
      console.error('Failed to clear startup cache:', error);
    }).finally(() => {
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'index.html'));
      }
    });
  } else {
    // 热启动，跳过清理缓存
    windowManager.mainWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'index.html'));
  }

  // 设置鼠标穿透逻辑
  setPetWindowMousePassthrough(true, { forward: true });

  DisplayService.lockPetWindowToBounds({ x, y, width, height });

  // macOS 特有：全工作区可见
  windowManager.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });

  // 启动置顶守护
  startKeepOnTopWatcher();

  windowManager.mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer loaded successfully');
    DisplayService.sendScreenInfo();
    WindowAwarenessService.sendActiveWindowInfo(WindowAwarenessService.getLastPayload());
    PetVisibilityService.sendPetVisibility(!isPetCurrentlyHidden());
    WeatherSyncController.updateWeatherSyncSettings(WeatherSyncController.getWeatherSyncSettings());
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
  FinalSaveService.installFinalSaveBeforeClose(windowManager.mainWindow);

  windowManager.mainWindow.on('closed', () => {
    fullscreenRdpSuppressed = false;
    restorePetWindowAfterRdp = false;
    restoreSubWindowsAfterRdp.clear();
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
    // 体型窗口没有 parent，主窗口关闭后会独立存活；其 close 监听器负责回滚未确认的预览
    if (windowManager.petScaleWindow && !windowManager.petScaleWindow.isDestroyed()) {
      windowManager.petScaleWindow.close();
    }
    updateProgressWindowModule.closeUpdateProgressWindow();

    // Clear screen global listeners to prevent memory leaks across window rebuilds
    screen.removeListener('display-added', DisplayService.displayFitScheduler.schedule);
    screen.removeListener('display-removed', DisplayService.displayFitScheduler.schedule);
    screen.removeListener('display-metrics-changed', DisplayService.displayFitScheduler.schedule);

    windowManager.mainWindow = null;
  });

  screen.on('display-added', DisplayService.displayFitScheduler.schedule);
  screen.on('display-removed', DisplayService.displayFitScheduler.schedule);
  screen.on('display-metrics-changed', DisplayService.displayFitScheduler.schedule);
  WindowAwarenessService.startActiveWindowAwareness();
}

module.exports = {
  init,
  createWindow,
  keepPetWindowOnTop,
  onActiveWindowChanged,
  setPetWindowMousePassthrough,
  startKeepOnTopWatcher,
  showExistingInstance,
};

/**
 * src/main/windows/PetWindow.js
 * 主宠物透明窗口：创建、置顶守卫、鼠标穿透、二次启动唤回。
 * 本文件是全应用的集成点——did-finish-load/closed 事件天然需要触达多个
 * 服务（多屏几何、窗口感知、可见性状态机、会议检测、天气同步），这些均经
 * init(deps) 注入；windowManager/citySettingWindowModule 作为窗口注册表
 * 的兄弟模块，沿用既有窗口模块（StatusWindow/CitySettingWindow/PomodoroWindow）
 * 直接引入的约定。
 */
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { normalizeMousePassthroughRequest } = require('../../../ipcContracts');
const windowManager = require('./WindowManager');
const citySettingWindowModule = require('./CitySettingWindow');
const FinalSaveService = require('../services/FinalSaveService');
const { isSenderMainWindow } = require('../services/IpcSenderAuthorization');

let deps = {};
let keepOnTopTimer = null;     // 置顶守卫计时器
let mousePassthroughResetTimer = null;

function init(dependencies) {
  deps = dependencies;

  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) {
      return;
    }
    const request = normalizeMousePassthroughRequest(ignore, options);
    if (!request) return;
    setPetWindowMousePassthrough(request.ignore, request.options);
  });
}

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
    },
  });

  // 清理缓存并加载页面
  windowManager.mainWindow.webContents.session.clearCache().finally(() => {
    windowManager.mainWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'index.html'));
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

module.exports = {
  init,
  createWindow,
  keepPetWindowOnTop,
  setPetWindowMousePassthrough,
  startKeepOnTopWatcher,
  showExistingInstance,
};

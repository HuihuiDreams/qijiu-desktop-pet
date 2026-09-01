/**
 * src/main/DisplayService.js
 * 多屏几何全套服务：桌面虚拟边界计算、屏幕信息广播、宠物窗口锁定/适配/跨屏迁移、
 * 拖拽跨屏轮询，以及活动窗口感知所需的 bounds/displays 查询（与 displayFitScheduler
 * 同归本模块以消除跨模块循环依赖）。init(deps) 模式，deps: { windowManager, trayManager }。
 */
const { ipcMain, screen } = require('electron');
const {
  getTaskbarPlatformsRelativeToBounds,
  getVirtualDisplayBounds,
  getWalkAreasRelativeToBounds,
  findAdjacentDisplay,
} = require('../../displayBounds');
const {
  areWindowBoundsEqual,
  createDisplayFitScheduler,
  getResizeBridgeConstraints,
} = require('../../displayFit');
const { normalizeWindowMigrationDirection } = require('../../ipcContracts');
const { isSenderMainWindow } = require('./services/IpcSenderAuthorization');

const DISPLAY_METRICS_SETTLE_MS = 250;

let deps = {};
let currentPetDisplay = null;
let dragPollTimer = null;
let lastDisplaysState = '';

const displayFitScheduler = createDisplayFitScheduler({
  fitNow: fitWindowToAllDisplays,
  delayMs: DISPLAY_METRICS_SETTLE_MS,
});

function init(dependencies) {
  deps = dependencies;

  ipcMain.on('request-window-migration', (event, direction) => {
    if (!isSenderMainWindow(event, deps.windowManager.mainWindow)) return;
    const normalizedDirection = normalizeWindowMigrationDirection(direction);
    if (!normalizedDirection) return;
    if (process.platform !== 'darwin' || !currentPetDisplay) return;
    const allDisplays = screen.getAllDisplays();
    const adjacent = findAdjacentDisplay(currentPetDisplay, normalizedDirection, allDisplays);
    if (adjacent) {
      migrateWindowToDisplay(adjacent);
    }
  });

  ipcMain.on('drag-started', (event) => {
    if (!isSenderMainWindow(event, deps.windowManager.mainWindow)) return;
    if (process.platform !== 'darwin') return;
    startDragPoll();
  });

  ipcMain.on('drag-ended', (event) => {
    if (!isSenderMainWindow(event, deps.windowManager.mainWindow)) return;
    stopDragPoll();
  });
}

/**
 * 获取覆盖所有显示器的虚拟桌面边界。
 */
function getDesktopWindowBounds() {
  const { windowManager } = deps;
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
  const { windowManager } = deps;
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
  const { windowManager } = deps;
  return windowManager.mainWindow && !windowManager.mainWindow.isDestroyed() ? windowManager.mainWindow.getBounds() : getDesktopWindowBounds();
}

function lockPetWindowToBounds(bounds) {
  const { windowManager } = deps;
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
  const { windowManager, trayManager } = deps;
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;

  if (typeof deps.cancelScreensaverSession === 'function') {
    deps.cancelScreensaverSession('display-changed');
  }

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
  const { windowManager } = deps;
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return null;
  if (!targetDisplay || !targetDisplay.bounds) return null;
  if (currentPetDisplay && currentPetDisplay.id === targetDisplay.id) return null;

  if (typeof deps.cancelScreensaverSession === 'function') {
    deps.cancelScreensaverSession('display-changed');
  }

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
  const { windowManager } = deps;
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

module.exports = {
  init,
  displayFitScheduler,
  getDesktopWindowBounds,
  sendScreenInfo,
  lockPetWindowToBounds,
  fitWindowToAllDisplays,
  migrateWindowToDisplay,
  startDragPoll,
  stopDragPoll,
  getActiveWindowDisplays,
  getActiveWindowMainBounds,
  getCurrentPetDisplay: () => currentPetDisplay,
  setCurrentPetDisplay: (val) => { currentPetDisplay = val; },
};

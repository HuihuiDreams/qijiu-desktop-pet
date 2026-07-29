const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

let skinSelectorSelectionInProgress = false;
let skinSelectorOriginalSkinId = null;
let skinSelectorCloseInProgress = false;
let skinSelectorBlurCloseTimer = null;
let skinSelectorFocusListener = null;
let deps = {};

const SKIN_SELECTOR_FOCUS_HANDOFF_MS = 100;

function init(dependencies) {
  deps = dependencies;
}

function getInitialSkinSelectorWindowBounds() {
  const width = 800;
  const height = 520;
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

function sendSkinSelectorData(sendOptions = { isInitialLoad: false }) {
  if (!windowManager.skinSelectorWindow || windowManager.skinSelectorWindow.isDestroyed()) return;

  const currentSkinId = deps.getCurrentSkinId();
  const items = deps.getSkinGalleryItems();
  const data = items.map(item => ({
    ...item,
    isSelected: item.id === currentSkinId,
  }));
  windowManager.skinSelectorWindow.webContents.send('skin-selector-data', data, sendOptions);
}

function isValidSkinSelectorSender(event) {
  return (
    windowManager.skinSelectorWindow
    && !windowManager.skinSelectorWindow.isDestroyed()
    && event?.sender?.id === windowManager.skinSelectorWindow.webContents.id
  );
}

function createSkinSelectorWindow() {
  if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) return windowManager.skinSelectorWindow;

  windowManager.skinSelectorWindow = new BrowserWindow({
    ...getInitialSkinSelectorWindowBounds(),
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'skinSelectorPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windowManager.skinSelectorWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'skin-selector.html'));

  windowManager.skinSelectorWindow.webContents.on('did-finish-load', () => sendSkinSelectorData({ isInitialLoad: true }));
  windowManager.skinSelectorWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.skinSelectorWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.skinSelectorWindow.on('closed', () => {
    cancelPendingBlurClose();
    windowManager.skinSelectorWindow = null;
    skinSelectorSelectionInProgress = false;
    skinSelectorOriginalSkinId = null;
    skinSelectorCloseInProgress = false;
  });
  
  windowManager.skinSelectorWindow.on('blur', () => {
    scheduleBlurClose();
  });

  return windowManager.skinSelectorWindow;
}

function openSkinSelectorWindow() {
  cancelPendingBlurClose();
  const wasAlreadyCreated = !!(windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed());
  const win = createSkinSelectorWindow();
  skinSelectorOriginalSkinId = deps.getCurrentSkinId();
  skinSelectorSelectionInProgress = false;
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  win.focus();
  if (wasAlreadyCreated) {
    sendSkinSelectorData({ isInitialLoad: false });
  }
  return win;
}

function cancelSkinSelection() {
  if (skinSelectorOriginalSkinId != null && skinSelectorOriginalSkinId !== deps.getCurrentSkinId()) {
    deps.selectSkin(skinSelectorOriginalSkinId);
  }
  skinSelectorOriginalSkinId = null;
}

function isDeskPetWindow(win) {
  return Boolean(win) && [
    windowManager.mainWindow,
    windowManager.statusWindow,
    windowManager.skinSelectorWindow,
    windowManager.pomodoroWindow,
    windowManager.citySettingWindow,
    windowManager.updateProgressWindow,
  ].includes(win);
}

function isDeskPetAppActive() {
  return typeof app.isActive === 'function' && app.isActive();
}

function cancelPendingBlurClose() {
  if (skinSelectorBlurCloseTimer) {
    clearTimeout(skinSelectorBlurCloseTimer);
    skinSelectorBlurCloseTimer = null;
  }
  if (skinSelectorFocusListener) {
    app.removeListener('browser-window-focus', skinSelectorFocusListener);
    skinSelectorFocusListener = null;
  }
}

function scheduleBlurClose() {
  if (skinSelectorCloseInProgress || isDeskPetWindow(BrowserWindow.getFocusedWindow())) return;

  cancelPendingBlurClose();
  skinSelectorFocusListener = (_event, win) => {
    if (isDeskPetWindow(win)) cancelPendingBlurClose();
  };
  app.on('browser-window-focus', skinSelectorFocusListener);
  skinSelectorBlurCloseTimer = setTimeout(() => {
    skinSelectorBlurCloseTimer = null;
    if (skinSelectorFocusListener) {
      app.removeListener('browser-window-focus', skinSelectorFocusListener);
      skinSelectorFocusListener = null;
    }
    if (!isDeskPetWindow(BrowserWindow.getFocusedWindow()) && !isDeskPetAppActive()) {
      closeSkinSelectorWindow();
    }
  }, SKIN_SELECTOR_FOCUS_HANDOFF_MS);
}

function closeSkinSelectorWindow() {
  if (skinSelectorCloseInProgress) return;

  cancelPendingBlurClose();
  skinSelectorCloseInProgress = true;
  cancelSkinSelection();
  skinSelectorSelectionInProgress = false;
  if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
    windowManager.skinSelectorWindow.close();
  } else {
    skinSelectorCloseInProgress = false;
  }
}

function isSkinSelectorSelectionInProgress() {
  return skinSelectorSelectionInProgress;
}

function getSkinSelectorOriginalSkinId() {
  return skinSelectorOriginalSkinId;
}

module.exports = {
  init,
  createSkinSelectorWindow,
  openSkinSelectorWindow,
  closeSkinSelectorWindow,
  isSkinSelectorSelectionInProgress,
  setSkinSelectorSelectionInProgress: (val) => { skinSelectorSelectionInProgress = val; },
  setSkinSelectorOriginalSkinId: (val) => { skinSelectorOriginalSkinId = val; },
  getSkinSelectorOriginalSkinId,
  sendSkinSelectorData
};

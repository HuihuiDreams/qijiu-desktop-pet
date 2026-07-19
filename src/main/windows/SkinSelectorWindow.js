const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

let skinSelectorSelectionInProgress = false;
let skinSelectorOriginalSkinId = null;
let deps = {};

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('skin-preview', (event, skinId) => {
    if (!isValidSkinSelectorSender(event)) return { success: false };
    skinSelectorSelectionInProgress = true;
    deps.selectSkin(skinId);
    return { success: true };
  });

  ipcMain.handle('skin-select', (event, skinId) => {
    if (!isValidSkinSelectorSender(event)) return { success: false };
    skinSelectorSelectionInProgress = false;
    deps.selectSkin(skinId);
    closeSkinSelectorWindow();
    return { success: true };
  });

  ipcMain.handle('skin-cancel', (event) => {
    if (!isValidSkinSelectorSender(event)) return { success: false };
    cancelSkinSelection();
    closeSkinSelectorWindow();
    return { success: true };
  });
}

function getInitialSkinSelectorWindowBounds() {
  const width = 800;
  const height = 400;
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
    backgroundColor: '#1a1a2e',
    transparent: false,
    frame: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'skinSelectorPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windowManager.skinSelectorWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'skin-selector.html'));

  windowManager.skinSelectorWindow.webContents.on('did-finish-load', sendSkinSelectorData);
  windowManager.skinSelectorWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.skinSelectorWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.skinSelectorWindow.on('closed', () => {
    windowManager.skinSelectorWindow = null;
    skinSelectorSelectionInProgress = false;
    skinSelectorOriginalSkinId = null;
  });

  return windowManager.skinSelectorWindow;
}

function openSkinSelectorWindow() {
  const win = createSkinSelectorWindow();
  skinSelectorOriginalSkinId = deps.getCurrentSkinId();
  skinSelectorSelectionInProgress = false;
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  win.focus();
  return win;
}

function cancelSkinSelection() {
  if (skinSelectorOriginalSkinId != null && skinSelectorOriginalSkinId !== deps.getCurrentSkinId()) {
    deps.selectSkin(skinSelectorOriginalSkinId);
  }
  skinSelectorOriginalSkinId = null;
}

function closeSkinSelectorWindow() {
  cancelSkinSelection();
  skinSelectorSelectionInProgress = false;
  if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
    windowManager.skinSelectorWindow.hide();
    windowManager.skinSelectorWindow.close();
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

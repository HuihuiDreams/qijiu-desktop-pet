const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');
const { isSenderWindow } = require('../services/IpcSenderAuthorization');
const PetScaleService = require('../services/PetScaleService');
const {
  PET_SCALE_DEFAULT_PERCENT,
  PET_SCALE_MAX_PERCENT,
  PET_SCALE_MIN_PERCENT,
  PET_SCALE_STEP_PERCENT,
} = require('../../../ipcContracts');

let scaleConfirmed = false;
let petScaleCloseInProgress = false;

function init() {
  ipcMain.handle('close-pet-scale-window', (event) => {
    if (!isSenderWindow(event, windowManager.petScaleWindow)) return { success: false };
    closePetScaleWindow();
    return { success: true };
  });

  ipcMain.handle('pet-scale-get-settings', (event) => {
    if (!isSenderWindow(event, windowManager.petScaleWindow)) return null;
    return {
      currentPercent: PetScaleService.getCommittedPercent(),
      defaultPercent: PET_SCALE_DEFAULT_PERCENT,
      minPercent: PET_SCALE_MIN_PERCENT,
      maxPercent: PET_SCALE_MAX_PERCENT,
      stepPercent: PET_SCALE_STEP_PERCENT,
    };
  });

  ipcMain.handle('pet-scale-preview', (event, percent) => {
    if (!isSenderWindow(event, windowManager.petScaleWindow)) return null;
    return PetScaleService.preview(percent);
  });

  ipcMain.handle('pet-scale-confirm', (event) => {
    if (!isSenderWindow(event, windowManager.petScaleWindow)) return { success: false };
    scaleConfirmed = true;
    const finalPercent = PetScaleService.confirm();
    closePetScaleWindow();
    return { success: true, percent: finalPercent };
  });

  ipcMain.handle('pet-scale-cancel', (event) => {
    if (!isSenderWindow(event, windowManager.petScaleWindow)) return { success: false };
    scaleConfirmed = false;
    closePetScaleWindow();
    return { success: true };
  });
}

function getInitialPetScaleWindowBounds() {
  const width = 380;
  const height = 260;
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

function cancelPetScale() {
  if (!scaleConfirmed) {
    PetScaleService.cancel();
  }
}

function createPetScaleWindow() {
  if (windowManager.petScaleWindow && !windowManager.petScaleWindow.isDestroyed()) return windowManager.petScaleWindow;

  scaleConfirmed = false;
  petScaleCloseInProgress = false;

  windowManager.petScaleWindow = new BrowserWindow({
    ...getInitialPetScaleWindowBounds(),
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'petScalePreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windowManager.petScaleWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'pet-scale.html'));

  windowManager.petScaleWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.petScaleWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  windowManager.petScaleWindow.on('close', () => {
    if (petScaleCloseInProgress) return;
    petScaleCloseInProgress = true;
    cancelPetScale();
  });

  windowManager.petScaleWindow.on('closed', () => {
    windowManager.petScaleWindow = null;
    scaleConfirmed = false;
    petScaleCloseInProgress = false;
  });

  return windowManager.petScaleWindow;
}

function openPetScaleWindow() {
  const win = createPetScaleWindow();
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  win.focus();
  return win;
}

function closePetScaleWindow() {
  if (petScaleCloseInProgress) return;

  petScaleCloseInProgress = true;
  cancelPetScale();
  if (windowManager.petScaleWindow && !windowManager.petScaleWindow.isDestroyed()) {
    windowManager.petScaleWindow.close();
  } else {
    petScaleCloseInProgress = false;
  }
}

module.exports = {
  init,
  createPetScaleWindow,
  openPetScaleWindow,
  closePetScaleWindow,
};

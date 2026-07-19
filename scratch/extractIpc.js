const fs = require('fs');

const ipcCode = `const { ipcMain } = require('electron');

let deps = {};

function init(dependencies) {
  deps = dependencies;
  
  // Register handlers
  ipcMain.on('save-before-quit-complete', deps.handleComplete);
  ipcMain.on('set-ignore-mouse-events', deps.handleSetIgnoreMouseEvents);
  ipcMain.on('request-window-migration', deps.handleRequestWindowMigration);
  ipcMain.on('drag-started', deps.handleDragStarted);
  ipcMain.on('drag-ended', deps.handleDragEnded);

  // Status Window
  ipcMain.on('show-status-window', deps.handleShowStatusWindow);
  ipcMain.on('hide-status-window', deps.handleHideStatusWindow);
  ipcMain.on('update-status-window', deps.handleUpdateStatusWindow);
  ipcMain.on('resize-status-window', deps.handleResizeStatusWindow);

  // Store
  ipcMain.handle('save-data', deps.handleSaveData);
  ipcMain.handle('load-data', deps.handleLoadData);

  // Auto Launch
  ipcMain.handle('set-auto-launch', deps.handleSetAutoLaunch);
  ipcMain.handle('get-auto-launch', deps.handleGetAutoLaunch);

  // Skin Selector
  ipcMain.handle('get-available-skins', deps.handleGetAvailableSkins);
  ipcMain.handle('get-skin-gallery-items', deps.handleGetSkinGalleryItems);
  ipcMain.handle('set-current-skin', deps.handleSetCurrentSkin);
  ipcMain.handle('select-skin', deps.handleSelectSkin);
  ipcMain.handle('preview-skin', deps.handlePreviewSkin);
  ipcMain.handle('confirm-skin', deps.handleConfirmSkin);
  ipcMain.handle('cancel-skin', deps.handleCancelSkin);
  ipcMain.handle('close-skin-selector', deps.handleCloseSkinSelector);

  // System State
  ipcMain.handle('get-active-window-info', deps.handleGetActiveWindowInfo);
  ipcMain.handle('get-pet-visibility-state', deps.handleGetPetVisibilityState);

  // Localization
  ipcMain.handle('get-locale', deps.handleGetLocale);
  ipcMain.handle('set-locale', deps.handleSetLocale);

  // City Settings
  ipcMain.handle('get-city-settings', deps.handleGetCitySettings);
  ipcMain.handle('set-city-name', deps.handleSetCityName);
  ipcMain.handle('close-city-setting-window', deps.handleCloseCitySettingWindow);

  // Break Reminder
  ipcMain.on('break-reminder-dismissed', deps.handleBreakReminderDismissed);
}

module.exports = { init };
`;

fs.writeFileSync('src/main/IpcRouter.js', ipcCode);
console.log('Created IpcRouter.js');

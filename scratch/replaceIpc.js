const fs = require('fs');

let main = fs.readFileSync('main.js', 'utf8');

const handlersToRemove = [
  "ipcMain.on('save-before-quit-complete', handleComplete);",
  "ipcMain.on('set-ignore-mouse-events', (_event, ignore, options) => {\\n    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {\\n      if (ignore) {\\n        windowManager.mainWindow.setIgnoreMouseEvents(true, { forward: true });\\n      } else {\\n        windowManager.mainWindow.setIgnoreMouseEvents(false);\\n      }\\n    }\\n  });",
  "ipcMain.on('request-window-migration', (_event, direction) => {\\n    migrateWindow(direction);\\n  });",
  "ipcMain.on('drag-started', () => {\\n    isDragging = true;\\n    if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('drag-state-changed', true);\\n  });",
  "ipcMain.on('drag-ended', () => {\\n    isDragging = false;\\n    if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('drag-state-changed', false);\\n  });",
  "ipcMain.on('show-status-window', (_event, data) => {\\n    statusWindowModule.showStatusWindow(data, currentPetDisplay);\\n  });",
  "ipcMain.on('hide-status-window', () => {\\n    statusWindowModule.hideStatusWindow();\\n  });",
  "ipcMain.on('update-status-window', (_event, data) => {\\n    statusWindowModule.updateStatusWindow(data);\\n  });",
  "ipcMain.on('resize-status-window', (_event, size) => {\\n    statusWindowModule.resizeStatusWindow(size, currentPetDisplay);\\n  });",
  "ipcMain.handle('save-data', async (_event, key, value) => {\\n    try {\\n      await initStore();\\n      if (!store) {\\n        console.error('Store not initialized yet. Skipping save-data.');\\n        return { success: false, error: 'STORE_NOT_READY' };\\n      }\\n      store.set(key, value);\\n      return { success: true };\\n    } catch (err) {\\n      console.error(`[IPC save-data] Error saving key ${key}:`, err);\\n      return { success: false, error: err.message };\\n    }\\n  });",
  "ipcMain.handle('load-data', async (_event, key) => {\\n    try {\\n      await initStore();\\n      if (!store) return null;\\n      return store.get(key);\\n    } catch (err) {\\n      console.error(`[IPC load-data] Error loading key ${key}:`, err);\\n      return null;\\n    }\\n  });",
  "ipcMain.handle('set-auto-launch', async (_event, enabled) => {\\n    return await AutoLaunchService.setAutoLaunchPreference(enabled);\\n  });",
  "ipcMain.handle('get-auto-launch', async () => {\\n    return AutoLaunchService.isAutoLaunchEnabled();\\n  });",
  "ipcMain.handle('get-available-skins', () => {\\n    return scanAvailableSkins(ASSETS_DIR);\\n  });",
  "ipcMain.handle('get-skin-gallery-items', (event) => {\\n    return skinSelectorWindowModule.getSkinGalleryItems(event);\\n  });",
  "ipcMain.handle('get-active-window-info', async () => {\\n    return WindowAwarenessSystem.getActiveWindowInfo();\\n  });",
  "ipcMain.handle('get-pet-visibility-state', () => {\\n    return presentationGuard.getPetVisibilityState();\\n  });",
  "ipcMain.handle('set-current-skin', async (_event, skinId) => {\\n    try {\\n      const validSkins = scanAvailableSkins(ASSETS_DIR);\\n      if (!validSkins.includes(skinId)) {\\n        return createIpcFailure('VALIDATION_ERROR', `Skin ${skinId} is invalid or missing`);\\n      }\\n      const newSkinData = { skinId, fallback: 'default' };\\n      await initStore();\\n      if (store) store.set('currentSkin', newSkinData);\\n      return createIpcSuccess(newSkinData);\\n    } catch (error) {\\n      console.error('[IPC set-current-skin] Error:', error);\\n      return createIpcFailure('INTERNAL_ERROR', error.message);\\n    }\\n  });",
  "ipcMain.handle('select-skin', async (event, skinId) => {\\n    const validSkins = scanAvailableSkins(ASSETS_DIR);\\n    if (!validSkins.includes(skinId)) {\\n      return createIpcFailure('VALIDATION_ERROR', `Skin ${skinId} not found`);\\n    }\\n    if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {\\n      windowManager.skinSelectorWindow.webContents.send('skin-selection-changed', skinId);\\n    }\\n    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {\\n      windowManager.mainWindow.webContents.send('switch-skin', skinId);\\n    }\\n    return createIpcSuccess({ skinId });\\n  });",
  "ipcMain.handle('preview-skin', async (event, skinId) => {\\n    const validSkins = scanAvailableSkins(ASSETS_DIR);\\n    if (!validSkins.includes(skinId)) {\\n      return createIpcFailure('VALIDATION_ERROR', `Skin ${skinId} not found`);\\n    }\\n    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {\\n      windowManager.mainWindow.webContents.send('switch-skin', skinId);\\n    }\\n    if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {\\n      windowManager.skinSelectorWindow.webContents.send('skin-selection-changed', skinId);\\n    }\\n    return createIpcSuccess({ skinId });\\n  });",
  "ipcMain.handle('confirm-skin', async (event) => {\\n    try {\\n      await initStore();\\n      if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {\\n        windowManager.skinSelectorWindow.hide();\\n        windowManager.mainWindow?.focus();\\n      }\\n      return createIpcSuccess({ status: 'confirmed' });\\n    } catch (error) {\\n      console.error('[IPC confirm-skin] Error:', error);\\n      return createIpcFailure('INTERNAL_ERROR', error.message);\\n    }\\n  });",
  "ipcMain.handle('cancel-skin', (event) => {\\n    if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {\\n      windowManager.skinSelectorWindow.hide();\\n      windowManager.mainWindow?.focus();\\n    }\\n    return createIpcSuccess({ status: 'cancelled' });\\n  });",
  "ipcMain.handle('close-skin-selector', (event) => {\\n    if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {\\n      windowManager.skinSelectorWindow.hide();\\n      windowManager.mainWindow?.focus();\\n    }\\n    return createIpcSuccess({ status: 'closed' });\\n  });",
  "ipcMain.handle('get-locale', () => currentLocale);",
  "ipcMain.handle('set-locale', async (_event, lang) => {\\n    try {\\n      if (!['en', 'zh', 'ja'].includes(lang)) {\\n        return createIpcFailure('VALIDATION_ERROR', 'Invalid locale');\\n      }\\n      currentLocale = lang;\\n      await initStore();\\n      if (store) store.set(LOCALE_KEY, lang);\\n      trayManager.refreshTrayMenu();\\n      if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('locale-changed', lang);\\n      if (windowManager.statusWindow && !windowManager.statusWindow.isDestroyed()) {\\n        windowManager.statusWindow.webContents.send('locale-changed', lang);\\n      }\\n      if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {\\n        windowManager.pomodoroWindow.webContents.send('locale-changed', lang);\\n      }\\n      if (windowManager.citySettingWindow && !windowManager.citySettingWindow.isDestroyed()) {\\n        windowManager.citySettingWindow.webContents.send('locale-changed', lang);\\n      }\\n      if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {\\n        windowManager.skinSelectorWindow.webContents.send('locale-changed', lang);\\n        skinSelectorWindowModule.sendSkinSelectorData({ resetSelection: false });\\n      }\\n      return createIpcSuccess({ locale: lang });\\n    } catch (err) {\\n      console.error('[IPC set-locale] Error:', err);\\n      return createIpcFailure('INTERNAL_ERROR', err.message);\\n    }\\n  });",
  "ipcMain.handle('get-city-settings', () => {\\n    return { cityName: weatherSyncSettings.cityName, enabled: weatherSyncSettings.enabled };\\n  });",
  "ipcMain.handle('set-city-name', async (_event, cityName) => {\\n    try {\\n      const trimmed = (cityName || '').trim();\\n      if (trimmed === '') {\\n        const currentStored = getStoredWeatherSyncSettings();\\n        const newSettings = { ...currentStored, cityName: '', enabled: false };\\n        updateWeatherSyncSettings(newSettings);\\n        return createIpcSuccess({ status: 'cleared' });\\n      }\\n      if (trimmed.length > 50) {\\n        return createIpcFailure('VALIDATION_ERROR', 'City name too long (max 50 chars)');\\n      }\\n      const candidates = await resolveCityToCoordinates(trimmed, true);\\n      if (!candidates || candidates.length === 0) {\\n        return createIpcFailure('VALIDATION_ERROR', 'City not found');\\n      }\\n      const firstMatch = candidates[0];\\n      const currentStored = getStoredWeatherSyncSettings();\\n      const newSettings = { ...currentStored, cityName: firstMatch.name, lat: firstMatch.lat, lon: firstMatch.lon, enabled: true };\\n      updateWeatherSyncSettings(newSettings);\\n      return createIpcSuccess({ status: 'updated', city: firstMatch.name, lat: firstMatch.lat, lon: firstMatch.lon });\\n    } catch (error) {\\n      console.error('[IPC set-city-name] Error:', error);\\n      return createIpcFailure('NETWORK_ERROR', 'Failed to resolve city');\\n    }\\n  });",
  "ipcMain.handle('close-city-setting-window', () => {\\n    citySettingWindowModule.closeCitySettingWindow();\\n    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {\\n      windowManager.mainWindow.focus();\\n    }\\n    return createIpcSuccess({ status: 'closed' });\\n  });",
  "ipcMain.on('break-reminder-dismissed', () => {\\n    if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {\\n      windowManager.mainWindow.webContents.send('break-reminder-dismissed');\\n    }\\n  });"
];

for (const toRemove of handlersToRemove) {
  // Use a string match replacing all whitespaces with wildcard
  // Because formatted code might have different spacing.
  const regexPattern = toRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const regex = new RegExp(regexPattern, 'g');
  if (!regex.test(main)) {
    console.log("Could not find:", toRemove.substring(0, 50));
  } else {
    main = main.replace(regex, '');
  }
}

// Inject IpcRouter init
main = main.replace(
  "const pomodoroWindowModule = require('./src/main/windows/PomodoroWindow');\\nconst trayManager = require('./src/main/TrayManager');",
  "const pomodoroWindowModule = require('./src/main/windows/PomodoroWindow');\\nconst trayManager = require('./src/main/TrayManager');\\nconst ipcRouter = require('./src/main/IpcRouter');"
);

// We should put the ipcRouter.init right where these handlers used to be (or at least inside app.whenReady)
main = main.replace(
  "function registerIpcHandlers() {",
  `function registerIpcHandlers() {
  ipcRouter.init({
    handleComplete,
    handleSetIgnoreMouseEvents: (_event, ignore, options) => {
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        if (ignore) {
          windowManager.mainWindow.setIgnoreMouseEvents(true, { forward: true });
        } else {
          windowManager.mainWindow.setIgnoreMouseEvents(false);
        }
      }
    },
    handleRequestWindowMigration: (_event, direction) => {
      migrateWindow(direction);
    },
    handleDragStarted: () => {
      isDragging = true;
      if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('drag-state-changed', true);
    },
    handleDragEnded: () => {
      isDragging = false;
      if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('drag-state-changed', false);
    },
    handleShowStatusWindow: (_event, data) => {
      statusWindowModule.showStatusWindow(data, currentPetDisplay);
    },
    handleHideStatusWindow: () => {
      statusWindowModule.hideStatusWindow();
    },
    handleUpdateStatusWindow: (_event, data) => {
      statusWindowModule.updateStatusWindow(data);
    },
    handleResizeStatusWindow: (_event, size) => {
      statusWindowModule.resizeStatusWindow(size, currentPetDisplay);
    },
    handleSaveData: async (_event, key, value) => {
      try {
        await initStore();
        if (!store) {
          console.error('Store not initialized yet. Skipping save-data.');
          return { success: false, error: 'STORE_NOT_READY' };
        }
        store.set(key, value);
        return { success: true };
      } catch (err) {
        console.error(\`[IPC save-data] Error saving key \${key}:\`, err);
        return { success: false, error: err.message };
      }
    },
    handleLoadData: async (_event, key) => {
      try {
        await initStore();
        if (!store) return null;
        return store.get(key);
      } catch (err) {
        console.error(\`[IPC load-data] Error loading key \${key}:\`, err);
        return null;
      }
    },
    handleSetAutoLaunch: async (_event, enabled) => {
      return await AutoLaunchService.setAutoLaunchPreference(enabled);
    },
    handleGetAutoLaunch: async () => {
      return AutoLaunchService.isAutoLaunchEnabled();
    },
    handleGetAvailableSkins: () => {
      return scanAvailableSkins(ASSETS_DIR);
    },
    handleGetSkinGalleryItems: (event) => {
      return skinSelectorWindowModule.getSkinGalleryItems(event);
    },
    handleGetActiveWindowInfo: async () => {
      return WindowAwarenessSystem.getActiveWindowInfo();
    },
    handleGetPetVisibilityState: () => {
      return presentationGuard.getPetVisibilityState();
    },
    handleSetCurrentSkin: async (_event, skinId) => {
      try {
        const validSkins = scanAvailableSkins(ASSETS_DIR);
        if (!validSkins.includes(skinId)) {
          return createIpcFailure('VALIDATION_ERROR', \`Skin \${skinId} is invalid or missing\`);
        }
        const newSkinData = { skinId, fallback: 'default' };
        await initStore();
        if (store) store.set('currentSkin', newSkinData);
        return createIpcSuccess(newSkinData);
      } catch (error) {
        console.error('[IPC set-current-skin] Error:', error);
        return createIpcFailure('INTERNAL_ERROR', error.message);
      }
    },
    handleSelectSkin: async (event, skinId) => {
      const validSkins = scanAvailableSkins(ASSETS_DIR);
      if (!validSkins.includes(skinId)) {
        return createIpcFailure('VALIDATION_ERROR', \`Skin \${skinId} not found\`);
      }
      if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
        windowManager.skinSelectorWindow.webContents.send('skin-selection-changed', skinId);
      }
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.webContents.send('switch-skin', skinId);
      }
      return createIpcSuccess({ skinId });
    },
    handlePreviewSkin: async (event, skinId) => {
      const validSkins = scanAvailableSkins(ASSETS_DIR);
      if (!validSkins.includes(skinId)) {
        return createIpcFailure('VALIDATION_ERROR', \`Skin \${skinId} not found\`);
      }
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.webContents.send('switch-skin', skinId);
      }
      if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
        windowManager.skinSelectorWindow.webContents.send('skin-selection-changed', skinId);
      }
      return createIpcSuccess({ skinId });
    },
    handleConfirmSkin: async (event) => {
      try {
        await initStore();
        if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
          windowManager.skinSelectorWindow.hide();
          windowManager.mainWindow?.focus();
        }
        return createIpcSuccess({ status: 'confirmed' });
      } catch (error) {
        console.error('[IPC confirm-skin] Error:', error);
        return createIpcFailure('INTERNAL_ERROR', error.message);
      }
    },
    handleCancelSkin: (event) => {
      if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
        windowManager.skinSelectorWindow.hide();
        windowManager.mainWindow?.focus();
      }
      return createIpcSuccess({ status: 'cancelled' });
    },
    handleCloseSkinSelector: (event) => {
      if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
        windowManager.skinSelectorWindow.hide();
        windowManager.mainWindow?.focus();
      }
      return createIpcSuccess({ status: 'closed' });
    },
    handleGetLocale: () => currentLocale,
    handleSetLocale: async (_event, lang) => {
      try {
        if (!['en', 'zh', 'ja'].includes(lang)) {
          return createIpcFailure('VALIDATION_ERROR', 'Invalid locale');
        }
        currentLocale = lang;
        await initStore();
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
        return createIpcSuccess({ locale: lang });
      } catch (err) {
        console.error('[IPC set-locale] Error:', err);
        return createIpcFailure('INTERNAL_ERROR', err.message);
      }
    },
    handleGetCitySettings: () => {
      return { cityName: weatherSyncSettings.cityName, enabled: weatherSyncSettings.enabled };
    },
    handleSetCityName: async (_event, cityName) => {
      try {
        const trimmed = (cityName || '').trim();
        if (trimmed === '') {
          const currentStored = getStoredWeatherSyncSettings();
          const newSettings = { ...currentStored, cityName: '', enabled: false };
          updateWeatherSyncSettings(newSettings);
          return createIpcSuccess({ status: 'cleared' });
        }
        if (trimmed.length > 50) {
          return createIpcFailure('VALIDATION_ERROR', 'City name too long (max 50 chars)');
        }
        const candidates = await resolveCityToCoordinates(trimmed, true);
        if (!candidates || candidates.length === 0) {
          return createIpcFailure('VALIDATION_ERROR', 'City not found');
        }
        const firstMatch = candidates[0];
        const currentStored = getStoredWeatherSyncSettings();
        const newSettings = { ...currentStored, cityName: firstMatch.name, lat: firstMatch.lat, lon: firstMatch.lon, enabled: true };
        updateWeatherSyncSettings(newSettings);
        return createIpcSuccess({ status: 'updated', city: firstMatch.name, lat: firstMatch.lat, lon: firstMatch.lon });
      } catch (error) {
        console.error('[IPC set-city-name] Error:', error);
        return createIpcFailure('NETWORK_ERROR', 'Failed to resolve city');
      }
    },
    handleCloseCitySettingWindow: () => {
      citySettingWindowModule.closeCitySettingWindow();
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.focus();
      }
      return createIpcSuccess({ status: 'closed' });
    },
    handleBreakReminderDismissed: () => {
      if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.webContents.send('break-reminder-dismissed');
      }
    }
  });`
);

fs.writeFileSync('main.js', main);
console.log('Done mapping IPC handlers!');

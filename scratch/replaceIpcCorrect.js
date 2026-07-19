const fs = require('fs');

let main = fs.readFileSync('main.js', 'utf8');

// The entire function registerIpcHandlers is at the end of the file, starting with `function registerIpcHandlers() {`
// Let's replace the whole function using regex
const regex = /function registerIpcHandlers\(\) \{[\s\S]*?\}\n/g;

const routerInit = `function registerIpcHandlers() {
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
  });
}
`;

main = main.replace(regex, routerInit);
fs.writeFileSync('main.js', main);
console.log('Replaced registerIpcHandlers');

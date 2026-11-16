const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getLocale: () => ipcRenderer.invoke('get-locale'),
  onLocaleChange: (callback) => subscribeIpc('locale-changed', (_event, locale) => callback(locale)),
  getSnapshot: () => ipcRenderer.invoke('settings-get-snapshot'),
  previewPetScale: (percent) => ipcRenderer.invoke('settings-preview-pet-scale', percent),
  commitPetScale: (percent) => ipcRenderer.invoke('settings-commit-pet-scale', percent),
  resetPetScale: () => ipcRenderer.invoke('settings-reset-pet-scale'),
  setWindowAwareness: (enabled) => ipcRenderer.invoke('settings-set-window-awareness', enabled),
  setWeatherEnabled: (enabled) => ipcRenderer.invoke('settings-set-weather-enabled', enabled),
  setCityName: (cityName) => ipcRenderer.invoke('settings-set-city-name', cityName),
  setBreakReminder: (patch) => ipcRenderer.invoke('settings-set-break-reminder', patch),
  setScreensaver: (patch) => ipcRenderer.invoke('settings-set-screensaver', patch),
  changeSettingsLocale: (lang) => ipcRenderer.invoke('settings-set-locale', lang),
  changeAutoLaunch: (enabled) => ipcRenderer.invoke('settings-set-auto-launch', enabled),
  openSkinSelector: () => ipcRenderer.invoke('settings-open-skin-selector'),
  closeSettingsWindow: () => ipcRenderer.invoke('settings-close-window'),
  onSettingsUpdated: (callback) => subscribeIpc('settings-updated', (_event, snapshot) => callback(snapshot)),
  onSwitchTab: (callback) => subscribeIpc('settings-switch-tab', (_event, tabId) => callback(tabId)),
  onRestoreSkinFocus: (callback) => subscribeIpc('settings-restore-skin-focus', () => callback()),
});

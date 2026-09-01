const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getLocale: () => ipcRenderer.invoke('get-locale'),
  onLocaleChange: (callback) => subscribeIpc('locale-changed', (_event, locale) => callback(locale)),
  getCitySettings: () => ipcRenderer.invoke('get-city-settings'),
  setCityName: (name) => ipcRenderer.invoke('set-city-name', name),
  closeCitySettingWindow: () => ipcRenderer.invoke('close-city-setting-window'),
});

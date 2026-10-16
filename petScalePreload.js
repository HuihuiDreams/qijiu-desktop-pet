const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getLocale: () => ipcRenderer.invoke('get-locale'),
  onLocaleChange: (callback) => subscribeIpc('locale-changed', (_event, locale) => callback(locale)),
  getPetScaleSettings: () => ipcRenderer.invoke('pet-scale-get-settings'),
  previewPetScale: (percent) => ipcRenderer.invoke('pet-scale-preview', percent),
  confirmPetScale: () => ipcRenderer.invoke('pet-scale-confirm'),
  cancelPetScale: () => ipcRenderer.invoke('pet-scale-cancel'),
});

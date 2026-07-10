const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('skinSelectorAPI', {
  getSkinGalleryItems: () => ipcRenderer.invoke('get-skin-gallery-items'),
  selectSkin: (skinId) => ipcRenderer.invoke('select-skin', skinId),
  close: () => ipcRenderer.invoke('close-skin-selector'),
  getLocale: () => ipcRenderer.invoke('get-locale'),
  onLocaleChange: (callback) => subscribeIpc('locale-changed', (_event, locale) => callback(locale)),
  onData: (callback) => subscribeIpc('skin-selector-data', (_event, items) => callback(items)),
});

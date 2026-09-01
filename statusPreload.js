const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getLocale: () => ipcRenderer.invoke('get-locale'),
  onLocaleChange: (callback) => subscribeIpc('locale-changed', (_event, locale) => callback(locale)),
  onStatusWindowData: (callback) => subscribeIpc('status-window-data', (_event, data) => callback(data)),
  resizeStatusWindow: (size) => ipcRenderer.send('resize-status-window', size),
  closeStatusWindow: () => ipcRenderer.invoke('status-close-window'),
});

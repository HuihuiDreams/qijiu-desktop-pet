const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateProgressAPI', {
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
});

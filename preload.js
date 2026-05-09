const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 鼠标事件控制：切换穿透状态
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },

  // 数据持久化
  saveData: (key, value) => ipcRenderer.invoke('save-data', key, value),
  loadData: (key) => ipcRenderer.invoke('load-data', key),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),

  // 监听来自主进程的消息
  onScreenInfo: (callback) => {
    ipcRenderer.on('screen-info', (event, data) => callback(data));
  },
  onToggleStatusPanel: (callback) => {
    ipcRenderer.on('toggle-status-panel', () => callback());
  },
  onTogglePause: (callback) => {
    ipcRenderer.on('toggle-pause', (event, paused) => callback(paused));
  },
  onResetPositions: (callback) => {
    ipcRenderer.on('reset-positions', () => callback());
  },
  onTogglePetVisibility: (callback) => {
    ipcRenderer.on('toggle-pet-visibility', (event, visible) => callback(visible));
  }
});

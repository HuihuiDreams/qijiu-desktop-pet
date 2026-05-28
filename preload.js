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
  showStatusWindow: (data) => ipcRenderer.send('show-status-window', data),
  hideStatusWindow: () => ipcRenderer.send('hide-status-window'),
  updateStatusWindow: (data) => ipcRenderer.send('update-status-window', data),
  closeStatusWindow: () => ipcRenderer.send('hide-status-window'),
  resizeStatusWindow: (size) => ipcRenderer.send('resize-status-window', size),
  onSaveBeforeQuit: (callback) => {
    ipcRenderer.on('save-before-quit', async (_event, requestId) => {
      let success = false;
      try {
        await callback();
        success = true;
      } catch (error) {
        console.error('Final save before quit failed:', error);
      } finally {
        ipcRenderer.send('save-before-quit-complete', requestId, success);
      }
    });
  },

  // 监听来自主进程的消息
  onScreenInfo: (callback) => {
    ipcRenderer.on('screen-info', (event, data) => callback(data));
  },
  getActiveWindowInfo: () => ipcRenderer.invoke('get-active-window-info'),
  onActiveWindowInfo: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('active-window-info', listener);
    return () => ipcRenderer.removeListener('active-window-info', listener);
  },
  onToggleStatusPanel: (callback) => {
    ipcRenderer.on('toggle-status-panel', () => callback());
  },
  onStatusWindowData: (callback) => {
    ipcRenderer.on('status-window-data', (event, data) => callback(data));
  },
  onStatusWindowClosed: (callback) => {
    ipcRenderer.on('status-window-closed', () => callback());
  },
  onTogglePause: (callback) => {
    ipcRenderer.on('toggle-pause', (event, paused) => callback(paused));
  },
  onResetPositions: (callback) => {
    ipcRenderer.on('reset-positions', () => callback());
  },
  onTogglePetVisibility: (callback) => {
    ipcRenderer.on('toggle-pet-visibility', (event, visible) => callback(visible));
  },

  // 皮肤系统
  getAvailableSkins: () => ipcRenderer.invoke('get-available-skins'),
  setCurrentSkin: (skinId) => ipcRenderer.send('set-current-skin', skinId),
  onSwitchSkin: (callback) => {
    ipcRenderer.on('switch-skin', (event, skinId) => callback(skinId));
  },

  // 多语言系统 (i18n)
  getLocale: () => ipcRenderer.invoke('get-locale'),
  setLocale: (lang) => ipcRenderer.invoke('set-locale', lang),
  onLocaleChange: (callback) => {
    ipcRenderer.on('locale-changed', (event, lang) => callback(lang));
  },
});

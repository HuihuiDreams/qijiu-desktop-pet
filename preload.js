const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

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
    const listener = async (_event, requestId) => {
      let success = false;
      try {
        await callback();
        success = true;
      } catch (error) {
        console.error('Final save before quit failed:', error);
      } finally {
        ipcRenderer.send('save-before-quit-complete', requestId, success);
      }
    };
    return subscribeIpc('save-before-quit', listener);
  },

  // 监听来自主进程的消息
  onScreenInfo: (callback) => {
    return subscribeIpc('screen-info', (_event, data) => callback(data));
  },
  getActiveWindowInfo: () => ipcRenderer.invoke('get-active-window-info'),
  onActiveWindowInfo: (callback) => {
    const listener = (_event, data) => callback(data);
    return subscribeIpc('active-window-info', listener);
  },
  onToggleStatusPanel: (callback) => {
    return subscribeIpc('toggle-status-panel', () => callback());
  },
  onStatusWindowData: (callback) => {
    return subscribeIpc('status-window-data', (_event, data) => callback(data));
  },
  onStatusWindowClosed: (callback) => {
    return subscribeIpc('status-window-closed', () => callback());
  },
  onTogglePause: (callback) => {
    return subscribeIpc('toggle-pause', (_event, paused) => callback(paused));
  },
  onResetPositions: (callback) => {
    return subscribeIpc('reset-positions', () => callback());
  },
  onTogglePetVisibility: (callback) => {
    return subscribeIpc('toggle-pet-visibility', (_event, visible) => callback(visible));
  },

  // 皮肤系统
  getAvailableSkins: () => ipcRenderer.invoke('get-available-skins'),
  setCurrentSkin: (skinId) => ipcRenderer.invoke('set-current-skin', skinId),
  onSwitchSkin: (callback) => {
    return subscribeIpc('switch-skin', (_event, skinId) => callback(skinId));
  },

  // 多语言系统 (i18n)
  getLocale: () => ipcRenderer.invoke('get-locale'),
  setLocale: (lang) => ipcRenderer.invoke('set-locale', lang),
  onLocaleChange: (callback) => {
    return subscribeIpc('locale-changed', (_event, lang) => callback(lang));
  },

  // macOS 多显示器迁移
  requestWindowMigration: (direction) => ipcRenderer.send('request-window-migration', direction),
  notifyDragStarted: () => ipcRenderer.send('drag-started'),
  notifyDragEnded: () => ipcRenderer.send('drag-ended'),
  onWindowMigrated: (callback) => {
    return subscribeIpc('window-migrated', (_event, data) => callback(data));
  },

  // 久坐提醒
  onBreakReminder: (callback) => {
    const listener = (_event, payload) => callback(payload);
    return subscribeIpc('break-reminder-triggered', listener);
  },
  dismissBreakReminder: () => {
    ipcRenderer.send('break-reminder-dismissed');
  },

  // 系统睡眠/唤醒事件（用于 macOS 离线衰减结算）
  onSystemSuspend: (callback) => {
    return subscribeIpc('system-suspended', () => callback());
  },
  onSystemResume: (callback) => {
    return subscribeIpc('system-resumed', (_event, data) => callback(data));
  },
});

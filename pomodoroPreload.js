const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getLocale: () => ipcRenderer.invoke('get-locale'),
  onLocaleChange: (callback) => subscribeIpc('locale-changed', (_event, locale) => callback(locale)),
  getPomodoroState: () => ipcRenderer.invoke('pomodoro-get-state'),
  startPomodoro: (minutes) => ipcRenderer.invoke('pomodoro-start', minutes),
  stopPomodoro: () => ipcRenderer.invoke('pomodoro-stop'),
  closePomodoroWindow: () => ipcRenderer.invoke('pomodoro-close-window'),
  setPomodoroAlwaysOnTop: (enabled) => ipcRenderer.invoke('pomodoro-set-always-on-top', enabled),
  onPomodoroState: (callback) => subscribeIpc('pomodoro-state', (_event, state) => callback(state)),
});

/**
 * src/main/services/WindowAwarenessService.js
 * 活动窗口感知服务：采样器生命周期、开关状态、IPC get-active-window-info。
 * init(deps) 模式，deps: { windowManager, trayManager, getActiveWindowDisplays,
 * getActiveWindowMainBounds }（后两者由 DisplayService 提供，避免与 displayFitScheduler
 * 产生跨模块循环依赖）。
 */
const { ipcMain } = require('electron');
const { createActiveWindowProvider, unavailableActiveWindowInfo } = require('../../../activeWindowProvider');
const { createActiveWindowSampler } = require('../../../activeWindowAwareness');

const ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 10000;

let deps = {};
let activeWindowSampler = null;
let windowAwarenessEnabled = true;

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('get-active-window-info', async () => {
    if (!activeWindowSampler) startActiveWindowAwareness();
    return activeWindowSampler.sampleOnce();
  });
}

function sendActiveWindowInfo(activeWindowInfo) {
  const { windowManager } = deps;
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed() || !activeWindowInfo) return;
  windowManager.mainWindow.webContents.send('active-window-info', activeWindowInfo);
}

function unavailableActiveWindowPayload(reason) {
  return {
    ...unavailableActiveWindowInfo(reason),
    platform: null,
  };
}

function stopActiveWindowAwareness() {
  if (!activeWindowSampler) return;
  activeWindowSampler.stop();
  activeWindowSampler = null;
}

function startActiveWindowAwareness() {
  stopActiveWindowAwareness();
  const provider = windowAwarenessEnabled
    ? createActiveWindowProvider(process.platform)
    : { getActiveWindowInfo: async () => unavailableActiveWindowInfo('disabled') };

  activeWindowSampler = createActiveWindowSampler({
    provider,
    getWindowBounds: deps.getActiveWindowMainBounds,
    getDisplays: deps.getActiveWindowDisplays,
    onChange: sendActiveWindowInfo,
    intervalMs: ACTIVE_WINDOW_SAMPLE_INTERVAL_MS,
    refreshUnchangedIntervalMs: ACTIVE_WINDOW_SAMPLE_INTERVAL_MS,
  });
  activeWindowSampler.start();
}

function setWindowAwarenessEnabled(enabled) {
  const { windowManager, trayManager } = deps;
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  windowAwarenessEnabled = Boolean(enabled);
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    startActiveWindowAwareness();
    if (!windowAwarenessEnabled) {
      sendActiveWindowInfo(unavailableActiveWindowPayload('disabled'));
    }
  }
  trayManager.refreshTrayMenu();
}

module.exports = {
  init,
  startActiveWindowAwareness,
  stopActiveWindowAwareness,
  setWindowAwarenessEnabled,
  unavailableActiveWindowPayload,
  sendActiveWindowInfo,
  getLastPayload: () => activeWindowSampler?.getLastPayload(),
  isEnabled: () => windowAwarenessEnabled,
};

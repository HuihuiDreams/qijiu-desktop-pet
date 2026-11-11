/**
 * src/main/services/WindowAwarenessService.js
 * 活动窗口感知服务：采样器生命周期、开关状态、IPC get-active-window-info。
 * init(deps) 模式，deps: { windowManager, trayManager, getActiveWindowDisplays,
 * getActiveWindowMainBounds }（后两者由 DisplayService 提供，避免与 displayFitScheduler
 * 产生跨模块循环依赖）。
 */
const { ipcMain } = require('electron');
const { createActiveWindowProvider, createUnavailableActiveWindowProvider, unavailableActiveWindowInfo } = require('../../../activeWindowProvider');
const { createActiveWindowSampler } = require('../../../activeWindowAwareness');
const { isSenderMainWindow } = require('./IpcSenderAuthorization');

const ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 2000;
const MAC_ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 30000;
const WINDOW_AWARENESS_STORE_KEY = 'windowAwarenessEnabled';

let deps = {};
let activeWindowSampler = null;
let windowAwarenessEnabled = true;

function init(dependencies) {
  deps = dependencies;
  const { StoreManager, powerMonitor } = deps;
  if (StoreManager) {
    const store = StoreManager.getStore();
    if (store && store.has(WINDOW_AWARENESS_STORE_KEY)) {
      windowAwarenessEnabled = Boolean(store.get(WINDOW_AWARENESS_STORE_KEY));
    }
  }

  if (powerMonitor && typeof powerMonitor.on === 'function') {
    powerMonitor.on('suspend', () => {
      stopActiveWindowAwareness();
    });
    powerMonitor.on('resume', () => {
      if ((windowAwarenessEnabled || process.platform === 'win32') && deps.windowManager?.mainWindow && !deps.windowManager.mainWindow.isDestroyed()) {
        startActiveWindowAwareness();
      }
    });
  }

  if (ipcMain && typeof ipcMain.handle === 'function') {
    ipcMain.handle('get-active-window-info', async (event) => {
      if (!isSenderMainWindow(event, deps.windowManager?.mainWindow)) return null;
      if (!activeWindowSampler) startActiveWindowAwareness();
      const payload = await activeWindowSampler.sampleOnce();
      return windowAwarenessEnabled ? payload : unavailableActiveWindowPayload('disabled');
    });
  }
}

function sendActiveWindowInfo(activeWindowInfo) {
  const { windowManager } = deps;
  if (!windowManager?.mainWindow || windowManager.mainWindow.isDestroyed() || !activeWindowInfo) return;
  windowManager.mainWindow.webContents.send('active-window-info', windowAwarenessEnabled
    ? activeWindowInfo
    : unavailableActiveWindowPayload('disabled'));
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
  // macOS 上无窗口边缘行走物理交互，采样仅用于全屏/防打扰守卫，将采样间隔放宽至 30 秒，
  // 避免高频 pmset -g assertions 子进程空转损耗笔记本电量与 CPU。
  const sampleIntervalMs = process.platform === 'darwin'
    ? MAC_ACTIVE_WINDOW_SAMPLE_INTERVAL_MS
    : ACTIVE_WINDOW_SAMPLE_INTERVAL_MS;

  // Windows 的全屏 RDP 防遮挡独立于窗口边缘行走开关，复用同一采样器。
  const provider = (windowAwarenessEnabled || process.platform === 'win32')
    ? (deps.createActiveWindowProvider ? deps.createActiveWindowProvider(process.platform) : createActiveWindowProvider(process.platform))
    : createUnavailableActiveWindowProvider('disabled');

  activeWindowSampler = createActiveWindowSampler({
    provider,
    getWindowBounds: deps.getActiveWindowMainBounds,
    getDisplays: deps.getActiveWindowDisplays,
    onChange: (payload) => {
      deps.onActiveWindowChanged?.();
      sendActiveWindowInfo(payload);
    },
    intervalMs: sampleIntervalMs,
    refreshUnchangedIntervalMs: sampleIntervalMs,
  });
  activeWindowSampler.start();
}

function setWindowAwarenessEnabled(enabled) {
  const { windowManager, trayManager, StoreManager } = deps;
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  windowAwarenessEnabled = Boolean(enabled);
  if (StoreManager) {
    const store = StoreManager.getStore();
    if (store) store.set(WINDOW_AWARENESS_STORE_KEY, windowAwarenessEnabled);
  }
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
  getLastPayload: () => activeWindowSampler
    ? (windowAwarenessEnabled ? activeWindowSampler.getLastPayload() : unavailableActiveWindowPayload('disabled'))
    : undefined,
  getNativePayload: () => activeWindowSampler?.getLastPayload(),
  isEnabled: () => windowAwarenessEnabled,
};

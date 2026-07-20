/**
 * src/main/services/PomodoroService.js
 * 番茄钟会话状态机：分钟数存取、皮肤素材缓存、tick 定时器、启停会话、
 * 状态快照与推送。init(deps) 模式，deps: { SkinService, PetVisibilityService,
 * pomodoroWindowModule, windowManager, trayManager, StoreManager }。
 */
const { normalizePomodoroMinutes } = require('../../../ipcContracts');
const { PomodoroSystem } = require('../../../src/systems/PomodoroSystem');
const { POMODORO_LAST_MINUTES_KEY } = require('../constants');

let deps = {};
let pomodoroSystem = new PomodoroSystem();
let pomodoroTickTimer = null;
let cachedPomodoroAssets = null;
let cachedPomodoroAssetsSkinId = null;

function init(dependencies) {
  deps = dependencies;
}

function getStoredPomodoroMinutes() {
  const store = deps.StoreManager.getStore();
  if (!store) return normalizePomodoroMinutes(null);
  return normalizePomodoroMinutes(store.get(POMODORO_LAST_MINUTES_KEY));
}

function savePomodoroMinutes(minutes) {
  const store = deps.StoreManager.getStore();
  if (!store) return;
  store.set(POMODORO_LAST_MINUTES_KEY, normalizePomodoroMinutes(minutes));
}

function getPomodoroAssets() {
  const resolvePomodoroAsset = deps.SkinService.resolvePomodoroAsset;
  const currentSkinId = deps.SkinService.getCurrentSkinId();
  if (cachedPomodoroAssets && cachedPomodoroAssetsSkinId === currentSkinId) {
    return cachedPomodoroAssets;
  }
  const assets = {
    yueqi: resolvePomodoroAsset(currentSkinId, 'left_cultivate.webp'),
    shenjiu: resolvePomodoroAsset(currentSkinId, 'right_cultivate.webp'),
    cultivate: resolvePomodoroAsset(currentSkinId, 'cultivate.webp'),
    kiss: resolvePomodoroAsset(currentSkinId, 'kiss.webp'),
  };
  cachedPomodoroAssets = assets;
  cachedPomodoroAssetsSkinId = currentSkinId;
  return assets;
}

function getPomodoroSnapshot(now) {
  const snapshot = pomodoroSystem.getSnapshot(now);
  return {
    ...snapshot,
    lastPomodoroMinutes: snapshot.durationMinutes || getStoredPomodoroMinutes(),
    isAlwaysOnTop: deps.pomodoroWindowModule.isPomodoroAlwaysOnTop(),
    skinId: deps.SkinService.getCurrentSkinId(),
    assets: getPomodoroAssets(),
  };
}

function sendPomodoroState() {
  const { windowManager } = deps;
  if (!windowManager.pomodoroWindow || windowManager.pomodoroWindow.isDestroyed()) return;
  windowManager.pomodoroWindow.webContents.send('pomodoro-state', getPomodoroSnapshot());
}

function stopPomodoroTicker() {
  if (pomodoroTickTimer) {
    clearInterval(pomodoroTickTimer);
    pomodoroTickTimer = null;
  }
}

function startPomodoroTicker() {
  stopPomodoroTicker();
  pomodoroTickTimer = setInterval(() => {
    const snapshot = getPomodoroSnapshot();
    sendPomodoroState();
    if (snapshot.status === 'completed') {
      stopPomodoroTicker();
      deps.PetVisibilityService.restorePomodoroPetFocus();
      deps.trayManager.refreshTrayMenu();
    }
  }, 1000);
}

async function startPomodoroSession(minutes) {
  await deps.StoreManager.initStore();
  const normalizedMinutes = normalizePomodoroMinutes(minutes, getStoredPomodoroMinutes());
  savePomodoroMinutes(normalizedMinutes);
  const snapshot = pomodoroSystem.start(normalizedMinutes);
  deps.PetVisibilityService.enterPomodoroPetFocus();
  startPomodoroTicker();
  deps.trayManager.refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}

function stopPomodoroSession() {
  stopPomodoroTicker();
  const snapshot = pomodoroSystem.stop();
  deps.PetVisibilityService.restorePomodoroPetFocus();
  deps.trayManager.refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}

module.exports = {
  init,
  getStoredPomodoroMinutes,
  savePomodoroMinutes,
  getPomodoroAssets,
  getPomodoroSnapshot,
  sendPomodoroState,
  startPomodoroTicker,
  stopPomodoroTicker,
  startPomodoroSession,
  stopPomodoroSession,
  getPomodoroSystem: () => pomodoroSystem,
};

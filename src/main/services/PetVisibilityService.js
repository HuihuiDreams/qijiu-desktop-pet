/**
 * src/main/services/PetVisibilityService.js
 * 桌宠可见性状态机：手动隐藏、会议自动隐藏、番茄钟专注隐藏三个来源的合并与优先级
 * 仲裁（manual > meeting > pomodoro），以及走动暂停状态。
 *
 * 本文件不直接引入 Electron 模块——所有 Electron 能力（ipcMain、BrowserWindow 访问）
 * 均经注入的 deps 触达，使其可被 node --test 直接加载做行为级单测。
 * init(deps) 模式，deps: { ipcMain, windowManager, trayManager }。
 */
let deps = {};
let petHidden = false;         // 桌宠隐藏状态（手动）
let meetingHidden = false;     // 会议检测导致的自动隐藏状态
let pomodoroPetHidden = false; // 番茄钟专注导致的隐藏状态
let isPaused = false;          // 走动暂停状态
let pomodoroFocusSnapshot = null;

function init(dependencies) {
  deps = dependencies;
  const { ipcMain } = deps;

  ipcMain.handle('get-pet-visibility-state', () => {
    return getPetVisibilityState();
  });
}

function isPetCurrentlyHidden() {
  return petHidden || meetingHidden || pomodoroPetHidden;
}

function getPetVisibilityState() {
  const sources = {
    manual: petHidden,
    meeting: meetingHidden,
    pomodoro: pomodoroPetHidden,
  };

  if (petHidden) return { visible: false, reason: 'manual', sources };
  if (meetingHidden) return { visible: false, reason: 'meeting', sources };
  if (pomodoroPetHidden) return { visible: false, reason: 'pomodoro', sources };
  return { visible: true, reason: 'visible', sources };
}

function sendPetVisibility(visible) {
  const { windowManager } = deps;
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return;
  windowManager.mainWindow.webContents.send('toggle-pet-visibility', visible, getPetVisibilityState());
}

function enterPomodoroPetFocus() {
  const { windowManager, trayManager } = deps;
  if (!pomodoroFocusSnapshot) {
    pomodoroFocusSnapshot = { wasPaused: isPaused };
  }
  pomodoroPetHidden = true;
  sendPetVisibility(false);
  if (!isPaused) {
    isPaused = true;
    if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('toggle-pause', true);
  }
  trayManager.refreshTrayMenu();
}

function restorePomodoroPetFocus() {
  const { windowManager, trayManager } = deps;
  if (!pomodoroFocusSnapshot && !pomodoroPetHidden) return;
  const wasPaused = pomodoroFocusSnapshot ? pomodoroFocusSnapshot.wasPaused : isPaused;
  pomodoroPetHidden = false;
  if (isPaused !== wasPaused) {
    isPaused = wasPaused;
    if (windowManager.mainWindow) windowManager.mainWindow.webContents.send('toggle-pause', isPaused);
  }
  sendPetVisibility(!isPetCurrentlyHidden());
  pomodoroFocusSnapshot = null;
  trayManager.refreshTrayMenu();
}

function showPetManually() {
  const { trayManager } = deps;
  petHidden = false;
  meetingHidden = false;
  sendPetVisibility(!isPetCurrentlyHidden());
  trayManager.refreshTrayMenu();
}

function hidePetManually() {
  const { trayManager } = deps;
  petHidden = true;
  meetingHidden = false;
  sendPetVisibility(false);
  trayManager.refreshTrayMenu();
}

function hidePetForMeeting() {
  const { trayManager } = deps;
  if (meetingHidden) return;
  meetingHidden = true;
  if (!petHidden && !pomodoroPetHidden) {
    sendPetVisibility(false);
  }
  trayManager.refreshTrayMenu();
}

function showPetAfterMeeting() {
  const { trayManager } = deps;
  if (!meetingHidden) return;
  meetingHidden = false;
  if (!petHidden && !pomodoroPetHidden) {
    sendPetVisibility(true);
  }
  trayManager.refreshTrayMenu();
}

function setPaused(val) {
  const { windowManager } = deps;
  isPaused = val;
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send('toggle-pause', isPaused);
  }
}

module.exports = {
  init,
  isPetCurrentlyHidden,
  getPetVisibilityState,
  sendPetVisibility,
  showPetManually,
  hidePetManually,
  hidePetForMeeting,
  showPetAfterMeeting,
  enterPomodoroPetFocus,
  restorePomodoroPetFocus,
  setPaused,
  getIsPaused: () => isPaused,
  getPomodoroPetHidden: () => pomodoroPetHidden,
};

const fs = require('fs');
let main = fs.readFileSync('main.js', 'utf8');

const pomoCode = `const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./WindowManager');

const POMODORO_ALWAYS_ON_TOP_LEVEL = 'screen-saver';
let pomodoroAlwaysOnTop = true;
let deps = {};

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('pomodoro-open-window', () => {
    openPomodoroWindow();
    return true;
  });

  ipcMain.handle('pomodoro-get-state', () => {
    const sys = deps.getPomodoroSystem();
    return {
      isAlwaysOnTop: pomodoroAlwaysOnTop,
      state: sys.getState(),
      timeRemaining: sys.getTimeRemaining(),
      currentPhase: sys.getCurrentPhase(),
    };
  });

  ipcMain.handle('pomodoro-start', (event, { workDuration, breakDuration }) => {
    return deps.createIpcSuccess(deps.startPomodoroSession(workDuration, breakDuration));
  });

  ipcMain.handle('pomodoro-stop', () => {
    return deps.createIpcSuccess(deps.stopPomodoroSession());
  });

  ipcMain.handle('pomodoro-close-window', () => {
    return deps.createIpcSuccess(closePomodoroWindow());
  });

  ipcMain.handle('pomodoro-set-always-on-top', (event, enabled) => {
    pomodoroAlwaysOnTop = Boolean(enabled);
    applyPomodoroWindowPinState(pomodoroAlwaysOnTop);
    return deps.createIpcSuccess();
  });

  ipcMain.handle('pomodoro-command', (event, command) => {
    const sys = deps.getPomodoroSystem();
    const success = sys.handleCommand(command);
    if (!success) return { success: false, error: 'Invalid Pomodoro command in current state' };
    if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
      windowManager.pomodoroWindow.webContents.send('pomodoro-state-update', {
        state: sys.getState(),
        timeRemaining: sys.getTimeRemaining(),
        currentPhase: sys.getCurrentPhase(),
      });
    }
    return deps.createIpcSuccess();
  });
}

function getInitialPomodoroWindowBounds() {
  const width = 336;
  const height = 360;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width: areaWidth, height: areaHeight } = display.workArea;

  return {
    width,
    height,
    x: Math.round(x + (areaWidth - width) / 2),
    y: Math.round(y + (areaHeight - height) / 2),
  };
}

function createPomodoroWindow() {
  if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) return windowManager.pomodoroWindow;

  pomodoroAlwaysOnTop = true;
  const bounds = getInitialPomodoroWindowBounds();
  windowManager.pomodoroWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: pomodoroAlwaysOnTop,
    skipTaskbar: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyPomodoroWindowPinState();
  windowManager.pomodoroWindow.loadFile(path.join(__dirname, '..', '..', '..', 'src', 'pomodoro.html'));

  windowManager.pomodoroWindow.webContents.on('did-finish-load', () => deps.sendPomodoroState());
  windowManager.pomodoroWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.pomodoroWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.pomodoroWindow.on('closed', () => {
    windowManager.pomodoroWindow = null;
    deps.stopPomodoroSession();
  });

  return windowManager.pomodoroWindow;
}

function openPomodoroWindow() {
  const win = createPomodoroWindow();
  if (!win.isVisible()) {
    win.show();
  }
  win.moveTop();
  win.focus();
  deps.sendPomodoroState();
  return win;
}

function closePomodoroWindow() {
  deps.stopPomodoroSession();
  if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
    windowManager.pomodoroWindow.close();
  }
  return deps.getPomodoroSnapshot();
}

function applyPomodoroWindowPinState(shouldRaise = false) {
  if (!windowManager.pomodoroWindow || windowManager.pomodoroWindow.isDestroyed()) return;

  windowManager.pomodoroWindow.setAlwaysOnTop(pomodoroAlwaysOnTop, POMODORO_ALWAYS_ON_TOP_LEVEL);

  if (pomodoroAlwaysOnTop) {
    windowManager.pomodoroWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    windowManager.pomodoroWindow.setVisibleOnAllWorkspaces(false);
  }

  if (!shouldRaise) return;

  if (windowManager.pomodoroWindow.isMinimized()) {
    windowManager.pomodoroWindow.restore();
  }
  if (!windowManager.pomodoroWindow.isVisible()) {
    windowManager.pomodoroWindow.show();
  }
  windowManager.pomodoroWindow.moveTop();
}

module.exports = {
  init,
  createPomodoroWindow,
  openPomodoroWindow,
  closePomodoroWindow,
  applyPomodoroWindowPinState,
  isPomodoroAlwaysOnTop: () => pomodoroAlwaysOnTop
};
`;

fs.writeFileSync('src/main/windows/PomodoroWindow.js', pomoCode);

// Removals from main.js
main = main.replace(/let pomodoroAlwaysOnTop = true;\n/, '');
main = main.replace(/const POMODORO_ALWAYS_ON_TOP_LEVEL = 'screen-saver';\n/, '');

main = main.replace(/function getInitialPomodoroWindowBounds\(\) \{[\s\S]*?return \{\s*width,[\s\S]*?\};\s*\}/, '');
main = main.replace(/function createPomodoroWindow\(\) \{[\s\S]*?return windowManager\.pomodoroWindow;\s*\}/, '');
main = main.replace(/function openPomodoroWindow\(\) \{[\s\S]*?return win;\s*\}/, '');
main = main.replace(/function closePomodoroWindow\(\) \{[\s\S]*?return getPomodoroSnapshot\(\);\s*\}/, '');
main = main.replace(/function applyPomodoroWindowPinState\(shouldRaise = false\) \{[\s\S]*?windowManager\.pomodoroWindow\.moveTop\(\);\s*\}/, '');

// IPC handler removals
main = main.replace(/ipcMain\.handle\('pomodoro-open-window'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('pomodoro-get-state'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('pomodoro-start'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('pomodoro-stop'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('pomodoro-close-window'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('pomodoro-set-always-on-top'[\s\S]*?\}\);\s*/, '');
main = main.replace(/ipcMain\.handle\('pomodoro-command'[\s\S]*?\}\);\s*/, '');

main = main.replace(
  "const skinSelectorWindowModule = require('./src/main/windows/SkinSelectorWindow');",
  "const skinSelectorWindowModule = require('./src/main/windows/SkinSelectorWindow');\nconst pomodoroWindowModule = require('./src/main/windows/PomodoroWindow');"
);

main = main.replace(
  "skinSelectorWindowModule.init({",
  "pomodoroWindowModule.init({\n    getPomodoroSystem: () => pomodoroSystem,\n    startPomodoroSession,\n    stopPomodoroSession,\n    getPomodoroSnapshot,\n    sendPomodoroState,\n    createIpcSuccess\n  });\n  skinSelectorWindowModule.init({"
);

// We need to replace accesses to pomodoroAlwaysOnTop
main = main.replace(/pomodoroAlwaysOnTop/g, "pomodoroWindowModule.isPomodoroAlwaysOnTop()");

main = main.replace(/openPomodoroWindow\(/g, "pomodoroWindowModule.openPomodoroWindow(");
main = main.replace(/closePomodoroWindow\(/g, "pomodoroWindowModule.closePomodoroWindow(");

fs.writeFileSync('main.js', main);
console.log('Removed Pomodoro Window logic from main.js');

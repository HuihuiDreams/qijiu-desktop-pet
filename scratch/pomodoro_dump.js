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
      restorePomodoroPetFocus();
      refreshTrayMenu();
    }
  }, 1000);
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  applyPomodoroWindowPinState();
  windowManager.pomodoroWindow.loadFile(path.join(__dirname, 'src', 'pomodoro.html'));

  windowManager.pomodoroWindow.webContents.on('did-finish-load', sendPomodoroState);
  windowManager.pomodoroWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowManager.pomodoroWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  windowManager.pomodoroWindow.on('closed', () => {
    windowManager.pomodoroWindow = null;
    stopPomodoroSession();
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
  sendPomodoroState();
  return win;
}

async function startPomodoroSession(minutes) {
  await initStore();
  const normalizedMinutes = normalizePomodoroMinutes(minutes, getStoredPomodoroMinutes());
  savePomodoroMinutes(normalizedMinutes);
  const snapshot = pomodoroSystem.start(normalizedMinutes);
  enterPomodoroPetFocus();
  startPomodoroTicker();
  refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}

function stopPomodoroSession() {
  stopPomodoroTicker();
  const snapshot = pomodoroSystem.stop();
  restorePomodoroPetFocus();
  refreshTrayMenu();
  sendPomodoroState();
  return snapshot;
}

function closePomodoroWindow() {
  stopPomodoroSession();
  if (windowManager.pomodoroWindow && !windowManager.pomodoroWindow.isDestroyed()) {
    windowManager.pomodoroWindow.close();
  }
  return getPomodoroSnapshot();
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

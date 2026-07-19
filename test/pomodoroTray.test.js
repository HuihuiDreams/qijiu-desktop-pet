const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'PomodoroWindow.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8');

test('main process creates a sandboxed pomodoro BrowserWindow from local files', () => {
  assert.match(mainSource, /function createPomodoroWindow\(\)/);
  assert.match(mainSource, /if \(windowManager\.pomodoroWindow && !windowManager\.pomodoroWindow\.isDestroyed\(\)\) return windowManager\.pomodoroWindow/);
  assert.match(mainSource, /pomodoroWindowModule\.isPomodoroAlwaysOnTop\(\)/);
  assert.match(mainSource, /windowManager\.pomodoroWindow = new BrowserWindow/);
  assert.match(mainSource, /windowManager\.pomodoroWindow\.loadFile\(path\.join\(__dirname, ('.*?', )*'src', 'pomodoro\.html'\)\)/);
  assert.match(mainSource, /const POMODORO_ALWAYS_ON_TOP_LEVEL = 'screen-saver'/);
  assert.match(mainSource, /windowManager\.pomodoroWindow\.setAlwaysOnTop\(pomodoroAlwaysOnTop, POMODORO_ALWAYS_ON_TOP_LEVEL\)/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /windowManager\.pomodoroWindow\.on\('closed'/);
  assert.match(mainSource, /stopPomodoroSession\(\)/);
  assert.match(mainSource, /stopPomodoroTicker\(\)/);
});

test('pomodoro window uses a compact corner-friendly default size', () => {
  assert.match(mainSource, /const width = 336/);
  assert.match(mainSource, /const height = 360/);
});

test('tray menu exposes pomodoro entry and running state labels', () => {
  assert.match(mainSource, /trayMenuLabel\('trayPomodoroOpen'\)/);
  assert.match(mainSource, /trayText\('trayPomodoroRunning'/);
  assert.match(mainSource, /openPomodoroWindow\(\)/);
});

test('main process registers pomodoro IPC handlers', () => {
  for (const channel of [
    'pomodoro-open-window',
    'pomodoro-get-state',
    'pomodoro-start',
    'pomodoro-stop',
    'pomodoro-close-window',
    'pomodoro-set-always-on-top',
  ]) {
    assert.match(mainSource, new RegExp(`ipcMain\\.handle\\('${channel}'`), `${channel} should be handled`);
  }
});

test('toggling pomodoro pin state keeps the window reachable', () => {
  assert.match(mainSource, /function applyPomodoroWindowPinState\(shouldRaise = false\)/);
  assert.match(mainSource, /applyPomodoroWindowPinState\(pomodoroAlwaysOnTop\)/);
  assert.match(mainSource, /pomodoroWindow\.restore\(\)/);
  assert.match(mainSource, /pomodoroWindow\.show\(\)/);
  assert.match(mainSource, /pomodoroWindow\.moveTop\(\)/);
  assert.match(mainSource, /pomodoroWindow\.focus\(\)/);
});

test('unpinning pomodoro removes it from macOS fullscreen Spaces', () => {
  assert.match(
    mainSource,
    /setVisibleOnAllWorkspaces\(true,\s*\{\s*visibleOnFullScreen:\s*true\s*\}\)/,
    'pinned state enables visibleOnFullScreen'
  );
  assert.match(
    mainSource,
    /setVisibleOnAllWorkspaces\(false\)/,
    'unpinned state fully removes window from all-workspaces overlay'
  );
});

test('pomodoro pet assets use current skin with default fallback', () => {
  assert.match(mainSource, /function resolvePomodoroAsset\(skinId, filename\)/);
  assert.match(mainSource, /fs\.existsSync\(candidatePath\)/);
  assert.match(mainSource, /createAssetUrl\(protectedAssetId\)/);
  assert.match(mainSource, /createAssetUrl\(`skin\/default\/\$\{filename\}`\)/);
  assert.match(mainSource, /resolvePomodoroAsset\(currentSkinId, 'left_cultivate\.webp'\)/);
  assert.match(mainSource, /resolvePomodoroAsset\(currentSkinId, 'right_cultivate\.webp'\)/);
  assert.match(mainSource, /resolvePomodoroAsset\(currentSkinId, 'cultivate\.webp'\)/);
  assert.match(mainSource, /resolvePomodoroAsset\(currentSkinId, 'kiss\.webp'\)/);
});

test('pomodoro session hides pets temporarily and restores previous pause state', () => {
  assert.match(mainSource, /let pomodoroPetHidden = false/);
  assert.match(mainSource, /function enterPomodoroPetFocus\(\)/);
  assert.match(mainSource, /function restorePomodoroPetFocus\(\)/);
  assert.match(mainSource, /pomodoroFocusSnapshot\.wasPaused/);
  assert.match(mainSource, /return petHidden \|\| meetingHidden \|\| pomodoroPetHidden/);
  assert.match(mainSource, /sendPetVisibility\(!isPetCurrentlyHidden\(\)\)/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('main process creates a sandboxed pomodoro BrowserWindow from local files', () => {
  assert.match(mainSource, /function createPomodoroWindow\(\)/);
  assert.match(mainSource, /pomodoroWindow = new BrowserWindow/);
  assert.match(mainSource, /pomodoroWindow\.loadFile\(path\.join\(__dirname, 'src', 'pomodoro\.html'\)\)/);
  assert.match(mainSource, /pomodoroWindow\.setAlwaysOnTop\(pomodoroAlwaysOnTop, 'floating'\)/);
  assert.match(mainSource, /sandbox: true/);
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

test('pomodoro session hides pets temporarily and restores previous pause state', () => {
  assert.match(mainSource, /let pomodoroPetHidden = false/);
  assert.match(mainSource, /function enterPomodoroPetFocus\(\)/);
  assert.match(mainSource, /function restorePomodoroPetFocus\(\)/);
  assert.match(mainSource, /pomodoroFocusSnapshot\.wasPaused/);
});

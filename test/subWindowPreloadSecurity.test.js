const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const FORBIDDEN_SUBWINDOW_APIS = [
  'saveData',
  'loadData',
  'setAutoLaunch',
  'getAutoLaunch',
  'setLocale',
  'setCurrentSkin',
];

test('status window uses a minimal dedicated preload', () => {
  const source = read('statusPreload.js');
  const windowSource = read('src/main/windows/StatusWindow.js');

  assert.match(windowSource, /preload: path\.join\([^\n]*'statusPreload\.js'\)/);
  for (const api of ['getLocale', 'onLocaleChange', 'onStatusWindowData', 'resizeStatusWindow', 'closeStatusWindow']) {
    assert.match(source, new RegExp(`${api}:`));
  }
  for (const api of FORBIDDEN_SUBWINDOW_APIS) assert.equal(source.includes(`${api}:`), false);
});

test('pomodoro window uses a minimal dedicated preload', () => {
  const source = read('pomodoroPreload.js');
  const windowSource = read('src/main/windows/PomodoroWindow.js');

  assert.match(windowSource, /preload: path\.join\([^\n]*'pomodoroPreload\.js'\)/);
  for (const api of ['getLocale', 'onLocaleChange', 'getPomodoroState', 'startPomodoro', 'stopPomodoro', 'closePomodoroWindow', 'setPomodoroAlwaysOnTop', 'onPomodoroState']) {
    assert.match(source, new RegExp(`${api}:`));
  }
  for (const api of FORBIDDEN_SUBWINDOW_APIS) assert.equal(source.includes(`${api}:`), false);
});

test('city setting window uses a minimal dedicated preload', () => {
  const source = read('citySettingPreload.js');
  const windowSource = read('src/main/windows/CitySettingWindow.js');

  assert.match(windowSource, /preload: path\.join\([^\n]*'citySettingPreload\.js'\)/);
  for (const api of ['getLocale', 'onLocaleChange', 'getCitySettings', 'setCityName', 'closeCitySettingWindow']) {
    assert.match(source, new RegExp(`${api}:`));
  }
  for (const api of FORBIDDEN_SUBWINDOW_APIS) assert.equal(source.includes(`${api}:`), false);
});

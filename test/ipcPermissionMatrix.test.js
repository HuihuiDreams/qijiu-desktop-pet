const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const PROTECTED_CHANNELS = [
  ['src/main/services/StorageIpc.js', 'save-data'],
  ['src/main/services/StorageIpc.js', 'load-data'],
  ['src/main/services/StorageIpc.js', 'set-auto-launch'],
  ['src/main/services/StorageIpc.js', 'get-auto-launch'],
  ['src/main/services/LocaleService.js', 'get-locale'],
  ['src/main/services/LocaleService.js', 'set-locale'],
  ['src/main/services/SkinService.js', 'get-available-skins'],
  ['src/main/services/SkinService.js', 'get-available-overlay-keys'],
  ['src/main/services/SkinService.js', 'set-current-skin'],
  ['src/main/DisplayService.js', 'request-window-migration'],
  ['src/main/DisplayService.js', 'drag-started'],
  ['src/main/DisplayService.js', 'drag-ended'],
  ['src/main/services/WindowAwarenessService.js', 'get-active-window-info'],
  ['src/main/services/PetVisibilityService.js', 'get-pet-visibility-state'],
  ['src/main/services/BreakReminderController.js', 'break-reminder-dismissed'],
  ['src/main/windows/StatusWindow.js', 'show-status-window'],
  ['src/main/windows/StatusWindow.js', 'hide-status-window'],
  ['src/main/windows/StatusWindow.js', 'update-status-window'],
  ['src/main/windows/StatusWindow.js', 'resize-status-window'],
  ['src/main/windows/StatusWindow.js', 'status-close-window'],
  ['src/main/windows/PomodoroWindow.js', 'pomodoro-open-window'],
  ['src/main/windows/PomodoroWindow.js', 'pomodoro-get-state'],
  ['src/main/windows/PomodoroWindow.js', 'pomodoro-start'],
  ['src/main/windows/PomodoroWindow.js', 'pomodoro-stop'],
  ['src/main/windows/PomodoroWindow.js', 'pomodoro-close-window'],
  ['src/main/windows/PomodoroWindow.js', 'pomodoro-set-always-on-top'],
  ['src/main/services/WeatherSyncController.js', 'get-city-settings'],
  ['src/main/services/WeatherSyncController.js', 'set-city-name'],
  ['src/main/windows/CitySettingWindow.js', 'close-city-setting-window'],
];

test('every renderer-initiated privileged IPC channel checks its sender first', () => {
  for (const [relativePath, channel] of PROTECTED_CHANNELS) {
    const source = read(relativePath);
    const registrationIndex = source.indexOf(`'${channel}'`);
    assert.notEqual(registrationIndex, -1, `${channel} registration is missing`);
    const handlerPrefix = source.slice(registrationIndex, registrationIndex + 420);
    assert.match(
      handlerPrefix,
      /isSender(MainWindow|Window|AnyWindow)\(/,
      `${channel} must authorize event.sender before handling the request`,
    );
  }
});

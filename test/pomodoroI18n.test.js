const assert = require('node:assert/strict');
const test = require('node:test');

const { I18N } = require('../src/data/i18n');

const REQUIRED_POMODORO_KEYS = [
  'trayPomodoroOpen',
  'trayPomodoroRunning',
  'trayPomodoroCompleted',
  'pomodoroTitle',
  'pomodoroPin',
  'pomodoroUnpin',
  'pomodoroClose',
  'pomodoroPrompt',
  'pomodoroDecrease',
  'pomodoroIncrease',
  'pomodoroStart',
  'pomodoroStop',
  'pomodoroCompleted',
  'pomodoroCompleteMessage',
  'pomodoroFinish',
];

test('pomodoro UI text exists in zh, en, and ja dictionaries', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    const ui = I18N[locale]?.ui;
    assert.ok(ui, `${locale} ui dictionary should exist`);
    for (const key of REQUIRED_POMODORO_KEYS) {
      assert.equal(typeof ui[key], 'string', `${locale}.${key} should be a string`);
      assert.notEqual(ui[key].trim(), '', `${locale}.${key} should not be empty`);
      assert.notEqual(ui[key], key, `${locale}.${key} should not fall back to raw key text`);
    }
  }
});

test('pomodoro completion copy stays encouraging instead of punitive', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    const message = I18N[locale].ui.pomodoroCompleteMessage;
    assert.equal(/失败|懲罰|punish|failed/i.test(message), false);
  }
});

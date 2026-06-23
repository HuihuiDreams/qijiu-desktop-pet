const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Dynamically require i18n.js to get the real object
const { DICTIONARY } = require('../src/data/i18n.js');

test('i18n dictionary structure is valid', () => {
  assert.ok(DICTIONARY, 'DICTIONARY should be exported');
  assert.ok(DICTIONARY.zh, 'Chinese dictionary should exist');
  assert.ok(DICTIONARY.en, 'English dictionary should exist');
  assert.ok(DICTIONARY.ja, 'Japanese dictionary should exist');
});

const KEY_UI_TEXT_KEYS = [
  'trayShow',
  'trayHide',
  'trayExit',
  'trayTitle',
  'trayDesc',
  'updateTitle',
  'updateMessage',
  'updateCancel',
  'updateInstall',
  'pomodoroTitle',
  'pomodoroStart',
  'pomodoroFinish',
  'citySettingTitle',
  'citySettingConfirm',
  'contextMenuFeed',
  'contextMenuCultivate',
  'contextMenuRest',
  'contextMenuStatus',
];

const LOCALES = ['zh', 'en', 'ja'];

test('Key UI text should exist and be a non-empty string for all locales', () => {
  for (const key of KEY_UI_TEXT_KEYS) {
    for (const locale of LOCALES) {
      const dict = DICTIONARY[locale];
      assert.ok(dict, `Dictionary for locale "${locale}" should exist`);
      const text = dict[key];
      assert.strictEqual(
        typeof text,
        'string',
        `Key "${key}" in locale "${locale}" should be a string, but got ${typeof text}`,
      );
      assert.ok(
        text.trim().length > 0,
        `Key "${key}" in locale "${locale}" should not be an empty string`,
      );
    }
  }
});
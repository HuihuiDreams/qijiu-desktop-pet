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
  'nameYueqi',
  'nicknameYueqi',
  'nameShenjiu',
  'nicknameShenjiu',
  'meditateYueqi',
  'meditateShenjiu',
  'petYueqi',
  'petShenjiu',
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

test('pet interaction menu text aligns across locales for yueqi and shenjiu', () => {
  assert.equal(DICTIONARY.zh.petYueqi, '🤚 天使关怀');
  assert.equal(DICTIONARY.zh.petShenjiu, '🤚 恶魔偏宠');

  assert.equal(DICTIONARY.en.petYueqi, '🤚 Angel\'s Fondness');
  assert.equal(DICTIONARY.en.petShenjiu, '🤚 Crowley\'s Care');

  assert.equal(DICTIONARY.ja.petYueqi, '🤚 天使の慈愛');
  assert.equal(DICTIONARY.ja.petShenjiu, '🤚 悪魔の寵愛');
});

test('classic "Let there be light!" dialogue is integrated in cultivate and morning across locales', () => {
  const { I18N } = require('../src/data/i18n.js');
  const dialoguesSource = fs.readFileSync(path.join(ROOT, 'src', 'data', 'dialogues.js'), 'utf8');

  for (const locale of ['zh', 'en', 'ja']) {
    const cultivatePool = I18N[locale].dialogues.cultivate.yueqi;
    assert.ok(
      cultivatePool.some(line => line.includes('Let there be light!')),
      `I18N.${locale}.dialogues.cultivate.yueqi should include "Let there be light!"`,
    );

    const morningLine = I18N[locale].ui.morningYueqi;
    assert.ok(
      morningLine.includes('Let there be light!'),
      `I18N.${locale}.ui.morningYueqi should include "Let there be light!"`,
    );
  }

  assert.ok(
    dialoguesSource.includes('Let there be light!'),
    'dialogues.js fallback should include "Let there be light!"',
  );
});


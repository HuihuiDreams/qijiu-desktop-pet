const assert = require('node:assert/strict');
const test = require('node:test');

const { I18N } = require('../src/data/i18n');

const LOCALES = ['zh', 'en', 'ja'];

test('all locales have a ui dictionary object', () => {
  for (const locale of LOCALES) {
    assert.ok(I18N[locale], `I18N.${locale} should exist`);
    assert.ok(I18N[locale].ui, `I18N.${locale}.ui should exist`);
    assert.equal(typeof I18N[locale].ui, 'object', `I18N.${locale}.ui should be an object`);
  }
});

test('en and ja ui dictionaries cover every key from zh', () => {
  const zhKeys = Object.keys(I18N.zh.ui);
  assert.ok(zhKeys.length > 0, 'zh ui should have at least one key');

  for (const locale of ['en', 'ja']) {
    const missing = [];
    for (const key of zhKeys) {
      const value = I18N[locale].ui[key];
      if (value === undefined || value === null) {
        missing.push(key);
      }
    }
    assert.deepEqual(missing, [], `${locale} is missing ui keys: ${missing.join(', ')}`);
  }
});

test('all ui string values are non-empty and not raw key fallbacks', () => {
  for (const locale of LOCALES) {
    const ui = I18N[locale].ui;
    for (const [key, value] of Object.entries(ui)) {
      if (typeof value === 'function') continue; // returnYueqi is a function
      assert.equal(typeof value, 'string', `${locale}.ui.${key} should be a string, got ${typeof value}`);
      assert.notEqual(value.trim(), '', `${locale}.ui.${key} should not be empty`);
      assert.notEqual(value, key, `${locale}.ui.${key} should not equal its own key name (likely untranslated)`);
    }
  }
});

test('ui string values contain no replacement-character garble (U+FFFD)', () => {
  for (const locale of LOCALES) {
    const ui = I18N[locale].ui;
    for (const [key, value] of Object.entries(ui)) {
      if (typeof value !== 'string') continue;
      assert.equal(
        value.includes('\uFFFD'),
        false,
        `${locale}.ui.${key} contains U+FFFD replacement character (garbled text)`,
      );
    }
  }
});

const REQUIRED_DIALOGUE_CATEGORIES = [
  'greet',
  'idle',
  'weather_rain',
  'weather_snow',
  'weather_clear',
  'weather_cloudy',
  'weather_windy',
  'weather_thunderstorm',
  'weather_heat',
  'hungry',
  'lowQi',
  'lowMood',
  'breakReminder',
];

test('core dialogue categories exist in all locales with yueqi and shenjiu arrays', () => {
  for (const locale of LOCALES) {
    const dialogues = I18N[locale].dialogues;
    assert.ok(dialogues, `I18N.${locale}.dialogues should exist`);

    for (const category of REQUIRED_DIALOGUE_CATEGORIES) {
      const cat = dialogues[category];
      assert.ok(cat, `${locale}.dialogues.${category} should exist`);
      assert.ok(Array.isArray(cat.yueqi), `${locale}.dialogues.${category}.yueqi should be an array`);
      assert.ok(cat.yueqi.length > 0, `${locale}.dialogues.${category}.yueqi should not be empty`);
      assert.ok(Array.isArray(cat.shenjiu), `${locale}.dialogues.${category}.shenjiu should be an array`);
      assert.ok(cat.shenjiu.length > 0, `${locale}.dialogues.${category}.shenjiu should not be empty`);
    }
  }
});

test('dialogue strings contain no U+FFFD replacement characters', () => {
  for (const locale of LOCALES) {
    const dialogues = I18N[locale].dialogues;
    for (const [category, entries] of Object.entries(dialogues)) {
      if (typeof entries !== 'object' || entries === null) continue;
      for (const [character, lines] of Object.entries(entries)) {
        if (!Array.isArray(lines)) continue;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (typeof line !== 'string') continue;
          assert.equal(
            line.includes('\uFFFD'),
            false,
            `${locale}.dialogues.${category}.${character}[${i}] contains garbled text`,
          );
        }
      }
    }
  }
});

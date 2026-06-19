const assert = require('node:assert/strict');
const test = require('node:test');

const { I18N } = require('../src/data/i18n');

const REQUIRED_CITY_SETTING_KEYS = [
  'citySettingTitle',
  'citySettingCurrent',
  'citySettingNone',
  'citySettingPlaceholder',
  'citySettingConfirm',
  'citySettingSuccess',
  'citySettingError',
  'citySettingSearching',
];

test('city setting UI text exists in zh, en, and ja dictionaries', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    const ui = I18N[locale]?.ui;
    assert.ok(ui, `${locale} ui dictionary should exist`);
    for (const key of REQUIRED_CITY_SETTING_KEYS) {
      assert.equal(typeof ui[key], 'string', `${locale}.${key} should be a string`);
      assert.notEqual(ui[key].trim(), '', `${locale}.${key} should not be empty`);
      assert.notEqual(ui[key], key, `${locale}.${key} should not fall back to raw key text`);
    }
  }
});

test('city setting success message includes {city} placeholder for substitution', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    const msg = I18N[locale].ui.citySettingSuccess;
    assert.match(msg, /\{city\}/, `${locale}.citySettingSuccess should contain {city} placeholder`);
  }
});

test('city setting tray menu label key exists in all locales', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    const label = I18N[locale].ui.trayWeatherSyncConfig;
    assert.equal(typeof label, 'string');
    assert.notEqual(label.trim(), '');
  }
});

const assert = require('node:assert/strict');
const test = require('node:test');

const { I18N } = require('../src/data/i18n');

const REQUIRED_CITY_SETTING_KEYS = [
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

test('retired city/scale tray menu keys are removed while the unified settings tray entry remains', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    const ui = I18N[locale].ui;
    assert.equal(typeof ui.traySettings, 'string');
    assert.notEqual(ui.traySettings.trim(), '');
    assert.equal('trayWeatherSyncConfig' in ui, false, `${locale}.trayWeatherSyncConfig should be removed`);
    assert.equal('citySettingTitle' in ui, false, `${locale}.citySettingTitle should be removed`);
  }
});

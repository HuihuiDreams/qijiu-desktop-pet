const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('city setting window files exist and use strict local assets', () => {
  const html = readSource('src/city-setting.html');

  assert.match(html, /city-setting\.css/);
  assert.match(html, /citySettingWindow\.js/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.equal(html.includes('unsafe-inline'), false);
});

test('city setting window exposes the expected UI controls', () => {
  const html = readSource('src/city-setting.html');

  for (const id of [
    'city-panel',
    'city-close',
    'city-input',
    'city-confirm',
    'city-current-value',
    'city-status',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }
});

test('city setting window uses data-i18n attributes for translation', () => {
  const html = readSource('src/city-setting.html');

  assert.match(html, /data-i18n="citySettingTitle"/);
  assert.match(html, /data-i18n="citySettingCurrent"/);
  assert.match(html, /data-i18n="citySettingNone"/);
  assert.match(html, /data-i18n="citySettingConfirm"/);
  assert.match(html, /data-i18n-placeholder="citySettingPlaceholder"/);
});

test('city setting reuses the shared panel design class and tokens', () => {
  const html = readSource('src/city-setting.html');
  const indexCss = readSource('src/index.css');
  const css = readSource('src/city-setting.css');

  assert.match(html, /class="[^"]*xianxia-panel[^"]*"/);
  assert.match(indexCss, /\.xianxia-panel/);
  assert.match(indexCss, /var\(--panel-bg\)/);
  assert.match(indexCss, /var\(--panel-border\)/);
  assert.match(indexCss, /var\(--panel-shadow\)/);
  assert.match(css, /\.city-panel/);
});

test('city setting CSS includes input, button, and status feedback styles', () => {
  const css = readSource('src/city-setting.css');

  assert.match(css, /\.city-input/);
  assert.match(css, /\.city-input\s*\{[\s\S]*min-width:\s*0/);
  assert.match(css, /\.city-confirm-button/);
  assert.match(css, /\.city-confirm-button\s*\{[\s\S]*min-width:\s*88px/);
  assert.match(css, /\.city-confirm-button\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.city-status--searching/);
  assert.match(css, /\.city-status--success/);
  assert.match(css, /\.city-status--error/);
});

test('city setting renderer uses safe DOM APIs and no innerHTML', () => {
  const source = readSource('src/citySettingWindow.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.match(source, /textContent/);
  assert.match(source, /electronAPI\.getCitySettings/);
  assert.match(source, /electronAPI\.setCityName/);
  assert.match(source, /electronAPI\.closeCitySettingWindow/);
});

test('city setting renderer handles geocode success and error states', () => {
  const source = readSource('src/citySettingWindow.js');

  assert.match(source, /citySettingSearching/);
  assert.match(source, /citySettingSuccess/);
  assert.match(source, /citySettingError/);
  assert.match(source, /result\?\.success/);
});

test('city setting renderer auto-closes on success after a delay', () => {
  const source = readSource('src/citySettingWindow.js');

  assert.match(source, /setTimeout\(/);
  assert.match(source, /closeCitySettingWindow/);
});

test('city setting renderer supports Enter key to confirm', () => {
  const source = readSource('src/citySettingWindow.js');

  assert.match(source, /keydown/);
  assert.match(source, /e\.key === 'Enter'/);
  assert.match(source, /handleConfirm/);
});

test('city setting renderer initializes locale and loads current city on startup', () => {
  const source = readSource('src/citySettingWindow.js');

  assert.match(source, /getLocale\(\)\.then/);
  assert.match(source, /updateI18nElements/);
  assert.match(source, /loadCurrentCity/);
  assert.match(source, /onLocaleChange/);
});

test('city setting input enforces maxlength in HTML', () => {
  const html = readSource('src/city-setting.html');

  assert.match(html, /maxlength="100"/);
});

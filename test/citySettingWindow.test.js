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

  assert.match(source, /WindowI18n\.init/);
  assert.match(source, /loadCurrentCity/);
  assert.match(source, /inputEl\.focus/);
});

test('city setting input enforces maxlength in HTML', () => {
  const html = readSource('src/city-setting.html');

  assert.match(html, /maxlength="100"/);
});

test('city setting window uses semantic h1 and input accessibility attributes', () => {
  const html = readSource('src/city-setting.html');
  const css = readSource('src/city-setting.css');

  assert.match(html, /<h1 class="settings-calligraphy-title" data-i18n="citySettingTitle">/);
  assert.match(html, /data-i18n-aria-label="citySettingPlaceholder"/);
  assert.match(html, /aria-describedby="city-status"/);
  assert.match(css, /\.city-titlebar h1\s*\{[\s\S]*?font:\s*inherit;/);
});

test('city setting renderer toggles aria-invalid and respects loading state on Escape', async () => {
  const vm = require('node:vm');
  let closeCalled = 0;
  let keydownHandler;
  let resolveSetCity;
  const elements = {
    'city-input': {
      value: 'Beijing',
      attributes: {},
      listeners: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      focus() { this.focused = true; },
    },
    'city-confirm': { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } },
    'city-close': { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } },
    'city-current-value': { textContent: '', removeAttribute() {}, setAttribute() {} },
    'city-status': { textContent: '', className: '', classList: { add() {} } },
  };

  const sandbox = {
    document: {
      getElementById(id) { return elements[id] || null; },
    },
    window: {
      electronAPI: {
        getCitySettings: async () => ({ city: '' }),
        setCityName: () => new Promise((resolve) => { resolveSetCity = resolve; }),
        closeCitySettingWindow: () => { closeCalled++; },
      },
      addEventListener: (type, fn) => { if (type === 'keydown') keydownHandler = fn; },
    },
    t: (key) => key,
    requestAnimationFrame: (cb) => cb(),
    setTimeout: (cb) => cb(),
    console,
  };

  vm.runInNewContext(readSource('src/citySettingWindow.js'), sandbox);

  assert.equal(keydownHandler != null, true);

  // Pressing Escape when not loading closes window
  keydownHandler({ key: 'Escape' });
  assert.equal(closeCalled, 1);

  // Trigger confirm to enter loading state
  elements['city-confirm'].listeners.click();
  assert.equal(elements['city-input'].attributes['aria-invalid'], 'false');

  // Pressing Escape while loading does NOT close window
  keydownHandler({ key: 'Escape' });
  assert.equal(closeCalled, 1, 'closeCitySettingWindow should not be called while loading');

  // Fail the geocoding request
  resolveSetCity({ success: false });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements['city-input'].attributes['aria-invalid'], 'true');
  assert.equal(elements['city-status'].textContent, 'citySettingError');

  // Input event resets aria-invalid to false and clears stale status text
  elements['city-input'].listeners.input();
  assert.equal(elements['city-input'].attributes['aria-invalid'], 'false');
  assert.equal(elements['city-status'].textContent, '');

  // Now that loading is complete, Escape closes window again
  keydownHandler({ key: 'Escape' });
  assert.equal(closeCalled, 2);
});

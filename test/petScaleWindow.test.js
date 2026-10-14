const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('pet scale window files exist and use strict local assets', () => {
  const html = readSource('src/pet-scale.html');

  assert.match(html, /pet-scale\.css/);
  assert.match(html, /petScaleWindow\.js/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.equal(html.includes('unsafe-inline'), false);
});

test('pet scale window exposes the expected UI controls', () => {
  const html = readSource('src/pet-scale.html');

  for (const id of [
    'scale-panel',
    'scale-close',
    'scale-current-value',
    'scale-reset',
    'scale-slider',
    'scale-cancel',
    'scale-confirm',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }
});

test('pet scale window uses data-i18n attributes for translation', () => {
  const html = readSource('src/pet-scale.html');

  assert.match(html, /data-i18n="petScaleTitle"/);
  assert.match(html, /data-i18n="petScaleCurrent"/);
  assert.match(html, /data-i18n="petScaleReset"/);
  assert.match(html, /data-i18n="petScaleCancel"/);
  assert.match(html, /data-i18n="petScaleConfirm"/);
});

test('pet scale window reuses the shared panel design class and tokens', () => {
  const html = readSource('src/pet-scale.html');
  const indexCss = readSource('src/index.css');
  const css = readSource('src/pet-scale.css');

  assert.match(html, /class="[^"]*xianxia-panel[^"]*"/);
  assert.match(indexCss, /\.xianxia-panel/);
  assert.match(indexCss, /var\(--panel-bg\)/);
  assert.match(indexCss, /var\(--panel-border\)/);
  assert.match(indexCss, /var\(--panel-shadow\)/);
  assert.match(css, /\.scale-panel/);
});

test('pet scale CSS includes slider, value, and button styles', () => {
  const css = readSource('src/pet-scale.css');

  assert.match(css, /\.scale-slider/);
  assert.match(css, /\.scale-slider::-webkit-slider-thumb/);
  assert.match(css, /\.scale-current-value/);
  assert.match(css, /\.scale-button--confirm/);
  assert.match(css, /\.scale-button--cancel/);
  assert.match(css, /\.scale-reset-button/);
});

test('pet scale renderer uses safe DOM APIs and no innerHTML', () => {
  const source = readSource('src/petScaleWindow.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.match(source, /textContent/);
  assert.match(source, /electronAPI\?\.getPetScaleSettings/);
  assert.match(source, /electronAPI\?\.previewPetScale/);
  assert.match(source, /electronAPI\?\.confirmPetScale/);
  assert.match(source, /electronAPI\?\.cancelPetScale/);
});

test('pet scale renderer handles preview, confirm, reset, and cancel', () => {
  const source = readSource('src/petScaleWindow.js');

  assert.match(source, /handlePreview/);
  assert.match(source, /handleConfirm/);
  assert.match(source, /handleCancel/);
  assert.match(source, /handleReset/);
  assert.match(source, /addEventListener\('input'/);
});

test('pet scale renderer supports Escape to cancel and Enter to confirm', () => {
  const source = readSource('src/petScaleWindow.js');

  assert.match(source, /keydown/);
  assert.match(source, /e\.key === 'Escape'/);
  assert.match(source, /e\.key === 'Enter'/);
});

test('pet scale main process window module configuration and ordinary window stacking', () => {
  const source = readSource('src/main/windows/PetScaleWindow.js');

  assert.match(source, /const width = 380/);
  assert.match(source, /const height = 240/);
  assert.match(source, /show:\s*false/);
  assert.match(source, /transparent:\s*true/);
  assert.match(source, /frame:\s*false/);
  assert.match(source, /alwaysOnTop:\s*false/);
  assert.match(source, /minimizable:\s*true/);
  assert.match(source, /sandbox:\s*true/);
  assert.equal(source.includes('pulsePetScaleWindowTop'), false);
  assert.equal(source.includes('setVisibleOnAllWorkspaces'), false);
  assert.match(source, /cancelPetScale\(\)/);
  assert.match(source, /if \(!scaleConfirmed\) \{\s*PetScaleService\.cancel\(\);\s*\}/);
});

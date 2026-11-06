'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('SkinSelectorWindow configures top-pulse, focus stealing, and workspace visibility', () => {
  const source = readSource('src/main/windows/SkinSelectorWindow.js');

  assert.match(source, /const SKIN_SELECTOR_ALWAYS_ON_TOP_LEVEL = 'screen-saver'/);
  assert.match(source, /const SKIN_SELECTOR_TOP_PULSE_MS = 180/);
  assert.match(source, /function pulseSkinSelectorWindowTop\(\)/);
  assert.match(source, /setVisibleOnAllWorkspaces\(true, \{\s*visibleOnFullScreen:\s*true\s*\}\)/);
  assert.match(source, /on\('focus',/);
  assert.match(source, /on\('show',/);
  assert.match(source, /on\('restore',/);
  assert.match(source, /process\.platform === 'darwin' && typeof app\?\.focus === 'function'/);
  assert.match(source, /app\.focus\(\{\s*steal:\s*true\s*\}\)/);
});

test('PetScaleWindow configures top-pulse, focus stealing, and workspace visibility', () => {
  const source = readSource('src/main/windows/PetScaleWindow.js');

  assert.match(source, /const PET_SCALE_ALWAYS_ON_TOP_LEVEL = 'screen-saver'/);
  assert.match(source, /const PET_SCALE_TOP_PULSE_MS = 180/);
  assert.match(source, /function pulsePetScaleWindowTop\(\)/);
  assert.match(source, /setVisibleOnAllWorkspaces\(true, \{\s*visibleOnFullScreen:\s*true\s*\}\)/);
  assert.match(source, /on\('focus',/);
  assert.match(source, /on\('show',/);
  assert.match(source, /on\('restore',/);
  assert.match(source, /process\.platform === 'darwin' && typeof app\?\.focus === 'function'/);
  assert.match(source, /app\.focus\(\{\s*steal:\s*true\s*\}\)/);
});

test('StatusWindow configures screen-saver level, focus stealing, and workspace visibility', () => {
  const source = readSource('src/main/windows/StatusWindow.js');

  assert.match(source, /const STATUS_WINDOW_ALWAYS_ON_TOP_LEVEL = 'screen-saver'/);
  assert.match(source, /setAlwaysOnTop\(true, STATUS_WINDOW_ALWAYS_ON_TOP_LEVEL\)/);
  assert.match(source, /setVisibleOnAllWorkspaces\(true, \{\s*visibleOnFullScreen:\s*true\s*\}\)/);
  assert.match(source, /process\.platform === 'darwin' && typeof app\?\.focus === 'function'/);
  assert.match(source, /app\.focus\(\{\s*steal:\s*true\s*\}\)/);
});

test('CitySettingWindow and PomodoroWindow support focus stealing on Darwin', () => {
  const citySource = readSource('src/main/windows/CitySettingWindow.js');
  const pomodoroSource = readSource('src/main/windows/PomodoroWindow.js');

  assert.match(citySource, /process\.platform === 'darwin' && typeof app\?\.focus === 'function'/);
  assert.match(citySource, /app\.focus\(\{\s*steal:\s*true\s*\}\)/);

  assert.match(pomodoroSource, /process\.platform === 'darwin' && typeof app\?\.focus === 'function'/);
  assert.match(pomodoroSource, /app\.focus\(\{\s*steal:\s*true\s*\}\)/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('index.html loads SkinManager before app.js', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');

  const skinManagerIndex = indexHtml.indexOf('systems/SkinManager.js');
  const weatherParticleLayerIndex = indexHtml.indexOf('ui/WeatherParticleLayer.js');
  const appIndex = indexHtml.indexOf('app.js');

  assert.ok(skinManagerIndex >= 0, 'index.html 应加载 SkinManager.js');
  assert.ok(weatherParticleLayerIndex >= 0, 'index.html 应加载 WeatherParticleLayer.js');
  assert.ok(appIndex >= 0, 'index.html 应加载 app.js');
  assert.ok(skinManagerIndex < appIndex, 'SkinManager.js 应在 app.js 之前加载');
  assert.ok(weatherParticleLayerIndex < appIndex, 'WeatherParticleLayer.js 应在 app.js 之前加载');
});

test('app.js wires skin switching through SkinManager and preload IPC', () => {
  const appSource = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

  assert.match(appSource, /const skinManager = new SkinManager\(\)/);
  assert.match(appSource, /window\.electronAPI\.getAvailableSkins\(\)/);
  assert.match(appSource, /window\.electronAPI\.onSwitchSkin/);
  assert.match(appSource, /skinManager\.applySkin/);
  assert.match(appSource, /window\.electronAPI\.setCurrentSkin/);
});

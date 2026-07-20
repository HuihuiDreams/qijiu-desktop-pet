const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('index.html loads SkinManager and SkinSwitchController before app.js', () => {
  const indexHtml = readSource('src/index.html');

  const skinManagerIndex = indexHtml.indexOf('systems/SkinManager.js');
  const skinSwitchControllerIndex = indexHtml.indexOf('systems/SkinSwitchController.js');
  const weatherParticleLayerIndex = indexHtml.indexOf('ui/WeatherParticleLayer.js');
  const appIndex = indexHtml.indexOf('app.js');

  assert.ok(skinManagerIndex >= 0, 'index.html 应加载 SkinManager.js');
  assert.ok(skinSwitchControllerIndex >= 0, 'index.html 应加载 SkinSwitchController.js');
  assert.ok(weatherParticleLayerIndex >= 0, 'index.html 应加载 WeatherParticleLayer.js');
  assert.ok(appIndex >= 0, 'index.html 应加载 app.js');
  assert.ok(skinManagerIndex < appIndex, 'SkinManager.js 应在 app.js 之前加载');
  assert.ok(skinSwitchControllerIndex < appIndex, 'SkinSwitchController.js 应在 app.js 之前加载');
  assert.ok(weatherParticleLayerIndex < appIndex, 'WeatherParticleLayer.js 应在 app.js 之前加载');
});

test('app.js wires SkinManager into a SkinSwitchController instance', () => {
  const appSource = readSource('src/app.js');

  assert.match(appSource, /const skinManager = new SkinManager\(\)/);
  assert.match(appSource, /const skinSwitchController = new SkinSwitchController\(\{/);
  assert.match(appSource, /window\.electronAPI\.onSwitchSkin/);
  assert.match(appSource, /skinSwitchController\.applySkinById\(skinId\)/);
  assert.match(appSource, /skinSwitchController\.refreshAvailableSkins\(\)/);
});

test('SkinSwitchController performs skin switching through SkinManager and preload IPC', () => {
  // 皮肤切换的实际编排逻辑（app.js 拆分 Phase R2）已下沉到 SkinSwitchController.js。
  const controllerSource = readSource('src/systems/SkinSwitchController.js');

  assert.match(controllerSource, /this\.electronAPI\.getAvailableSkins\(\)/);
  assert.match(controllerSource, /this\.skinManager\.applySkin\(nextSkinId, this\.skinTargets\)/);
  assert.match(controllerSource, /this\.electronAPI\.setCurrentSkin\(nextSkinId\)/);
});

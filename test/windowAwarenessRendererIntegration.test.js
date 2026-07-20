const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const configSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'config.js'), 'utf8');
const stageGeometrySource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'systems', 'StageGeometry.js'),
  'utf8',
);

test('index.html loads WindowAwarenessSystem and StageGeometry before app.js', () => {
  const systemIndex = indexSource.indexOf('systems/WindowAwarenessSystem.js');
  const stageGeometryIndex = indexSource.indexOf('systems/StageGeometry.js');
  const appIndex = indexSource.indexOf('app.js');

  assert.equal(systemIndex > -1, true);
  assert.equal(stageGeometryIndex > -1, true);
  assert.equal(systemIndex < appIndex, true);
  assert.equal(stageGeometryIndex < appIndex, true);
});

test('app.js wires WindowAwarenessSystem into MovementSystem without IPC in movement updates', () => {
  assert.ok(appSource.includes('new WindowAwarenessSystem(window.electronAPI'));
  assert.ok(appSource.includes('windowAwarenessSystem.start()'));
  assert.ok(appSource.includes('if (!windowAwarenessSystem.isSurfaceAwarenessEnabled()) return []'));
  assert.ok(appSource.includes('movementSystem.setSurfacePlatforms(getSurfacePlatforms(Date.now()))'));
});

test('app.js delegates screen-info handling to StageGeometry', () => {
  // screenInfo 的构建与归一化（app.js 拆分 Phase R2）已下沉到 StageGeometry.applyScreenInfo，
  // app.js 只保留 onScreenInfo 订阅并委托。
  assert.ok(appSource.includes('window.electronAPI.onScreenInfo((info) => {'));
  assert.ok(appSource.includes('stageGeometry.applyScreenInfo(info)'));
});

test('StageGeometry normalizes taskbarPlatforms/walkAreas from the raw screen-info payload', () => {
  assert.ok(stageGeometrySource.includes(
    'taskbarPlatforms: Array.isArray(info.taskbarPlatforms) ? info.taskbarPlatforms : []',
  ));
  assert.ok(stageGeometrySource.includes('walkAreas: Array.isArray(info.walkAreas) ? info.walkAreas : []'));
});

test('config exposes window awareness defaults', () => {
  assert.ok(configSource.includes('WINDOW_AWARENESS_ENABLED: true'));
  assert.ok(configSource.includes('WINDOW_AWARENESS_PLATFORM_TTL_MS: 22000'));
  assert.ok(configSource.includes('WINDOW_AWARENESS_PLATFORM_CHANCE: 0.7'));
  assert.ok(configSource.includes('TASKBAR_PLATFORM_WEIGHT: 120'));
});

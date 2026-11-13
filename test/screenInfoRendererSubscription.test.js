const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

test('renderer subscribes to screen-info before asynchronous startup work', () => {
  const localeAwaitIndex = appSource.indexOf('await window.electronAPI.getLocale()');
  const subscriptionIndex = appSource.indexOf('window.electronAPI.onScreenInfo(');

  assert.ok(localeAwaitIndex >= 0, 'the startup locale read must remain asynchronous');
  assert.ok(subscriptionIndex >= 0, 'the renderer must subscribe to screen-info');
  assert.ok(
    subscriptionIndex < localeAwaitIndex,
    'the first screen-info sent right after did-finish-load must not be lost during renderer startup',
  );
  assert.equal(
    appSource.split('window.electronAPI.onScreenInfo(').length - 1,
    1,
    'screen-info must be subscribed exactly once',
  );
});

test('renderer replays the cached screen-info once StageGeometry and MovementSystem exist', () => {
  const movementSystemIndex = appSource.indexOf('const movementSystem = new MovementSystem(');
  const replayIndex = appSource.indexOf('if (latestScreenInfo) applyScreenInfo(latestScreenInfo);');
  const handoverIndex = appSource.indexOf('applyScreenInfo = (info) => stageGeometry.applyScreenInfo(info);');

  assert.ok(movementSystemIndex >= 0, 'MovementSystem must still be created in app.js');
  assert.ok(handoverIndex > movementSystemIndex, 'the sink must be installed after MovementSystem exists');
  assert.ok(replayIndex > handoverIndex, 'the cached value must be replayed after the sink is installed');
});

test('early screen-info is cached, replayed once, and later updates apply directly', () => {
  const start = appSource.indexOf('let latestScreenInfo = null;');
  const end = appSource.indexOf('// === 初始化 i18n');
  const subscribeSnippet = appSource.slice(start, end);
  const replayLine = appSource.slice(
    appSource.indexOf('applyScreenInfo = (info) =>'),
    appSource.indexOf('windowAwarenessSystem.start();'),
  );

  const applied = [];
  let listener = null;
  const stageGeometry = { applyScreenInfo: (info) => applied.push(info) };
  const run = new Function(
    'window',
    'stageGeometry',
    `${subscribeSnippet}
     return {
       ready() { ${replayLine} },
     };`,
  );
  const harness = run({ electronAPI: { onScreenInfo: (callback) => { listener = callback; } } }, stageGeometry);

  listener({ width: 1, height: 1 });
  listener({ width: 2, height: 2 });
  assert.deepEqual(applied, [], 'nothing is applied before the renderer systems are ready');

  harness.ready();
  assert.deepEqual(applied, [{ width: 2, height: 2 }], 'only the latest early value is replayed');

  listener({ width: 3, height: 3 });
  assert.deepEqual(applied, [{ width: 2, height: 2 }, { width: 3, height: 3 }]);
});

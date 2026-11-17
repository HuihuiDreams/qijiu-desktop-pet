const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// 去掉行注释，避免注释里提到变量名被当成提前引用。
const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');

test('interactionOverlayActive is declared before any code that can read it', () => {
  // clearInteractionOverlay 会被屏保 onStart 调用；screensaverSystem.init() 注册 IPC 订阅后
  // 还要 await 精灵图预加载，期间到达的 screensaver-start 若碰上 let 暂时性死区会抛 ReferenceError。
  const declaration = 'let interactionOverlayActive = false;';
  const declarationIndex = appSource.indexOf(declaration);
  assert.ok(declarationIndex >= 0, 'app.js must declare interactionOverlayActive');
  assert.equal(appSource.split(declaration).length - 1, 1, 'the flag must be declared exactly once');

  const firstUseIndex = appSource.indexOf('interactionOverlayActive');
  assert.equal(firstUseIndex, declarationIndex + 'let '.length, 'no reference may precede the declaration');

  const clearFnIndex = appSource.indexOf('function clearInteractionOverlay()');
  const screensaverInitIndex = appSource.indexOf('screensaverSystem.init();');
  assert.ok(clearFnIndex > declarationIndex, 'clearInteractionOverlay must follow the declaration');
  assert.ok(screensaverInitIndex > declarationIndex, 'screensaver IPC subscriptions must follow the declaration');
});

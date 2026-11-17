const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SUB_WINDOW_SCRIPTS = [
  'src/statusWindow.js',
  'src/skinSelectorWindow.js',
  'src/update-progress.js',
  'src/pomodoroWindow.js',
];

test('sub-window scripts guard top-level preload subscriptions with optional chaining', () => {
  // 顶层裸调 preload API 一旦抛错，其后的 i18n、tooltip 与按钮绑定全部不会执行，整个窗口白屏。
  for (const relativePath of SUB_WINDOW_SCRIPTS) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    const bareCalls = source.match(/^window\.\w+API\.\w+\(/gm) || [];
    assert.deepEqual(bareCalls, [], `${relativePath} must use window.xxxAPI?.method?.(...) at top level`);
  }
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

test('skin selector displays a failed confirmation without closing or changing selection', async () => {
  const elements = new Map();
  const context = vm.createContext({
    document: {
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, { textContent: '', addEventListener() {}, querySelectorAll: () => [] });
        return elements.get(id);
      },
    },
    window: {
      skinSelectorAPI: {
        confirmSkin: async () => ({ success: false, error: { code: 'LOAD_FAILED' } }),
        onData() {},
      },
      addEventListener() {},
    },
    WindowI18n: { init() {} },
    requestAnimationFrame() {},
    t: (key) => key,
    console,
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/skinSelectorWindow.js'), 'utf8'), context);

  await vm.runInContext('confirmSelection()', context);

  assert.equal(elements.get('skin-selector-status').textContent, 'skinSelectorError');
});

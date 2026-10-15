const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadScaleWindow() {
  const calls = [];
  const elements = new Map();
  let keydown;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'petScaleWindow.js'), 'utf8'), {
    document: {
      getElementById(id) {
        const element = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
        elements.set(id, element);
        return element;
      },
    },
    window: {
      electronAPI: {
        previewPetScale: (percent) => calls.push(['preview', percent]),
        confirmPetScale: () => calls.push(['confirm']),
        cancelPetScale: () => calls.push(['cancel']),
      },
      addEventListener: (type, handler) => { if (type === 'keydown') keydown = handler; },
    },
  });
  return {
    calls,
    press(key, buttonId = null) {
      const button = elements.get(buttonId);
      const event = {
        key,
        target: { closest: (selector) => selector === 'button' ? button : null },
        preventDefault() { this.defaultPrevented = true; },
      };
      keydown(event);
      // Enter activates the focused native button unless keydown prevented it.
      if (key === 'Enter' && button && !event.defaultPrevented) button.listeners.click();
    },
  };
}

for (const [button, expected] of [
  ['scale-cancel', [['cancel']]],
  ['scale-close', [['cancel']]],
  ['scale-reset', [['preview', 100]]],
  ['scale-confirm', [['confirm']]],
]) {
  test(`Enter on ${button} performs only that button's native action`, () => {
    const window = loadScaleWindow();
    window.press('Enter', button);
    assert.deepEqual(window.calls, expected);
  });
}

test('Enter outside buttons confirms and Escape on a button cancels', () => {
  const window = loadScaleWindow();
  window.press('Enter');
  window.press('Escape', 'scale-confirm');
  assert.deepEqual(window.calls, [['confirm'], ['cancel']]);
});

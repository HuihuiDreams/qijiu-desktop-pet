const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadScaleWindow(settings = null) {
  const calls = [];
  const elements = new Map();
  let keydown;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'petScaleWindow.js'), 'utf8'), {
    requestAnimationFrame: (cb) => cb(),
    document: {
      getElementById(id) {
        const element = {
          listeners: {},
          attributes: {},
          focused: false,
          addEventListener(type, handler) { this.listeners[type] = handler; },
          setAttribute(k, v) { this.attributes[k] = String(v); },
          getAttribute(k) { return this.attributes[k]; },
          focus() { this.focused = true; },
        };
        elements.set(id, element);
        return element;
      },
    },
    window: {
      electronAPI: {
        getPetScaleSettings: settings ? async () => settings : undefined,
        previewPetScale: (percent) => calls.push(['preview', percent]),
        confirmPetScale: () => calls.push(['confirm']),
        cancelPetScale: () => calls.push(['cancel']),
      },
      addEventListener: (type, handler) => { if (type === 'keydown') keydown = handler; },
    },
  });
  return {
    calls,
    elements,
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

test('scale-reset uses defaultPercent returned from getPetScaleSettings', async () => {
  const window = loadScaleWindow({
    currentPercent: 130,
    defaultPercent: 95,
    minPercent: 50,
    maxPercent: 150,
    stepPercent: 5,
  });
  await new Promise((resolve) => setImmediate(resolve));
  window.elements.get('scale-reset').listeners.click();
  assert.deepEqual(window.calls, [['preview', 95]]);
  assert.equal(window.elements.get('scale-current-value').textContent, '95%');
});

test('scale slider receives initial focus and synchronizes aria-valuetext', async () => {
  const window = loadScaleWindow({
    currentPercent: 120,
    defaultPercent: 100,
    minPercent: 50,
    maxPercent: 150,
    stepPercent: 5,
  });

  const slider = window.elements.get('scale-slider');
  assert.equal(slider.focused, true, 'slider should receive initial focus');

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(slider.attributes['aria-valuetext'], '120%');

  // Preview via slider input
  slider.listeners.input({ target: { value: '80' } });
  assert.deepEqual(window.calls, [['preview', 80]]);
  assert.equal(slider.attributes['aria-valuetext'], '80%');
  assert.equal(window.elements.get('scale-current-value').textContent, '80%');
});

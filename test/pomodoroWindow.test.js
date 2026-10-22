const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('pomodoro window files exist and use strict local assets', () => {
  const html = readSource('src/pomodoro.html');

  assert.match(html, /pomodoro\.css/);
  assert.match(html, /pomodoroWindow\.js/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.equal(html.includes('unsafe-inline'), false);
});

test('pomodoro window exposes the expected UI states and controls', () => {
  const html = readSource('src/pomodoro.html');

  for (const id of [
    'pomodoro-panel',
    'pomodoro-pin',
    'pomodoro-close',
    'pomodoro-setup',
    'pomodoro-running',
    'pomodoro-completed',
    'pomodoro-minutes',
    'pomodoro-start',
    'pomodoro-stop',
    'pomodoro-finish',
    'pomodoro-running-cultivate',
    'pomodoro-complete-kiss',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }

  assert.equal(html.includes('id="pomodoro-running-yueqi"'), false);
  assert.equal(html.includes('id="pomodoro-running-shenjiu"'), false);
  assert.equal(html.includes('id="pomodoro-complete-yueqi"'), false);
  assert.equal(html.includes('id="pomodoro-complete-shenjiu"'), false);
  assert.equal(html.includes('<figcaption'), false);
});

test('pomodoro reuses the shared panel design class and tokens', () => {
  const html = readSource('src/pomodoro.html');
  const indexCss = readSource('src/index.css');
  const css = readSource('src/pomodoro.css');

  assert.match(html, /class="[^"]*xianxia-panel[^"]*"/);
  assert.match(indexCss, /\.xianxia-panel/);
  assert.match(indexCss, /var\(--panel-bg\)/);
  assert.match(indexCss, /var\(--panel-border\)/);
  assert.match(indexCss, /var\(--panel-shadow\)/);
  assert.match(css, /\.pomodoro-panel/);
});

test('pomodoro CSS keeps the English title compact in the small window', () => {
  const css = readSource('src/pomodoro.css');

  assert.match(css, /html\[lang="en"\] \.pomodoro-titlebar>span/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /text-overflow:\s*ellipsis/);
});

test('pomodoro renderer uses safe DOM APIs for dynamic text and images', () => {
  const source = readSource('src/pomodoroWindow.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.match(source, /textContent/);
  assert.match(source, /setPetImage/);
  assert.match(source, /pet-asset:\/\/skin\/default\/cultivate\.webp/);
  assert.match(source, /pet-asset:\/\/skin\/default\/kiss\.webp/);
});

test('pomodoro pin button updates optimistically while IPC confirms the window level', () => {
  const source = readSource('src/pomodoroWindow.js');

  assert.match(source, /const nextIsAlwaysOnTop = !currentState\.isAlwaysOnTop/);
  assert.match(source, /renderState\(\{ isAlwaysOnTop: nextIsAlwaysOnTop \}\)/);
  assert.match(source, /pinBtn\.disabled = true/);
  assert.match(source, /setPomodoroAlwaysOnTop\(nextIsAlwaysOnTop\)/);
  assert.match(source, /function isIpcFailure\(result\)/);
  assert.match(source, /if \(isIpcFailure\(result\)\)/);
  assert.match(source, /renderState\(\{ isAlwaysOnTop: !nextIsAlwaysOnTop \}\)/);
  assert.match(source, /pinBtn\.disabled = false/);
});

test('pomodoro tooltip HTML structure uses Popover API and removes static title attributes', () => {
  const html = readSource('src/pomodoro.html');

  // #pomodoro-tooltip has popover="manual" and role="tooltip"
  assert.match(html, /id="pomodoro-tooltip"[^>]*popover="manual"/);
  assert.match(html, /id="pomodoro-tooltip"[^>]*role="tooltip"/);

  // The 4 action buttons have no static title attributes
  for (const buttonId of [
    'pomodoro-pin',
    'pomodoro-close',
    'pomodoro-decrease',
    'pomodoro-increase',
  ]) {
    const buttonTagMatch = html.match(new RegExp(`<button[^>]*id="${buttonId}"[^>]*>`));
    assert.ok(buttonTagMatch, `${buttonId} button tag should exist`);
    const buttonTag = buttonTagMatch[0];
    assert.equal(/\stitle="/.test(buttonTag), false, `${buttonId} must not contain static title attribute`);
    assert.match(buttonTag, /data-custom-tooltip/, `${buttonId} should declare data-custom-tooltip`);
  }
});

test('pomodoro tooltip CSS implements Anchor Positioning and discrete entry/exit transitions', () => {
  const css = readSource('src/pomodoro.css');

  assert.match(css, /position:\s*fixed;/);
  assert.match(css, /position-anchor:\s*--pomodoro-tooltip-anchor;/);
  assert.match(css, /position-area:\s*block-end;/);
  assert.match(css, /position-try-fallbacks:\s*flip-block;/);
  assert.match(css, /inset:\s*auto;/);
  assert.match(css, /margin:\s*6px\s*0;/);
  assert.match(css, /\.pomodoro-tooltip:popover-open/);
  assert.match(css, /@starting-style\s*\{/);
  assert.match(css, /transition-property:\s*[^;]*opacity[^;]*transform[^;]*display[^;]*overlay/);
  assert.match(css, /transition-behavior:\s*allow-discrete;/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
});

test('pomodoro renderer eliminates getBoundingClientRect and offsetHeight layout thrashing', () => {
  const source = readSource('src/pomodoroWindow.js');

  assert.equal(source.includes('getBoundingClientRect'), false, 'must not call getBoundingClientRect');
  assert.equal(source.includes('offsetHeight'), false, 'must not read offsetHeight');
  assert.equal(source.includes('isUpperHalf'), false, 'must not compute isUpperHalf');
  assert.match(source, /--pomodoro-tooltip-anchor/);
  assert.match(source, /showPopover/);
  assert.match(source, /hidePopover/);
});

test('windowI18n syncs dataset.tooltip and omits native title for custom tooltips', () => {
  const { WindowI18n } = require('../src/utils/windowI18n.js');
  const elements = [
    {
      dataset: { i18nTitle: 'testCustom', customTooltip: 'true' },
      attributes: { 'data-custom-tooltip': '' },
      hasAttribute(name) { return name in this.attributes; },
      setAttribute(name, val) { this.attributes[name] = val; },
      removeAttribute(name) { delete this.attributes[name]; delete this[name]; },
    },
    {
      dataset: { i18nTitle: 'testStandard' },
      attributes: {},
      hasAttribute(name) { return name in this.attributes; },
      setAttribute(name, val) { this.attributes[name] = val; },
      removeAttribute(name) { delete this.attributes[name]; delete this[name]; },
    },
  ];

  const originalWindow = global.window;
  const originalDoc = global.document;
  const originalI18N = global.I18N;

  try {
    global.I18N = {
      zh: {
        ui: {
          testCustom: 'translated_testCustom',
          testStandard: 'translated_testStandard',
        },
      },
    };
    global.window = {};
    global.document = {
      querySelectorAll(selector) {
        if (selector === '[data-i18n-title]') return elements;
        return [];
      },
    };

    WindowI18n.init();
    global.window.updateI18nElements();

    // Custom tooltip element
    assert.equal(elements[0].dataset.tooltip, 'translated_testCustom');
    assert.equal(elements[0].attributes['aria-label'], 'translated_testCustom');
    assert.equal(elements[0].title, undefined, 'Custom tooltip element must not have title attribute');

    // Standard tooltip element
    assert.equal(elements[1].dataset.tooltip, 'translated_testStandard');
    assert.equal(elements[1].attributes['aria-label'], 'translated_testStandard');
    assert.equal(elements[1].title, 'translated_testStandard', 'Standard element must retain title');
  } finally {
    global.window = originalWindow;
    global.document = originalDoc;
    global.I18N = originalI18N;
  }
});

test('pomodoro tooltip interactions: anchorName, Popover API show/hide, and Escape dismissal', async () => {
  const vm = require('node:vm');
  const elements = new Map();

  function makeEl(id, cls = '') {
    const listeners = {};
    return {
      id,
      className: cls,
      style: {},
      dataset: {},
      attributes: {},
      getAttribute(name) { return this.attributes[name] ?? this.dataset[name.replace('data-', '')]; },
      setAttribute(name, val) { this.attributes[name] = val; this[name] = val; },
      removeAttribute(name) { delete this.attributes[name]; delete this[name]; },
      addEventListener(evt, fn) { listeners[evt] = fn; },
      listeners,
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    };
  }

  const tooltip = makeEl('pomodoro-tooltip', 'pomodoro-tooltip');
  tooltip.popoverOpen = false;
  tooltip.showPopover = function() { tooltip.popoverOpen = true; };
  tooltip.hidePopover = function() { tooltip.popoverOpen = false; };
  tooltip.matches = function(sel) { return sel === ':popover-open' ? tooltip.popoverOpen : false; };

  const pin = makeEl('pomodoro-pin', 'pomodoro-icon-button');
  pin.dataset.tooltip = '取消置顶';
  pin.setAttribute('data-custom-tooltip', '');

  const close = makeEl('pomodoro-close', 'pomodoro-icon-button');
  close.dataset.tooltip = '关闭';
  close.setAttribute('data-custom-tooltip', '');

  const dec = makeEl('pomodoro-decrease', 'pomodoro-step-button');
  dec.dataset.tooltip = '减少';
  dec.setAttribute('data-custom-tooltip', '');

  const inc = makeEl('pomodoro-increase', 'pomodoro-step-button');
  inc.dataset.tooltip = '增加';
  inc.setAttribute('data-custom-tooltip', '');

  const allBtns = [pin, close, dec, inc];
  let keydownListener;

  const doc = {
    getElementById(id) {
      if (id === 'pomodoro-tooltip') return tooltip;
      if (id === 'pomodoro-pin') return pin;
      if (id === 'pomodoro-close') return close;
      if (id === 'pomodoro-decrease') return dec;
      if (id === 'pomodoro-increase') return inc;
      return makeEl(id);
    },
    querySelector() { return makeEl('mock-query'); },
    querySelectorAll(sel) {
      if (sel.includes('pomodoro-icon-button')) return allBtns;
      return [];
    },
    addEventListener(evt, fn) {
      if (evt === 'keydown') keydownListener = fn;
    },
  };

  const win = {
    electronAPI: {
      onPomodoroState() {},
    },
    AudioContext: function() {
      return {
        createGain() { return { gain: { setValueAtTime() {} }, connect() {} }; },
        currentTime: 0,
        close() {},
        resume() { return Promise.resolve(); },
      };
    },
  };

  const context = {
    document: doc,
    window: win,
    WindowI18n: { init() {} },
    setTimeout,
    clearTimeout,
    console,
  };

  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/pomodoroWindow.js'), 'utf8'), context);

  // 1. Mouseenter sets anchorName and opens popover with correct content
  pin.listeners.mouseenter();
  assert.equal(pin.style.anchorName, '--pomodoro-tooltip-anchor');
  assert.equal(tooltip.popoverOpen, true);
  assert.equal(tooltip.textContent, '取消置顶');

  // 2. Escape closes tooltip and removes anchorName
  keydownListener({ key: 'Escape' });
  assert.equal(tooltip.popoverOpen, false);
  assert.equal(pin.style.anchorName, '');

  // 3. Focusin shows tooltip on stepper button
  dec.listeners.focusin();
  assert.equal(dec.style.anchorName, '--pomodoro-tooltip-anchor');
  assert.equal(tooltip.popoverOpen, true);
  assert.equal(tooltip.textContent, '减少');

  // 4. Focusout hides tooltip immediately
  dec.listeners.focusout();
  assert.equal(tooltip.popoverOpen, false);
  assert.equal(dec.style.anchorName, '');

  // 5. Hovering button, then moving pointer into tooltip keeps it open (WCAG 1.4.13 Hoverable)
  inc.listeners.mouseenter();
  assert.equal(tooltip.popoverOpen, true);
  inc.listeners.mouseleave(); // triggers 100ms hide timer
  tooltip.listeners.mouseenter(); // cancels hide timer
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(tooltip.popoverOpen, true, 'Tooltip should stay open while mouse is inside it');

  // Leaving tooltip hides it
  tooltip.listeners.mouseleave();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(tooltip.popoverOpen, false);
});


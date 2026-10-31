const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function createMockSkinSelectorEnvironment({ api = {}, deferRaf = false } = {}) {
  const elements = new Map();
  let keydownHandler = null;
  let onDataHandler = null;
  let activeElement = null;
  const queuedRaf = [];

  function createEl(tagName) {
    const classListSet = new Set();
    const attributes = {};
    const children = [];
    const listeners = {};
    let _className = '';
    const el = {
      tagName,
      dataset: {},
      disabled: false,
      attributes,
      children,
      get className() { return _className; },
      set className(val) {
        _className = val || '';
        classListSet.clear();
        _className.split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
      },
      classList: {
        add: (...c) => {
          c.forEach(name => classListSet.add(name));
          _className = Array.from(classListSet).join(' ');
        },
        remove: (...c) => {
          c.forEach(name => classListSet.delete(name));
          _className = Array.from(classListSet).join(' ');
        },
        contains: (c) => classListSet.has(c),
      },
      setAttribute(k, v) { attributes[k] = String(v); },
      getAttribute(k) { return attributes[k]; },
      addEventListener(type, fn) { listeners[type] = fn; },
      click() { listeners['click']?.(); },
      focus() {
        activeElement = el;
      },
      closest(selector) {
        if (selector === '.skin-card') {
          return classListSet.has('skin-card') ? el : null;
        }
        return null;
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      append(...items) {
        children.push(...items);
      },
      replaceChildren(...items) {
        children.length = 0;
        children.push(...items);
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        const result = [];
        function walk(node) {
          for (const child of node.children || []) {
            if (selector.startsWith('.')) {
              const className = selector.slice(1).split('[')[0];
              if (child.classList?.contains?.(className)) {
                if (selector.includes('[aria-pressed="true"]')) {
                  if (child.attributes['aria-pressed'] === 'true') result.push(child);
                } else if (selector.includes('[data-skin-id="')) {
                  const idMatch = selector.match(/\[data-skin-id="([^"]+)"\]/);
                  if (idMatch && child.dataset?.skinId === idMatch[1]) result.push(child);
                } else {
                  result.push(child);
                }
              }
            }
            walk(child);
          }
        }
        walk(el);
        return result;
      },
    };
    return el;
  }

  const galleryEl = createEl('div');
  const closeBtn = createEl('button');
  const confirmBtn = createEl('button');
  const cancelBtn = createEl('button');
  const statusEl = createEl('div');

  elements.set('skin-gallery', galleryEl);
  elements.set('skin-selector-close', closeBtn);
  elements.set('skin-selector-confirm', confirmBtn);
  elements.set('skin-selector-cancel', cancelBtn);
  elements.set('skin-selector-status', statusEl);

  const context = vm.createContext({
    document: {
      get activeElement() { return activeElement; },
      getElementById: (id) => elements.get(id),
      createElement: (tag) => createEl(tag),
    },
    window: {
      skinSelectorAPI: {
        confirmSkin: async () => ({ success: true }),
        previewSkin: async () => ({ success: true }),
        cancelSkin: async () => ({ success: true }),
        onData: (cb) => { onDataHandler = cb; },
        ...api,
      },
      addEventListener: (type, fn) => {
        if (type === 'keydown') keydownHandler = fn;
      },
    },
    WindowI18n: { init() {} },
    requestAnimationFrame: (cb) => {
      if (deferRaf) {
        queuedRaf.push(cb);
      } else {
        cb();
      }
    },
    t: (key) => key,
    console,
  });

  vm.runInContext(fs.readFileSync(require.resolve('../src/skinSelectorWindow.js'), 'utf8'), context);

  return {
    elements,
    galleryEl,
    confirmBtn,
    closeBtn,
    getActiveElement: () => activeElement,
    setActiveElement: (el) => { activeElement = el; },
    flushRaf: () => {
      while (queuedRaf.length > 0) {
        queuedRaf.shift()();
      }
    },
    sendData: (items, options) => onDataHandler?.(items, options),
    pressKey: (key) => {
      let prevented = false;
      keydownHandler?.({ key, preventDefault() { prevented = true; } });
      return { prevented };
    },
    context,
  };
}

test('skin selector displays a failed confirmation without closing or changing selection', async () => {
  const env = createMockSkinSelectorEnvironment({
    api: {
      confirmSkin: async () => ({ success: false, error: { code: 'LOAD_FAILED' } }),
    },
  });

  await vm.runInContext('confirmSelection()', env.context);
  assert.equal(env.elements.get('skin-selector-status').textContent, 'skinSelectorError');
});

test('skin selector initial focus lands on current pressed skin card and restores on language rebuild', () => {
  const env = createMockSkinSelectorEnvironment();
  const items = [
    { id: 'skin-1', skinLabel: 'Skin One', isCurrent: false, previewUrl: '' },
    { id: 'skin-2', skinLabel: 'Skin Two', isCurrent: true, previewUrl: '' },
    { id: 'skin-3', skinLabel: 'Skin Three', isCurrent: false, previewUrl: '' },
  ];

  env.sendData(items);
  const activeEl = env.getActiveElement();
  assert.ok(activeEl, 'An element should be focused after initial data');
  assert.equal(activeEl.dataset.skinId, 'skin-2', 'Initial focus should be on skin-2 (isCurrent / aria-pressed=true)');

  // Move focus to skin-3
  const card3 = env.galleryEl.querySelectorAll('.skin-card')[2];
  env.setActiveElement(card3);

  // Trigger locale rebuild
  env.sendData(items, { resetSelection: false });
  const restoredEl = env.getActiveElement();
  assert.equal(restoredEl.dataset.skinId, 'skin-3', 'Rebuild should restore focus to the previously focused card skinId');
});

test('skin selector arrow keys and Home/End navigate cards circularly only when focused on a card', () => {
  const env = createMockSkinSelectorEnvironment();
  const items = [
    { id: 'skin-1', skinLabel: 'Skin One', isCurrent: true, previewUrl: '' },
    { id: 'skin-2', skinLabel: 'Skin Two', isCurrent: false, previewUrl: '' },
    { id: 'skin-3', skinLabel: 'Skin Three', isCurrent: false, previewUrl: '' },
  ];
  env.sendData(items);

  const cards = env.galleryEl.querySelectorAll('.skin-card');
  assert.equal(cards.length, 3);

  // Focus is initially on card 0 ('skin-1')
  env.setActiveElement(cards[0]);

  // ArrowRight -> card 1
  let res = env.pressKey('ArrowRight');
  assert.equal(res.prevented, true);
  assert.equal(env.getActiveElement(), cards[1]);

  // ArrowRight -> card 2
  env.pressKey('ArrowRight');
  assert.equal(env.getActiveElement(), cards[2]);

  // ArrowRight wraps to card 0
  env.pressKey('ArrowRight');
  assert.equal(env.getActiveElement(), cards[0]);

  // ArrowLeft wraps to card 2
  env.pressKey('ArrowLeft');
  assert.equal(env.getActiveElement(), cards[2]);

  // Home -> card 0
  env.pressKey('Home');
  assert.equal(env.getActiveElement(), cards[0]);

  // End -> card 2
  env.pressKey('End');
  assert.equal(env.getActiveElement(), cards[2]);

  // Arrow keys outside cards (e.g. on confirmBtn) do not navigate cards and do not prevent default
  env.setActiveElement(env.confirmBtn);
  res = env.pressKey('ArrowRight');
  assert.equal(res.prevented, false);
  assert.equal(env.getActiveElement(), env.confirmBtn);
});

test('setLoading toggles .skin-card--loading, disables confirmBtn, and restores focus to target card', async () => {
  let resolvePreview;
  const env = createMockSkinSelectorEnvironment({
    api: {
      previewSkin: () => new Promise((resolve) => { resolvePreview = resolve; }),
    },
  });

  const items = [
    { id: 'skin-1', skinLabel: 'Skin One', isCurrent: true, previewUrl: '' },
    { id: 'skin-2', skinLabel: 'Skin Two', isCurrent: false, previewUrl: '' },
  ];
  env.sendData(items);

  const cards = env.galleryEl.querySelectorAll('.skin-card');

  // Preview skin-2
  cards[1].click();

  // During loading
  assert.equal(env.confirmBtn.disabled, true);
  assert.equal(cards[0].disabled, true);
  assert.equal(cards[1].disabled, true);
  assert.equal(cards[1].classList.contains('skin-card--loading'), true);
  assert.equal(cards[0].classList.contains('skin-card--loading'), false);

  // Resolve preview
  resolvePreview({ success: true });
  await new Promise((resolve) => setImmediate(resolve));

  // After loading
  assert.equal(env.confirmBtn.disabled, false);
  assert.equal(cards[0].disabled, false);
  assert.equal(cards[1].disabled, false);
  assert.equal(cards[1].classList.contains('skin-card--loading'), false);
  assert.equal(env.getActiveElement(), cards[1], 'Focus must return to target card after loading settles');
});

test('subsequent requestAnimationFrame does not steal focus when card is already focused', () => {
  const env = createMockSkinSelectorEnvironment({ deferRaf: true });
  const items = [
    { id: 'skin-1', skinLabel: 'Skin One', isCurrent: true, previewUrl: '' },
    { id: 'skin-2', skinLabel: 'Skin Two', isCurrent: false, previewUrl: '' },
  ];

  // Data arrives and focuses skin-1 before the first animation frame fires
  env.sendData(items);
  const card1 = env.galleryEl.querySelectorAll('.skin-card')[0];
  assert.equal(env.getActiveElement(), card1);

  // Now the browser fires requestAnimationFrame
  env.flushRaf();
  assert.equal(env.getActiveElement(), card1, 'Focus must remain on the skin card, not closeBtn');
});

test('empty skin list handles isFirstDataReceived and focuses closeBtn as fallback', () => {
  const env = createMockSkinSelectorEnvironment({ deferRaf: true });

  env.sendData([]);
  assert.equal(env.galleryEl.querySelector('.skin-gallery-empty') != null, true);
  assert.equal(env.getActiveElement(), env.closeBtn, 'Focus must land on closeBtn when gallery is empty');

  // Flushing RAF also keeps focus on closeBtn
  env.flushRaf();
  assert.equal(env.getActiveElement(), env.closeBtn);
});

test('arrow keys and Escape are guarded during preview loading', async () => {
  let resolvePreview;
  let cancelCalled = 0;
  const env = createMockSkinSelectorEnvironment({
    api: {
      previewSkin: () => new Promise((resolve) => { resolvePreview = resolve; }),
      cancelSkin: async () => { cancelCalled++; },
    },
  });

  const items = [
    { id: 'skin-1', skinLabel: 'Skin One', isCurrent: true, previewUrl: '' },
    { id: 'skin-2', skinLabel: 'Skin Two', isCurrent: false, previewUrl: '' },
  ];
  env.sendData(items);

  const cards = env.galleryEl.querySelectorAll('.skin-card');
  cards[1].click();

  // Pressing ArrowRight while preview is loading is ignored
  const arrowRes = env.pressKey('ArrowRight');
  assert.equal(arrowRes.prevented, false);

  // Pressing Escape while preview is loading does not call cancelSkin
  const escRes = env.pressKey('Escape');
  assert.equal(cancelCalled, 0);

  // Settle preview
  resolvePreview({ success: true });
  await new Promise((resolve) => setImmediate(resolve));

  // Escape after loading calls cancelSkin with preventDefault
  const settleEscRes = env.pressKey('Escape');
  assert.equal(settleEscRes.prevented, true);
  assert.equal(cancelCalled, 1);
});

test('renderGallery preserves disabled and loading state when rebuilt during an in-flight preview', async () => {
  let resolvePreview;
  const env = createMockSkinSelectorEnvironment({
    api: {
      previewSkin: () => new Promise((resolve) => { resolvePreview = resolve; }),
    },
  });

  const items = [
    { id: 'skin-1', skinLabel: 'Skin One', isCurrent: true, previewUrl: '' },
    { id: 'skin-2', skinLabel: 'Skin Two', isCurrent: false, previewUrl: '' },
  ];
  env.sendData(items);

  const cards = env.galleryEl.querySelectorAll('.skin-card');
  cards[1].click();

  // While in-flight, simulate a locale change trigger
  env.sendData(items, { resetSelection: false });

  const newCards = env.galleryEl.querySelectorAll('.skin-card');
  assert.equal(newCards[0].disabled, true);
  assert.equal(newCards[1].disabled, true);
  assert.equal(newCards[1].classList.contains('skin-card--loading'), true);

  resolvePreview({ success: true });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(newCards[0].disabled, false);
  assert.equal(newCards[1].disabled, false);
  assert.equal(newCards[1].classList.contains('skin-card--loading'), false);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { StatusBar } = require('../src/ui/StatusBar');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function createMockElement(tagName) {
  const attributes = {};
  const classNames = new Set();
  const childNodes = [];
  const style = {};
  return {
    tagName,
    id: '',
    className: '',
    src: '',
    alt: '',
    style,
    dataset: {},
    get children() {
      // Emulate HTMLCollection: iterable with length and indexed access, but NO Array methods like .filter
      const col = {
        length: childNodes.length,
        item(i) {
          return childNodes[i] || null;
        },
        [Symbol.iterator]() {
          return childNodes[Symbol.iterator]();
        },
      };
      for (let i = 0; i < childNodes.length; i++) {
        col[i] = childNodes[i];
      }
      return col;
    },
    attributes,
    textContent: '',
    classList: {
      add: (...c) => c.forEach((name) => classNames.add(name)),
      remove: (...c) => c.forEach((name) => classNames.delete(name)),
      contains: (c) => classNames.has(c),
    },
    setAttribute(name, val) {
      attributes[name] = String(val);
    },
    getAttribute(name) {
      return attributes[name];
    },
    appendChild(child) {
      childNodes.push(child);
      return child;
    },
    append(...items) {
      childNodes.push(...items);
    },
    replaceChildren(...items) {
      childNodes.length = 0;
      childNodes.push(...items);
    },
    querySelector(selector) {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (classNames.has(cls) || String(this.className || '').split(/\s+/).includes(cls)) return this;
        for (const child of childNodes) {
          const res = child.querySelector(selector);
          if (res) return res;
        }
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

test('StatusBar.update skips IPC updateStatusWindow when snapshot is unchanged', () => {
  let showCallCount = 0;
  let updateCallCount = 0;
  let closedCallback = null;

  global.window = {
    electronAPI: {
      onStatusWindowClosed(cb) {
        closedCallback = cb;
      },
      showStatusWindow() {
        showCallCount++;
      },
      hideStatusWindow() {},
      updateStatusWindow() {
        updateCallCount++;
      },
    },
  };

  try {
    const statusBar = new StatusBar();
    const petA = {
      id: 'yueqi',
      name: '岳清源',
      nickname: '掌门',
      emoji: '🌸',
      image: null,
      stats: { affection: 80, hunger: 70, qi: 60, mood: 90 },
    };
    const petB = {
      id: 'shenjiu',
      name: '沈九',
      nickname: '九哥',
      emoji: '🍃',
      image: null,
      stats: { affection: 75, hunger: 50, qi: 80, mood: 65 },
    };

    // 1. Show window
    statusBar.show(petA, petB);
    assert.equal(showCallCount, 1);
    assert.equal(updateCallCount, 0);

    // 2. Update without changing stats -> should be skipped!
    statusBar.update(petA, petB);
    assert.equal(updateCallCount, 0, 'unchanged stats must skip IPC call');

    // 3. Update with changed stat -> sends 1 IPC call
    petA.stats.hunger = 75;
    statusBar.update(petA, petB);
    assert.equal(updateCallCount, 1, 'changed stats must trigger IPC update');

    // 4. Update again without changing -> skips IPC call
    statusBar.update(petA, petB);
    assert.equal(updateCallCount, 1, 'subsequent unchanged call must skip IPC');

    // 5. Hide window -> updates should not fire
    statusBar.hide();
    petA.stats.hunger = 80;
    statusBar.update(petA, petB);
    assert.equal(updateCallCount, 1, 'hidden status bar must not send IPC updates');

    // 6. Re-open and simulate external window close via IPC callback
    statusBar.show(petA, petB);
    assert.equal(showCallCount, 2);
    assert.equal(statusBar.visible, true);

    assert.equal(typeof closedCallback, 'function', 'closedCallback must be registered');
    closedCallback();
    assert.equal(statusBar.visible, false, 'closedCallback must mark statusBar hidden');
    assert.equal(statusBar._lastSnapshotJson, null, 'closedCallback must reset cached snapshot');

    // Updates while closed must be skipped
    petA.stats.hunger = 85;
    statusBar.update(petA, petB);
    assert.equal(updateCallCount, 1, 'updates while closed must not send IPC calls');

    // Subsequent show and update after re-showing work properly
    statusBar.show(petA, petB);
    assert.equal(showCallCount, 3);
    assert.equal(statusBar.visible, true);

    petA.stats.hunger = 90;
    statusBar.update(petA, petB);
    assert.equal(updateCallCount, 2, 'subsequent update after re-showing must send IPC update');
  } finally {
    delete global.window;
  }
});

test('statusWindow.js updates existing DOM blocks in-place without replaceChildren and without resizeStatusWindow', () => {
  let onDataCallback;
  let resizeCount = 0;
  let replaceChildrenCount = 0;

  const contentEl = createMockElement('div');
  const originalReplaceChildren = contentEl.replaceChildren.bind(contentEl);
  contentEl.replaceChildren = (...items) => {
    replaceChildrenCount++;
    return originalReplaceChildren(...items);
  };

  const closeBtn = createMockElement('button');
  closeBtn.addEventListener = () => {};

  const context = {
    document: {
      getElementById(id) {
        if (id === 'status-content') return contentEl;
        if (id === 'status-close') return closeBtn;
        return null;
      },
      createElement(tag) {
        return createMockElement(tag);
      },
      querySelector() {
        return { scrollWidth: 320, scrollHeight: 280 };
      },
    },
    window: {
      electronAPI: {
        onStatusWindowData(cb) {
          onDataCallback = cb;
        },
        resizeStatusWindow() {
          resizeCount++;
        },
        closeStatusWindow() {},
      },
    },
    WindowI18n: {
      init(cb) {
        if (typeof cb === 'function') cb();
      },
    },
    t: (key) => key,
    requestAnimationFrame(cb) {
      cb();
    },
    Math,
    Number,
    String,
    Object,
    Array,
  };

  const script = readSource('src/statusWindow.js');
  vm.runInNewContext(script, context);

  // 1. Initial data -> creates blocks with images and calls resizeStatusWindow
  onDataCallback({
    pets: [
      {
        id: 'yueqi',
        name: '岳清源',
        nickname: '掌门',
        image: 'pet-asset://skin/default/left.webp',
        stats: { affection: 80, hunger: 70, qi: 60, mood: 90 },
      },
      {
        id: 'shenjiu',
        name: '沈九',
        nickname: '九哥',
        image: 'pet-asset://skin/default/left.webp',
        stats: { affection: 75, hunger: 50, qi: 80, mood: 65 },
      },
    ],
  });

  assert.equal(replaceChildrenCount, 1, 'Initial render must build DOM');
  assert.equal(resizeCount, 1, 'Initial render must measure and resize window');
  assert.equal(contentEl.children.length, 2);

  const initialBlockYueqi = contentEl.children[0];
  const initialBlockShenjiu = contentEl.children[1];

  // Verify that block.children is HTMLCollection-like (no .filter method)
  assert.equal(
    typeof initialBlockYueqi.children.filter,
    'undefined',
    'block.children must be HTMLCollection-like without .filter()'
  );

  const yueqiIcon = initialBlockYueqi.querySelector('.status-pet-icon');
  assert.ok(yueqiIcon, 'status-pet-icon img element must exist');
  assert.equal(yueqiIcon.src, 'pet-asset://skin/default/left.webp');

  // 2. Incremental stat update -> in-place update!
  onDataCallback({
    pets: [
      {
        id: 'yueqi',
        name: '岳清源',
        nickname: '掌门',
        image: 'pet-asset://skin/default/left.webp',
        stats: { affection: 85, hunger: 70, qi: 60, mood: 90 },
      },
      {
        id: 'shenjiu',
        name: '沈九',
        nickname: '九哥',
        image: 'pet-asset://skin/default/left.webp',
        stats: { affection: 75, hunger: 45, qi: 80, mood: 65 },
      },
    ],
  });

  assert.equal(replaceChildrenCount, 1, 'Incremental update must NOT call replaceChildren');
  assert.equal(resizeCount, 1, 'Incremental update must NOT call resizeStatusWindow');
  assert.strictEqual(contentEl.children[0], initialBlockYueqi, 'DOM block instances must be preserved');
  assert.strictEqual(contentEl.children[1], initialBlockShenjiu, 'DOM block instances must be preserved');

  // Verify in-place values were updated
  const yueqiFill = initialBlockYueqi.querySelector('.stat-bar-fill--affection');
  assert.equal(yueqiFill.style.width, '85%');

  // 3. Skin switch -> updates icon.src in-place without replaceChildren or resize
  onDataCallback({
    pets: [
      {
        id: 'yueqi',
        name: '岳清源',
        nickname: '掌门',
        image: 'pet-asset://skin/qban/left.webp',
        stats: { affection: 85, hunger: 70, qi: 60, mood: 90 },
      },
      {
        id: 'shenjiu',
        name: '沈九',
        nickname: '九哥',
        image: 'pet-asset://skin/qban/left.webp',
        stats: { affection: 75, hunger: 45, qi: 80, mood: 65 },
      },
    ],
  });

  assert.equal(replaceChildrenCount, 1, 'Skin switch must NOT call replaceChildren');
  assert.equal(resizeCount, 1, 'Skin switch must NOT call resizeStatusWindow');
  assert.strictEqual(contentEl.children[0], initialBlockYueqi);
  assert.strictEqual(contentEl.children[1], initialBlockShenjiu);
  assert.equal(yueqiIcon.src, 'pet-asset://skin/qban/left.webp', 'pet icon src must update to new skin in-place');

  // 4. Avatar mode change (image to null) -> structure change triggers clean rebuild
  onDataCallback({
    pets: [
      {
        id: 'yueqi',
        name: '岳清源',
        nickname: '掌门',
        image: null,
        emoji: '🌸',
        stats: { affection: 85, hunger: 70, qi: 60, mood: 90 },
      },
      {
        id: 'shenjiu',
        name: '沈九',
        nickname: '九哥',
        image: 'pet-asset://skin/qban/left.webp',
        stats: { affection: 75, hunger: 45, qi: 80, mood: 65 },
      },
    ],
  });

  assert.equal(replaceChildrenCount, 2, 'Switching between image and emoji avatar mode must rebuild DOM');
  assert.equal(resizeCount, 2, 'Full rebuild must re-measure and resize window');
});

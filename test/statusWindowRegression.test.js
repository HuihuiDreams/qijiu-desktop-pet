const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('showStatusWindow uses openStatusWindow, not a bare createStatusWindow', () => {
  const statusWindow = readSource('src/main/windows/StatusWindow.js');

  // createStatusWindow only opens/creates the window without showing, moving
  // it to front, or focusing it; showStatusWindow must go through
  // openStatusWindow() so the status panel actually becomes visible.
  const showFnMatch = statusWindow.match(/function showStatusWindow\(data\) \{([\s\S]*?)\n\}/);
  assert.ok(showFnMatch, 'showStatusWindow function not found');
  const body = showFnMatch[1];
  assert.match(body, /\bopenStatusWindow\(\)/);
  assert.equal(
    /\bcreateStatusWindow\(\)/.test(body),
    false,
    'showStatusWindow must not call a bare createStatusWindow()'
  );
});

test('status window keeps its original size and close-event side effects', () => {
  const statusWindow = readSource('src/main/windows/StatusWindow.js');

  // The panel UI needs the original 400x460 bounds; 160x180 clips it.
  assert.match(statusWindow, /width = 400/);
  assert.match(statusWindow, /height = 460/);

  // Closing must notify the main renderer and refresh the tray menu.
  assert.match(statusWindow, /webContents\.send\('status-window-closed'\)/);
  assert.match(statusWindow, /deps\.refreshTrayMenu\(\)/);
});

test('status window module receives the refreshTrayMenu dependency it uses', () => {
  const appLifecycle = readSource('src/main/AppLifecycle.js');

  // The closed handler calls deps.refreshTrayMenu(); if it is not wired in the
  // init() call the close event throws TypeError.
  assert.match(appLifecycle, /statusWindowModule\.init\(\{[\s\S]*?refreshTrayMenu[\s\S]*?\}\)/);
});

test('statusWindow.js source defines ARIA meter semantics and unique label IDs', () => {
  const source = readSource('src/statusWindow.js');

  assert.match(source, /stat-label-\$\{pet\.id\}-\$\{key\}/);
  assert.match(source, /setAttribute\(['"]role['"],\s*['"]meter['"]\)/);
  assert.match(source, /setAttribute\(['"]aria-valuemin['"],\s*['"]0['"]\)/);
  assert.match(source, /setAttribute\(['"]aria-valuemax['"],\s*['"]100['"]\)/);
  assert.match(source, /setAttribute\(['"]aria-valuenow['"],/);
  assert.match(source, /setAttribute\(['"]aria-labelledby['"],/);
});

test('statusWindow.js renderPetStats builds accessible meter elements with unique label associations', () => {
  function createMockElement(tagName) {
    const attributes = {};
    const classNames = new Set();
    const children = [];
    return {
      tagName,
      id: '',
      className: '',
      style: {},
      dataset: {},
      children,
      attributes,
      classList: {
        add: (...c) => c.forEach(name => classNames.add(name)),
        remove: (...c) => c.forEach(name => classNames.delete(name)),
        contains: (c) => classNames.has(c),
      },
      setAttribute(name, val) {
        attributes[name] = String(val);
      },
      getAttribute(name) {
        return attributes[name];
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
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  }

  let onDataCallback;
  const contentEl = createMockElement('div');
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
      querySelector() { return null; },
    },
    window: {
      electronAPI: {
        onStatusWindowData(cb) {
          onDataCallback = cb;
        },
        resizeStatusWindow() {},
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

  assert.equal(typeof onDataCallback, 'function', 'onStatusWindowData callback must be registered');

  onDataCallback({
    pets: [
      {
        id: 'yueqi',
        name: '克劳利',
        nickname: 'Crowley',
        stats: { affection: 85, hunger: 40, qi: 95, mood: 100 },
      },
      {
        id: 'shenjiu',
        name: '亚茨拉斐尔',
        nickname: 'Aziraphale',
        stats: { affection: 60, hunger: -15, qi: 150, mood: 0 },
      },
    ],
  });

  assert.equal(contentEl.children.length, 2, 'Should render 2 pet status blocks');

  const allLabelIds = new Set();
  const allLabelledByRefs = new Set();

  for (const block of contentEl.children) {
    const petId = block.dataset.petId;
    assert.ok(petId === 'yueqi' || petId === 'shenjiu');

    const nameText = block.children.find(c => c.className === 'pet-status-name')?.children?.find(c => c.className === 'pet-status-name-text');
    assert.ok(nameText, 'nameText element should exist');
    assert.doesNotMatch(nameText.textContent, /[（）()]/, 'Status window pet name should not contain parentheses');
    assert.equal(nameText.textContent, petId === 'yueqi' ? ' 克劳利' : ' 亚茨拉斐尔');

    // Find all stat-row children
    const statRows = block.children.filter(c => c.className === 'stat-row');
    assert.equal(statRows.length, 4, `Pet ${petId} should have 4 stat rows`);

    for (const row of statRows) {
      const labelEl = row.children.find(c => c.className === 'stat-label');
      const barEl = row.children.find(c => c.className === 'stat-bar');
      const valueEl = row.children.find(c => c.className === 'stat-value');

      assert.ok(labelEl, 'stat-label element must exist');
      assert.ok(barEl, 'stat-bar element must exist');
      assert.ok(valueEl, 'stat-value element must exist');

      assert.ok(labelEl.id.startsWith(`stat-label-${petId}-`));
      allLabelIds.add(labelEl.id);

      assert.equal(barEl.getAttribute('role'), 'meter');
      assert.equal(barEl.getAttribute('aria-valuemin'), '0');
      assert.equal(barEl.getAttribute('aria-valuemax'), '100');
      assert.equal(barEl.getAttribute('aria-labelledby'), labelEl.id);
      allLabelledByRefs.add(barEl.getAttribute('aria-labelledby'));

      const valNow = Number(barEl.getAttribute('aria-valuenow'));
      assert.ok(valNow >= 0 && valNow <= 100, `valuenow (${valNow}) must be clamped between 0 and 100`);

      // Specific boundary checks for clamped stats
      if (labelEl.id === 'stat-label-shenjiu-hunger') {
        assert.equal(barEl.getAttribute('aria-valuenow'), '0', 'Negative hunger should clamp to 0');
      }
      if (labelEl.id === 'stat-label-shenjiu-qi') {
        assert.equal(barEl.getAttribute('aria-valuenow'), '100', 'Over-100 qi should clamp to 100');
      }
      if (labelEl.id === 'stat-label-yueqi-affection') {
        assert.equal(barEl.getAttribute('aria-valuenow'), '85');
      }
    }
  }

  assert.equal(allLabelIds.size, 8, 'All 8 stat labels must have unique IDs');
  assert.equal(allLabelledByRefs.size, 8, 'All 8 stat bars must reference their corresponding label');
  assert.deepEqual(Array.from(allLabelIds).sort(), Array.from(allLabelledByRefs).sort());
});

test('status.html uses semantic h1 and statusWindow.js handles Escape to close', () => {
  const html = readSource('src/status.html');
  const css = readSource('src/status.css');
  const js = readSource('src/statusWindow.js');

  assert.match(html, /<h1 data-i18n="statusTitle">/);
  assert.match(css, /\.status-titlebar h1\s*\{[\s\S]*?font:\s*inherit;/);
  assert.match(js, /e\.key === 'Escape'/);
  assert.match(js, /closeStatusWindow/);

  let closed = false;
  let keydownHandler;
  const context = {
    document: {
      getElementById: () => ({ addEventListener() {} }),
      querySelector: () => null,
    },
    window: {
      electronAPI: {
        onStatusWindowData() {},
        closeStatusWindow() { closed = true; },
      },
      addEventListener(type, fn) { if (type === 'keydown') keydownHandler = fn; },
    },
    WindowI18n: { init() {} },
  };
  vm.runInNewContext(js, context);
  assert.equal(typeof keydownHandler, 'function');
  keydownHandler({ key: 'Escape' });
  assert.equal(closed, true);
});

test('status.html and status.css provide unified SVG close button and jade-mist styling', () => {
  const html = readSource('src/status.html');
  const css = readSource('src/status.css');

  assert.match(html, /<button id="status-close"[^>]*data-i18n-title="pomodoroClose"[^>]*>[\s\S]*?<svg viewBox="0 0 24 24" aria-hidden="true">[\s\S]*?<path d="M6 6l12 12M18 6L6 18"><\/path>[\s\S]*?<\/svg>[\s\S]*?<\/button>/);
  assert.match(css, /\.status-close:hover\s*\{[\s\S]*?background:\s*var\(--color-jade-mist\);/);
  assert.match(css, /\.status-close:hover\s*\{[\s\S]*?color:\s*var\(--color-jade-deep\);/);
  assert.match(css, /\.status-close:focus-visible\s*\{[\s\S]*?outline:\s*2px solid rgba\(110, 198, 160, 0\.7\);/);
});

test('status.css contains migrated status-panel layout, animation, and keyframes', () => {
  const css = readSource('src/status.css');

  const panelRule = css.match(/\.status-panel\s*\{[^}]+\}/s)?.[0] || '';
  assert.match(panelRule, /top:\s*50%;/);
  assert.match(panelRule, /left:\s*50%;/);
  assert.match(panelRule, /transform:\s*translate\(-50%,\s*-50%\);/);
  assert.match(panelRule, /z-index:\s*10000;/);
  assert.match(panelRule, /animation:\s*panelSlideIn\s+0\.4s/);
  assert.match(panelRule, /min-width:\s*320px;/);

  assert.match(css, /@keyframes panelSlideIn\s*\{/);
  assert.match(css, /\.pet-status-block:hover\s*\{[\s\S]*?border-color:\s*var\(--color-glass-border\);/);
});

test('statusWindow.js aligns qi/mood icons and handles anchor-positioned stat tooltips and Escape priority', () => {
  function makeInteractiveElement(tagName, id = '') {
    const attributes = {};
    const classNames = new Set();
    const children = [];
    const listeners = {};
    return {
      tagName,
      id,
      className: '',
      style: {},
      dataset: {},
      children,
      attributes,
      listeners,
      popoverOpen: false,
      classList: {
        add: (...c) => c.forEach((name) => classNames.add(name)),
        remove: (...c) => c.forEach((name) => classNames.delete(name)),
        contains: (c) => classNames.has(c),
      },
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      setAttribute(name, val) {
        attributes[name] = String(val);
      },
      getAttribute(name) {
        return attributes[name];
      },
      removeAttribute(name) {
        delete attributes[name];
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
      showPopover() {
        this.popoverOpen = true;
      },
      hidePopover() {
        this.popoverOpen = false;
      },
      matches(selector) {
        return selector === ':popover-open' ? this.popoverOpen : false;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
  }

  let onDataCallback;
  let closed = false;
  let keydownHandler;
  const contentEl = makeInteractiveElement('div', 'status-content');
  const closeBtn = makeInteractiveElement('button', 'status-close');
  const tooltipEl = makeInteractiveElement('div', 'status-tooltip');

  const dict = {
    statAffection: '默契',
    statHunger: '饱腹',
    statQi: '奇迹能量',
    statMood: '心情',
    statTipQiYueqi: '右键「🪴 照料植物」持续充能',
    statTipQiShenjiu: '右键「📖 静心研读」持续充能',
  };

  const context = {
    document: {
      getElementById(id) {
        if (id === 'status-content') return contentEl;
        if (id === 'status-close') return closeBtn;
        if (id === 'status-tooltip') return tooltipEl;
        return null;
      },
      createElement(tag) {
        return makeInteractiveElement(tag);
      },
      querySelector() {
        return null;
      },
    },
    window: {
      electronAPI: {
        onStatusWindowData(cb) {
          onDataCallback = cb;
        },
        resizeStatusWindow() {},
        closeStatusWindow() {
          closed = true;
        },
      },
      addEventListener(type, fn) {
        if (type === 'keydown') keydownHandler = fn;
      },
    },
    WindowI18n: { init() {} },
    t: (key) => dict[key] || key,
    requestAnimationFrame(cb) {
      cb();
    },
    Math,
    Number,
    String,
    Object,
    Array,
    Promise,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(readSource('src/statusWindow.js'), context);

  onDataCallback({
    pets: [
      { id: 'yueqi', name: '克劳利', stats: { affection: 50, hunger: 80, qi: 15, mood: 70 } },
      { id: 'shenjiu', name: '亚茨拉斐尔', stats: { affection: 50, hunger: 80, qi: 80, mood: 70 } },
    ],
  });

  const yueqiBlock = contentEl.children[0];
  const shenjiuBlock = contentEl.children[1];
  const yueqiQiRow = yueqiBlock.children.find((c) => c.dataset?.stat === 'qi');
  const yueqiMoodRow = yueqiBlock.children.find((c) => c.dataset?.stat === 'mood');
  const shenjiuQiRow = shenjiuBlock.children.find((c) => c.dataset?.stat === 'qi');

  const yueqiQiLabel = yueqiQiRow.children.find((c) => c.className === 'stat-label');
  const yueqiMoodLabel = yueqiMoodRow.children.find((c) => c.className === 'stat-label');
  assert.equal(yueqiQiLabel.textContent, '✨ 奇迹能量');
  assert.equal(yueqiMoodLabel.textContent, '☕ 心情');
  assert.doesNotMatch(yueqiQiLabel.textContent, /🧘🏻‍♂️/);
  assert.equal(yueqiQiRow.getAttribute('data-low'), 'true');
  assert.equal(shenjiuQiRow.getAttribute('data-low'), undefined);
  assert.equal(yueqiQiRow.dataset.tooltip, '右键「🪴 照料植物」持续充能');
  assert.equal(shenjiuQiRow.dataset.tooltip, '右键「📖 静心研读」持续充能');

  // Focusing a row opens the anchor-positioned popover tooltip
  yueqiQiRow.listeners.focusin();
  assert.equal(tooltipEl.popoverOpen, true);
  assert.equal(yueqiQiRow.style.anchorName, '--status-tooltip-anchor');
  assert.equal(tooltipEl.textContent, '右键「🪴 照料植物」持续充能');

  // First Escape closes only the open tooltip, not the window
  keydownHandler({ key: 'Escape', preventDefault() {} });
  assert.equal(tooltipEl.popoverOpen, false);
  assert.equal(closed, false);

  // Second Escape closes the status window
  keydownHandler({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, true);

  // Hovering opens tooltip and focusout hides it
  shenjiuQiRow.listeners.mouseenter();
  assert.equal(tooltipEl.popoverOpen, true);
  assert.equal(shenjiuQiRow.style.anchorName, '--status-tooltip-anchor');
  assert.equal(tooltipEl.textContent, '右键「📖 静心研读」持续充能');
  shenjiuQiRow.listeners.focusout();
  assert.equal(tooltipEl.popoverOpen, false);
});


const assert = require('node:assert/strict');
const test = require('node:test');

const { ContextMenu } = require('../src/ui/ContextMenu.js');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
    has(name) {
      return values.has(name);
    },
  };
}

function createElement({ id = '', classNames = [], dataset = {} } = {}) {
  const attributes = new Map();
  return {
    id,
    dataset,
    attributes,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    },
    className: classNames.join(' '),
    classList: createClassList(classNames),
    textContent: '',
    children: [],
    listeners: {},
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    },
    appendChild(child) {
      this.children.push(child);
    },
    contains(target) {
      return target === this || this.children.includes(target);
    },
    getBoundingClientRect() {
      return { width: 180, height: 210 };
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createMenuDom() {
  const items = ['feed', 'meditate', 'pet', 'rest', 'status'].map((action) => createElement({
    classNames: ['menu-item'],
    dataset: { action },
  }));
  const i18nItem = createElement({ dataset: { i18n: 'contextMenuFeed' } });
  const menu = createElement({ id: 'context-menu', classNames: ['hidden'] });
  const header = createElement({ id: 'menu-header' });

  const popoverLog = { show: 0, hide: 0 };
  menu.showPopover = () => {
    popoverLog.show += 1;
  };
  menu.hidePopover = () => {
    popoverLog.hide += 1;
  };

  menu.querySelector = (selector) => {
    const actionMatch = selector.match(/\.menu-item\[data-action="([^"]+)"\]/);
    if (actionMatch) {
      return items.find((item) => item.dataset.action === actionMatch[1]) || null;
    }
    return null;
  };
  menu.querySelectorAll = (selector) => {
    if (selector === '.menu-item') return items;
    if (selector === '.menu-item[data-action]') return items;
    if (selector === '[data-i18n]') return [i18nItem];
    return [];
  };
  return { menu, header, items, i18nItem, popoverLog };
}

function withContextMenuHarness(callback) {
  const originalDocument = global.document;
  const originalWindow = global.window;
  const dom = createMenuDom();
  const mouseCalls = [];
  const bodyClassList = createClassList();
  const windowListeners = {};

  global.document = {
    body: { classList: bodyClassList },
    listeners: {},
    getElementById(id) {
      if (id === 'context-menu') return dom.menu;
      if (id === 'menu-header') return dom.header;
      return null;
    },
    createElement(tag) {
      return createElement({ classNames: tag === 'img' ? ['status-pet-icon'] : [] });
    },
    createTextNode(text) {
      return { textContent: text };
    },
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    },
  };
  global.window = {
    innerWidth: 800,
    innerHeight: 600,
    listeners: windowListeners,
    addEventListener(type, callback) {
      windowListeners[type] = callback;
    },
    t(key) {
      const translations = {
        nameYueqi: 'Yue Qingyuan',
        nicknameYueqi: 'Yue Qi',
        petYueqi: 'Pat Yue Qi',
        contextMenuFeed: 'Feed',
        bubbleFeedYueqi: 'Eating',
        bubbleRestTooHungry: 'Too hungry',
      };
      return translations[key] || key;
    },
    electronAPI: {
      setIgnoreMouseEvents(...args) {
        mouseCalls.push(args);
      },
    },
  };

  try {
    return callback({ ...dom, mouseCalls, bodyClassList, windowListeners });
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
  }
}

function createPet(overrides = {}) {
  const calls = [];
  return {
    id: 'yueqi',
    x: 100,
    y: 100,
    size: 96,
    name: 'Fallback Name',
    nickname: 'Fallback Nick',
    image: 'pet.webp',
    emoji: ':)',
    isBusy: () => false,
    _showBubble(message) {
      calls.push(['bubble', message]);
    },
    _spawnEffect(symbol, kind) {
      calls.push(['effect', symbol, kind]);
    },
    calls,
    ...overrides,
  };
}

test('ContextMenu.show renders a localized pet header and enables busy-state disabling', () => withContextMenuHarness(({ menu, header, items, i18nItem, bodyClassList }) => {
  const contextMenu = new ContextMenu({}, () => 1.25, () => ({ x: 0, y: 0, width: 800, height: 600 }));
  const pet = createPet({ isBusy: () => true });

  contextMenu.show(pet, 120, 180);

  assert.equal(contextMenu.currentPet, pet);
  assert.equal(menu.classList.contains('hidden'), false);
  assert.equal(menu.style.values['--display-scale'], 1.25);
  assert.equal(menu.style.left, '120px');
  assert.equal(menu.style.top, '180px');
  assert.equal(bodyClassList.contains('weather-interaction-muted'), true);
  assert.equal(header.children[0].src, 'pet.webp');
  assert.equal(header.children[1].textContent, ' Yue Qingyuan');
  assert.equal(i18nItem.textContent, 'Feed');
  assert.equal(items.find((item) => item.dataset.action === 'pet').textContent, 'Pat Yue Qi');
  assert.equal(items.find((item) => item.dataset.action === 'feed').classList.contains('disabled'), true);
  assert.equal(items.find((item) => item.dataset.action === 'feed').getAttribute('aria-disabled'), 'true');
  assert.equal(items.find((item) => item.dataset.action === 'status').classList.contains('disabled'), false);
  assert.equal(items.find((item) => item.dataset.action === 'status').getAttribute('aria-disabled'), null);

  const nonBusyPet = createPet({ isBusy: () => false });
  contextMenu.show(nonBusyPet, 120, 180);
  assert.equal(items.find((item) => item.dataset.action === 'feed').classList.contains('disabled'), false);
  assert.equal(items.find((item) => item.dataset.action === 'feed').getAttribute('aria-disabled'), null);
}));

test('ContextMenu.hide restores click-through directly', () => withContextMenuHarness(({ menu, mouseCalls, bodyClassList }) => {
  const contextMenu = new ContextMenu({});
  contextMenu.currentPet = createPet();
  menu.classList.remove('hidden');

  contextMenu.hide();

  assert.equal(menu.classList.contains('hidden'), true);
  assert.equal(contextMenu.currentPet, null);
  assert.equal(bodyClassList.contains('weather-interaction-muted'), false);
  assert.deepEqual(mouseCalls.at(-1), [true, { forward: true }]);
}));

test('ContextMenu.hide keeps the window interactive while the pointer is still over a pet', () => withContextMenuHarness(({ menu, mouseCalls, bodyClassList }) => {
  const selectors = [];
  global.document.querySelector = (selector) => {
    selectors.push(selector);
    return selector === '.pet:hover' ? {} : null;
  };
  const contextMenu = new ContextMenu({});
  contextMenu.show(createPet(), 120, 180);

  contextMenu.hide();

  assert.deepEqual(selectors, ['.pet:hover']);
  assert.equal(menu.classList.contains('hidden'), true);
  assert.equal(contextMenu.currentPet, null);
  // 不带 leaseMs 的调用会取消菜单打开时下发的 10 秒租约
  assert.deepEqual(mouseCalls.at(-1), [false]);
  assert.equal(bodyClassList.contains('weather-interaction-muted'), true);
}));

test('ContextMenu.handleAction runs nurture actions and status callbacks', () => withContextMenuHarness(() => {
  const nurtureCalls = [];
  const contextMenu = new ContextMenu({
    feed(pet) {
      nurtureCalls.push(['feed', pet.id]);
      return true;
    },
    rest() {
      nurtureCalls.push(['rest']);
      return false;
    },
  });
  const pet = createPet();
  let statusClicks = 0;
  contextMenu.currentPet = pet;
  contextMenu.onStatusClick = () => {
    statusClicks += 1;
  };

  contextMenu.handleAction('feed');
  contextMenu.handleAction('rest');
  contextMenu.handleAction('status');

  assert.deepEqual(nurtureCalls, [['feed', 'yueqi'], ['rest']]);
  assert.deepEqual(pet.calls, [
    ['bubble', 'Eating'],
    ['effect', '🍎', 'feed'],
    ['bubble', 'Too hungry'],
  ]);
  assert.equal(statusClicks, 1);
}));

test('ContextMenu.handleAction queues the action instead of executing if the target pet is interacting', () => withContextMenuHarness(() => {
  const nurtureCalls = [];
  const contextMenu = new ContextMenu({
    feed(pet) {
      nurtureCalls.push(['feed', pet.id]);
      return true;
    },
  });
  
  const pet = createPet({ state: 'interacting' });
  contextMenu.currentPet = pet;
  
  contextMenu.handleAction('feed');
  
  assert.equal(nurtureCalls.length, 0);
  assert.equal(pet.calls.length, 0);
  assert.equal(pet.queuedAction, 'feed');
  
  const anotherPet = createPet({ state: 'interacting' });
  contextMenu.handleAction('meditate', anotherPet);
  
  assert.equal(nurtureCalls.length, 0);
  assert.equal(anotherPet.queuedAction, 'meditate');
}));

test('ContextMenu mouse events keep the menu interactive only while needed', () => withContextMenuHarness(({ menu, mouseCalls }) => {
  new ContextMenu({});

  assert.equal(menu.listeners.mouseleave, undefined);

  menu.listeners.mouseenter();
  assert.deepEqual(mouseCalls.at(-1), [false, { leaseMs: 10000 }]);

  menu.classList.remove('hidden');
  menu.listeners.mousemove();
  assert.deepEqual(mouseCalls.at(-1), [false, { leaseMs: 10000 }]);

  mouseCalls.length = 0;
  menu.classList.add('hidden');
  menu.listeners.mousemove();
  assert.equal(mouseCalls.length, 0);
}));

test('ContextMenu pointer and outside-click handlers trigger actions and close the menu', () => withContextMenuHarness(({ menu, items, mouseCalls }) => {
  const nurtureCalls = [];
  const contextMenu = new ContextMenu({
    feed(pet) {
      nurtureCalls.push(['feed', pet.id]);
      return true;
    },
  });
  contextMenu.currentPet = createPet();
  menu.classList.remove('hidden');

  items.find((item) => item.dataset.action === 'feed').listeners.pointerdown({
    button: 0,
    pointerType: 'mouse',
    currentTarget: items.find((item) => item.dataset.action === 'feed'),
  });

  assert.deepEqual(nurtureCalls, [['feed', 'yueqi']]);
  assert.equal(menu.classList.contains('hidden'), true);
  assert.deepEqual(mouseCalls.at(-1), [true, { forward: true }]);

  menu.classList.remove('hidden');
  global.document.listeners.mousedown({ target: createElement() });
  assert.equal(menu.classList.contains('hidden'), true);
}));

test('ContextMenu.show falls back to emoji and pet names when image and translations are missing', () => withContextMenuHarness(({ header }) => {
  const originalT = global.window.t;
  global.window.t = null;
  const contextMenu = new ContextMenu({}, null, () => ({ x: 0, y: 0, width: 800, height: 600 }));
  const pet = createPet({
    image: '',
    emoji: '*',
    name: 'Fallback Name',
    nickname: 'Fallback Nick',
  });

  try {
    contextMenu.show(pet, 120, 180);
  } finally {
    global.window.t = originalT;
  }

  assert.equal(header.children[0].textContent, '*');
  assert.equal(header.children[1].textContent, ' Fallback Name');
  assert.doesNotMatch(header.children[1].textContent, /[（）()]/);
}));

test('ContextMenu.handleAction runs meditate, pet, and successful rest effects', () => withContextMenuHarness(() => {
  const contextMenu = new ContextMenu({
    meditate() {
      return true;
    },
    headPat() {
      return true;
    },
    rest() {
      return true;
    },
  });
  const pet = createPet({ id: 'shenjiu' });
  contextMenu.currentPet = pet;

  contextMenu.handleAction('meditate');
  contextMenu.handleAction('pet');
  contextMenu.handleAction('rest');
  contextMenu.handleAction('unknown');

  assert.deepEqual(pet.calls, [
    ['bubble', 'bubbleMeditateShenjiu'],
    ['effect', '✨', 'meditate'],
    ['bubble', 'bubblePetShenjiu'],
    ['effect', '💕', 'pet'],
    ['bubble', 'bubbleRestShenjiu'],
    ['effect', '💤', 'rest'],
  ]);
}));

test('ContextMenu.show and hide invoke showPopover and hidePopover while coordinating hidden class', () => withContextMenuHarness(({ menu, popoverLog }) => {
  const contextMenu = new ContextMenu({}, () => 1, () => ({ x: 0, y: 0, width: 800, height: 600 }));
  const pet = createPet();

  assert.equal(popoverLog.show, 0);
  assert.equal(popoverLog.hide, 0);
  assert.equal(menu.classList.contains('hidden'), true);

  contextMenu.show(pet, 100, 100);
  assert.equal(popoverLog.show, 1);
  assert.equal(menu.classList.contains('hidden'), false);

  contextMenu.hide();
  assert.equal(popoverLog.hide, 1);
  assert.equal(menu.classList.contains('hidden'), true);
}));

test('ContextMenu items with aria-disabled="true" intercept pointerdown and click without triggering actions', () => withContextMenuHarness(({ menu, items }) => {
  const nurtureCalls = [];
  const contextMenu = new ContextMenu({
    feed(pet) {
      nurtureCalls.push(['feed', pet.id]);
      return true;
    },
  });
  const pet = createPet({ isBusy: () => true });
  contextMenu.show(pet, 100, 100);

  const feedItem = items.find((item) => item.dataset.action === 'feed');
  assert.equal(feedItem.getAttribute('aria-disabled'), 'true');

  let preventedPointer = false;
  let stoppedPointer = false;
  feedItem.listeners.pointerdown({
    button: 0,
    pointerType: 'mouse',
    currentTarget: feedItem,
    preventDefault() { preventedPointer = true; },
    stopPropagation() { stoppedPointer = true; },
  });

  assert.equal(preventedPointer, true);
  assert.equal(stoppedPointer, true);
  assert.equal(nurtureCalls.length, 0);
  assert.equal(menu.classList.contains('hidden'), false);

  let preventedClick = false;
  let stoppedClick = false;
  feedItem.listeners.click({
    currentTarget: feedItem,
    preventDefault() { preventedClick = true; },
    stopPropagation() { stoppedClick = true; },
  });

  assert.equal(preventedClick, true);
  assert.equal(stoppedClick, true);
  assert.equal(nurtureCalls.length, 0);
  assert.equal(menu.classList.contains('hidden'), false);
}));

test('ContextMenu Escape key listener dismisses the open menu and restores mouse passthrough', () => withContextMenuHarness(({ menu, mouseCalls, windowListeners }) => {
  const contextMenu = new ContextMenu({});
  const pet = createPet();
  contextMenu.show(pet, 100, 100);

  assert.equal(contextMenu.isOpen(), true);
  assert.equal(menu.classList.contains('hidden'), false);

  let prevented = false;
  windowListeners.keydown({
    key: 'Escape',
    preventDefault() { prevented = true; },
  });

  assert.equal(prevented, true);
  assert.equal(contextMenu.isOpen(), false);
  assert.equal(menu.classList.contains('hidden'), true);
  assert.deepEqual(mouseCalls.at(-1), [true, { forward: true }]);
}));

test('ContextMenu outside pointerdown dismisses the menu', () => withContextMenuHarness(({ menu }) => {
  const contextMenu = new ContextMenu({});
  const pet = createPet();
  contextMenu.show(pet, 100, 100);

  assert.equal(contextMenu.isOpen(), true);

  global.document.listeners.pointerdown({ target: createElement() });

  assert.equal(contextMenu.isOpen(), false);
  assert.equal(menu.classList.contains('hidden'), true);
}));

test('src/index.html context menu uses popover="manual" and semantic button items without role="menu"', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

  assert.match(html, /<div[^>]*id="context-menu"[^>]*popover="manual"/);
  assert.doesNotMatch(html, /id="context-menu"[^>]*role="menu"/);

  const buttonItems = html.match(/<button[^>]*class="menu-item"[^>]*>/g) || [];
  assert.equal(buttonItems.length, 5);
  for (const item of buttonItems) {
    assert.match(item, /type="button"/);
    assert.doesNotMatch(item, /role="menuitem"/);
  }
});

test('ContextMenu.show updates structured .menu-item-label and .menu-item-hint with urgency cues', () => {
  const originalDocument = global.document;
  const originalWindow = global.window;

  function makeStructuredItem(action, labelI18n, hintI18n) {
    const label = createElement({
      classNames: ['menu-item-label'],
      dataset: labelI18n ? { i18n: labelI18n } : {},
    });
    const hint = hintI18n
      ? createElement({ classNames: ['menu-item-hint'], dataset: { i18n: hintI18n } })
      : null;
    const item = createElement({
      classNames: ['menu-item'],
      dataset: { action },
    });
    item.children.push(label);
    if (hint) item.children.push(hint);
    item.querySelector = (selector) => {
      if (selector === '.menu-item-label') return label;
      if (selector === '.menu-item-hint') return hint;
      return null;
    };
    return { item, label, hint };
  }

  const structured = {
    feed: makeStructuredItem('feed', 'feed', 'menuHintFeed'),
    meditate: makeStructuredItem('meditate', 'meditate', 'menuHintMeditate'),
    pet: makeStructuredItem('pet', null, 'menuHintPet'),
    rest: makeStructuredItem('rest', 'rest', 'menuHintRest'),
    status: makeStructuredItem('status', 'status', null),
  };
  const items = Object.values(structured).map((s) => s.item);
  const i18nNodes = items.flatMap((it) => it.children.filter((c) => c.dataset?.i18n));
  const menu = createElement({ id: 'context-menu', classNames: ['hidden'] });
  const header = createElement({ id: 'menu-header' });
  menu.showPopover = () => {};
  menu.hidePopover = () => {};
  menu.querySelector = (selector) => {
    const m = selector.match(/\.menu-item\[data-action="([^"]+)"\]/);
    return m ? (structured[m[1]]?.item || null) : null;
  };
  menu.querySelectorAll = (selector) => {
    if (selector === '.menu-item' || selector === '.menu-item[data-action]') return items;
    if (selector === '[data-i18n]') return i18nNodes;
    return [];
  };

  global.document = {
    body: { classList: createClassList() },
    getElementById: (id) => (id === 'context-menu' ? menu : id === 'menu-header' ? header : null),
    createElement: (tag) => createElement({ classNames: tag === 'img' ? ['status-pet-icon'] : [] }),
    addEventListener: () => {},
  };
  const dict = {
    nameYueqi: '克劳利',
    nameShenjiu: '亚茨拉斐尔',
    feed: '🥐 投喂美食',
    meditate: '✨ 施展奇迹',
    meditateYueqi: '🪴 照料植物',
    meditateShenjiu: '📖 静心研读',
    petYueqi: '🤚 天使关怀',
    petShenjiu: '🤚 恶魔偏宠',
    rest: '💤 闭目小憩',
    status: '📊 查看状态',
    menuHintFeed: '饱腹+',
    menuHintMeditate: '奇迹+',
    menuHintPet: '默契+',
    menuHintRest: '心情+',
    menuHintFeedUrgent: '偏低 · 饱腹+',
    menuHintMeditateUrgent: '偏低 · 奇迹+',
    menuHintRestUrgent: '偏低 · 心情+',
  };
  global.window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: () => {},
    t: (k) => dict[k] || k,
    electronAPI: { setIgnoreMouseEvents: () => {} },
  };

  try {
    const cm = new ContextMenu({}, () => 1, () => ({ x: 0, y: 0, width: 800, height: 600 }));

    // 1. Low Qi Crowley: meditate highlighted with urgent badge while preserving character label
    cm.show(createPet({
      id: 'yueqi',
      stats: { hunger: 80, qi: 15, mood: 80 },
      isHungry: () => false,
      isLowQi: () => true,
      isLowMood: () => false,
    }), 100, 100);
    assert.equal(structured.meditate.label.textContent, '🪴 照料植物');
    assert.equal(structured.meditate.hint.textContent, '偏低 · 奇迹+');
    assert.equal(structured.meditate.item.classList.contains('menu-item--urgent'), true);
    assert.equal(structured.meditate.item.getAttribute('data-urgent'), 'true');
    assert.equal(structured.feed.hint.textContent, '饱腹+');
    assert.equal(structured.feed.item.classList.contains('menu-item--urgent'), false);

    // 2. Low Mood + too hungry to rest (hunger < 15): feed is urgent, rest urgency suppressed
    cm.show(createPet({
      id: 'shenjiu',
      stats: { hunger: 10, qi: 80, mood: 15 },
      isHungry: () => true,
      isLowQi: () => false,
      isLowMood: () => true,
    }), 100, 100);
    assert.equal(structured.meditate.label.textContent, '📖 静心研读');
    assert.equal(structured.meditate.hint.textContent, '奇迹+');
    assert.equal(structured.meditate.item.classList.contains('menu-item--urgent'), false);
    assert.equal(structured.feed.item.classList.contains('menu-item--urgent'), true);
    assert.equal(structured.feed.hint.textContent, '偏低 · 饱腹+');
    assert.equal(structured.rest.item.classList.contains('menu-item--urgent'), false);
    assert.equal(structured.rest.hint.textContent, '心情+');

    // 3. Low Mood + enough hunger: rest is urgent
    cm.show(createPet({
      id: 'shenjiu',
      stats: { hunger: 60, qi: 80, mood: 15 },
      isHungry: () => false,
      isLowQi: () => false,
      isLowMood: () => true,
    }), 100, 100);
    assert.equal(structured.rest.item.classList.contains('menu-item--urgent'), true);
    assert.equal(structured.rest.hint.textContent, '偏低 · 心情+');

    // 4. Busy pet: urgency suppressed and items disabled
    cm.show(createPet({
      id: 'yueqi',
      isBusy: () => true,
      stats: { hunger: 10, qi: 10, mood: 10 },
      isHungry: () => true,
      isLowQi: () => true,
      isLowMood: () => true,
    }), 100, 100);
    for (const action of ['feed', 'meditate', 'rest']) {
      assert.equal(structured[action].item.classList.contains('menu-item--urgent'), false);
      assert.equal(structured[action].item.getAttribute('data-urgent'), null);
      assert.equal(structured[action].item.getAttribute('aria-disabled'), 'true');
    }
    assert.equal(structured.meditate.hint.textContent, '奇迹+');
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

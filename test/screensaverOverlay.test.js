const assert = require('node:assert/strict');
const test = require('node:test');

const { ScreensaverSystem } = require('../src/systems/ScreensaverSystem');
const { SkinManager } = require('../src/systems/SkinManager');
const { StageGeometry } = require('../src/systems/StageGeometry');
const SkinService = require('../src/main/services/SkinService');

function createFakeDom() {
  const elements = [];
  const body = {
    children: [],
    appendChild(child) {
      child.parentElement = body;
      elements.push(child);
      this.children.push(child);
      return child;
    },
    querySelectorAll(selector) {
      return querySelectorAllImpl(elements, selector);
    },
    querySelector(selector) {
      const all = querySelectorAllImpl(elements, selector);
      return all[0] || null;
    },
  };

  function querySelectorAllImpl(list, selector) {
    if (selector.startsWith('[data-screensaver-session-id')) {
      const matchAttr = selector.match(/\[data-screensaver-session-id="?([^"\]]*)"?\]/);
      const targetSessionId = matchAttr ? matchAttr[1] : null;
      return list.filter((el) => {
        if (!el.attributes || !('data-screensaver-session-id' in el.attributes)) return false;
        if (targetSessionId && el.attributes['data-screensaver-session-id'] !== targetSessionId) return false;
        return true;
      });
    }
    if (selector.startsWith('.')) {
      const cls = selector.substring(1);
      return list.filter((el) => el.classList && el.classList.contains(cls));
    }
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      return list.filter((el) => el.id === id);
    }
    return [];
  }

  const documentMock = {
    body,
    createElement(tag) {
      const attrs = {};
      const classListSet = new Set();
      const styleObj = {
        _props: {},
        setProperty(k, v) {
          this[k] = String(v);
          this._props[k] = String(v);
        },
        getPropertyValue(k) {
          return this._props[k] || this[k] || '';
        },
      };
      const el = {
        tagName: tag.toUpperCase(),
        attributes: attrs,
        style: styleObj,
        _className: '',
        set className(v) {
          this._className = String(v);
          classListSet.clear();
          this._className.split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
        },
        get className() {
          return this._className;
        },
        classList: {
          add(c) {
            classListSet.add(c);
            el._className = Array.from(classListSet).join(' ');
          },
          contains(c) {
            return classListSet.has(c);
          },
          remove(c) {
            classListSet.delete(c);
            el._className = Array.from(classListSet).join(' ');
          },
        },
        id: '',
        textContent: '',
        src: '',
        alt: '',
        setAttribute(k, v) {
          attrs[k] = String(v);
        },
        getAttribute(k) {
          return attrs[k] || null;
        },
        appendChild(child) {
          child.parentElement = el;
          elements.push(child);
          return child;
        },
        querySelector(selector) {
          if (selector === '.pet-body') {
            return el.bodyChild || null;
          }
          return null;
        },
        remove() {
          const idx = elements.indexOf(el);
          if (idx !== -1) elements.splice(idx, 1);
          const bIdx = body.children.indexOf(el);
          if (bIdx !== -1) body.children.splice(bIdx, 1);
        },
      };
      return el;
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector);
    },
    querySelector(selector) {
      return body.querySelector(selector);
    },
    getElementById(id) {
      return elements.find((el) => el.id === id) || null;
    },
  };

  body.ownerDocument = documentMock;

  return { documentMock, elements, body };
}

function createFakePet(id, x = 100, y = 100) {
  const { documentMock } = createFakeDom();
  const elem = documentMock.createElement('div');
  elem.bodyChild = documentMock.createElement('div');
  elem.bodyChild.className = 'pet-body';

  return {
    id,
    x,
    y,
    size: 100,
    state: 'idle',
    queuedAction: null,
    element: elem,
    setState(st) {
      this.state = st;
    },
  };
}

function createFakeElectronApi() {
  const listeners = new Map();
  const sentMessages = [];

  return {
    onScreensaverStart: (fn) => {
      listeners.set('start', fn);
      return () => listeners.delete('start');
    },
    onScreensaverStop: (fn) => {
      listeners.set('stop', fn);
      return () => listeners.delete('stop');
    },
    onScreensaverCancel: (fn) => {
      listeners.set('cancel', fn);
      return () => listeners.delete('cancel');
    },
    getAvailableOverlayKeys: async (skinId) => {
      if (skinId === 'custom_no_food') {
        return ['hug', 'kiss'];
      }
      return ['hug', 'shareFood', 'kiss', 'throwup', 'cultivate'];
    },
    notifyScreensaverReady: () => {
      sentMessages.push({ channel: 'ready' });
    },
    notifyScreensaverFinished: (sessionId) => {
      sentMessages.push({ channel: 'finished', sessionId });
    },
    emitStart: (payload) => listeners.get('start')?.(payload),
    emitStop: (payload) => listeners.get('stop')?.(payload),
    emitCancel: (payload) => listeners.get('cancel')?.(payload),
    sentMessages,
    listeners,
  };
}

test('SkinService & SkinManager - getAvailableOverlayKeys validation', async () => {
  const keysDefault = SkinService.getAvailableOverlayKeys('default');
  assert.ok(Array.isArray(keysDefault));
  assert.ok(keysDefault.includes('hug'));
  assert.ok(keysDefault.includes('kiss'));

  const skinManager = new SkinManager();
  const fakeApi = createFakeElectronApi();
  const keysViaManager = await skinManager.getAvailableOverlayKeys('custom_no_food', fakeApi);
  assert.deepEqual(keysViaManager, ['hug', 'kiss']);
});

test('ScreensaverSystem - display selection based on midpoint and gap fallback', () => {
  const petA = createFakePet('yueqi', 100, 200);
  const petB = createFakePet('shenjiu', 700, 200);

  const display1 = { displayId: 1, x: 0, y: 0, width: 500, height: 600, scaleRatio: 1.0 };
  const display2 = { displayId: 2, x: 600, y: 0, width: 500, height: 600, scaleRatio: 1.0 };

  const stageGeometry = {
    screenInfo: { walkAreas: [display1, display2] },
    getWalkAreaForPoint(x, y) {
      if (x >= display1.x && x <= display1.x + display1.width) return display1;
      if (x >= display2.x && x <= display2.x + display2.width) return display2;
      return null; // Gap
    },
  };

  const system = new ScreensaverSystem({
    getPets: () => [petA, petB],
    stageGeometry,
  });

  // Midpoint is at x = (150 + 750) / 2 = 450 (which is in the gap 500..600)
  // Fallback should select Yue Qi's area (display1)
  const bounds = system.computeSceneBounds();
  assert.ok(bounds);
  assert.equal(bounds.targetArea.displayId, 1);
});

test('ScreensaverSystem - centers the idle pair and scene on the selected walkArea', () => {
  const petA = createFakePet('yueqi', 120, 80);
  const petB = createFakePet('shenjiu', 760, 460);
  const walkArea = { displayId: 1, x: 100, y: 50, width: 800, height: 600, scaleRatio: 1.0 };
  const stageGeometry = new StageGeometry({ initialWidth: 1000, initialHeight: 700 });
  stageGeometry.applyScreenInfo({ width: 1000, height: 700, walkAreas: [walkArea] });
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    stageGeometry,
  });
  system.init();

  electronAPI.emitStart({ sessionId: 56, startedAt: Date.now() });

  const sharedLayout = stageGeometry.getCenteredPairLayout(petA, petB, walkArea);
  assert.deepEqual(system.sceneBounds.midpoint, { x: 500, y: 350 });
  assert.deepEqual(
    [
      { x: petA.x, y: petA.y, direction: petA.direction },
      { x: petB.x, y: petB.y, direction: petB.direction },
    ],
    sharedLayout.positions,
  );
  assert.ok(
    system.sceneBounds.particleBaseWidth >= (sharedLayout.bounds.right - sharedLayout.bounds.left) * 1.25,
    'pink atmosphere must expand around the shared break-reminder pair layout',
  );

  electronAPI.emitCancel({ sessionId: 56, reason: 'fullscreen' });
  assert.deepEqual(
    [{ x: petA.x, y: petA.y }, { x: petB.x, y: petB.y }],
    [{ x: 120, y: 80 }, { x: 760, y: 460 }],
  );
});

test('ScreensaverSystem - keeps the scaled pet pair visually centered on mixed DPI', () => {
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 900, 500);
  const walkArea = { displayId: 2, x: 0, y: 0, width: 1200, height: 900, scaleRatio: 1.5 };
  const stageGeometry = new StageGeometry({ initialWidth: 1200, initialHeight: 900 });
  stageGeometry.applyScreenInfo({ width: 1200, height: 900, walkAreas: [walkArea] });
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    stageGeometry,
  });
  system.init();

  electronAPI.emitStart({ sessionId: 57, startedAt: Date.now() });

  assert.equal(system.sceneBounds.visualScale, 1.5);
  const scaledPetSize = petA.size * walkArea.scaleRatio;
  const visualCenterA = petA.x + scaledPetSize / 2;
  const visualCenterB = petB.x + scaledPetSize / 2;
  assert.equal((visualCenterA + visualCenterB) / 2, system.sceneBounds.midpoint.x);
  assert.equal(petA.y + scaledPetSize / 2, system.sceneBounds.midpoint.y);
  assert.equal(petB.y + scaledPetSize / 2, system.sceneBounds.midpoint.y);
  assert.deepEqual(
    [
      { x: petA.x, y: petA.y, direction: petA.direction },
      { x: petB.x, y: petB.y, direction: petB.direction },
    ],
    [
      { x: 300, y: 375, direction: 'right' },
      { x: 750, y: 375, direction: 'left' },
    ],
  );
});

test('ScreensaverSystem - scene scale calculation and cancellation when space < 0.65', () => {
  const petA = createFakePet('yueqi', 50, 50);
  const petB = createFakePet('shenjiu', 100, 50);

  const tinyDisplay = { displayId: 99, x: 0, y: 0, width: 100, height: 100, scaleRatio: 1.0 };
  const stageGeometry = {
    screenInfo: { walkAreas: [tinyDisplay] },
    getWalkAreaForPoint() {
      return tinyDisplay;
    },
  };

  const system = new ScreensaverSystem({
    getPets: () => [petA, petB],
    stageGeometry,
  });

  const bounds = system.computeSceneBounds();
  assert.equal(bounds, null, 'Insufficient space (< 0.65) must return null');

  const electronAPI = createFakeElectronApi();
  const systemWithStart = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    stageGeometry,
  });
  systemWithStart.init();

  electronAPI.emitStart({ sessionId: 101, startedAt: Date.now() });
  assert.equal(systemWithStart.isActive(), false, 'Should cancel session on start if space insufficient');
  assert.equal(systemWithStart.state, 'inactive');
  assert.equal(systemWithStart.sessionId, 0);
});

test('ScreensaverSystem - DOM overlay creation with session attribute and no interaction-overlay collision', async () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 300, 100);

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    renderer: { stage: documentMock.body },
  });
  system.init();

  electronAPI.emitStart({ sessionId: 55, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  // Transition entering -> performing
  system.update(16);
  assert.equal(system.state, 'performing');
  await Promise.resolve();
  await Promise.resolve();

  // Next tick in performing triggers first overlay action ('hug')
  system.update(500);

  const overlayNodes = documentMock.querySelectorAll('[data-screensaver-session-id="55"]');
  assert.ok(overlayNodes.length > 0);

  const overlayImg = documentMock.querySelector('.screensaver-overlay-image');
  assert.ok(overlayImg);
  assert.equal(overlayImg.getAttribute('data-screensaver-session-id'), '55');

  // Verify global `interaction-overlay` ID was NEVER used
  const globalOverlay = documentMock.getElementById('interaction-overlay');
  assert.equal(globalOverlay, null, 'Must NEVER use or collide with global interaction-overlay ID');

  delete global.document;
});

test('ScreensaverSystem - caught state displays "被抓包" dialog bubbles above each pet', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;
  global.DIALOGUES = {
    screensaverCaught: {
      yueqi: ['好羞…😳', '咳咳…', '嘿嘿😳'],
      shenjiu: ['被发现了❗️', '…啧。', '…你怎么总挑这时候回来。'],
    },
  };

  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 300, 100);

  const bubbleCalls = [];
  const fakeDialogBubble = {
    show: (pet, text, duration) => bubbleCalls.push({ pet: pet.id, text, duration }),
    removeForPets: () => {},
    remove: () => {},
  };

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    renderer: { stage: documentMock.body },
    dialogBubble: fakeDialogBubble,
  });
  system.init();

  electronAPI.emitStart({ sessionId: 88, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  // User input stops session -> caught state
  electronAPI.emitStop({ sessionId: 88, reason: 'input' });
  assert.equal(system.state, 'caught');

  // Each pet must receive a dialog bubble with localized "被抓包" text.
  assert.equal(bubbleCalls.length, 2);
  assert.equal(bubbleCalls[0].pet, 'yueqi');
  assert.ok(global.DIALOGUES.screensaverCaught.yueqi.includes(bubbleCalls[0].text));
  assert.equal(bubbleCalls[1].pet, 'shenjiu');
  assert.ok(global.DIALOGUES.screensaverCaught.shenjiu.includes(bubbleCalls[1].text));
  assert.equal(bubbleCalls[0].duration, 800);
  assert.equal(bubbleCalls[1].duration, 800);

  // No CSS ! text node must be rendered.
  assert.equal(documentMock.querySelector('.screensaver-caught-text'), null);

  delete global.document;
  delete global.DIALOGUES;
});

test('ScreensaverSystem - combo sequence filtering missing skin assets', async () => {
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 300, 100);
  const electronAPI = createFakeElectronApi();

  const skinManager = {
    getCurrentSkin: () => 'custom_no_food',
    getAvailableOverlayKeys: async () => ['hug', 'kiss'],
  };

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    skinManager,
  });
  system.init();

  electronAPI.emitStart({ sessionId: 77, startedAt: Date.now() });
  system.update(16); // entering -> performing

  await system.prepareComboSequence();

  assert.deepEqual(system.activeComboSequence, ['hug', 'kiss'], 'Missing shareFood asset must be filtered out cleanly');
});

test('ScreensaverSystem - waits for async overlay validation before starting the combo', async () => {
  let resolveKeys;
  const availableKeys = new Promise((resolve) => {
    resolveKeys = resolve;
  });
  const electronAPI = createFakeElectronApi();
  const system = new ScreensaverSystem({
    electronAPI,
    skinManager: {
      getCurrentSkin: () => 'partial_skin',
      getAvailableOverlayKeys: () => availableKeys,
    },
  });
  system.init();

  electronAPI.emitStart({ sessionId: 78, startedAt: Date.now() });
  system.update(16);
  assert.equal(system.comboStepState, 'preparing');

  system.update(1000);
  assert.equal(system.state, 'performing');
  assert.equal(system.comboStepState, 'preparing');

  resolveKeys(['kiss']);
  await availableKeys;
  await Promise.resolve();

  assert.deepEqual(system.activeComboSequence, ['kiss']);
  assert.equal(system.comboStepState, 'idle_pause');

  system.update(500);
  assert.equal(system.comboStepState, 'overlay_action');
  assert.equal(system.comboIndex, 0);
});

test('ScreensaverSystem - uses the renderer stage document for overlays', () => {
  const { documentMock, body } = createFakeDom();
  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 300, 100);
  const previousDocument = global.document;
  delete global.document;

  try {
    const system = new ScreensaverSystem({
      electronAPI,
      getPets: () => [petA, petB],
      renderer: { stage: body },
    });
    system.init();
    electronAPI.emitStart({ sessionId: 79, startedAt: Date.now() });

    system.showScreensaverOverlay('hug');
    const overlay = body.children.find((child) => child.tagName === 'IMG');
    assert.ok(overlay);
  } finally {
    if (previousDocument === undefined) {
      delete global.document;
    } else {
      global.document = previousDocument;
    }
  }
});

test('ScreensaverSystem - runningBack clamps target points to active walkArea', () => {
  const petA = createFakePet('yueqi', 200, 200);
  const petB = createFakePet('shenjiu', 400, 200);

  const validWalkArea = { x: 0, y: 0, width: 500, height: 500 };
  const stageGeometry = {
    screenInfo: { walkAreas: [validWalkArea] },
    getWalkAreaForPoint(x, y) {
      if (x >= 0 && x <= 500 && y >= 0 && y <= 500) return validWalkArea;
      return null; // Out of bounds
    },
    clampToWalkAreas({ x, y }) {
      return {
        x: Math.max(0, Math.min(500, x)),
        y: Math.max(0, Math.min(500, y)),
      };
    },
  };

  const system = new ScreensaverSystem({
    getPets: () => [petA, petB],
    stageGeometry,
  });

  // Target points recorded during start are out-of-bounds (e.g. x = 900)
  system.startPositions = [{ x: 900, y: 200 }, { x: 400, y: 200 }];

  system.initRunningBack();

  assert.equal(system.runningBackTargetCoords[0].x, 500, 'Out of bounds target must be clamped to active walkArea');
  assert.equal(system.runningBackTargetCoords[1].x, 400);
});

test('ScreensaverSystem - reset safety calls interactionSystem.cancel and preserves queuedAction', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const electronAPI = createFakeElectronApi();
  let interactionCancelled = false;

  const petA = createFakePet('yueqi');
  petA.state = 'performing';
  petA.queuedAction = 'meditate';

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA],
    interactionSystem: {
      cancel: () => {
        interactionCancelled = true;
      },
    },
    renderer: { stage: documentMock.body },
  });
  system.init();

  electronAPI.emitStart({ sessionId: 33, startedAt: Date.now() });

  // Add dummy session DOM node
  const dummyOverlay = documentMock.createElement('div');
  dummyOverlay.setAttribute('data-screensaver-session-id', '33');
  documentMock.body.appendChild(dummyOverlay);

  assert.equal(documentMock.querySelectorAll('[data-screensaver-session-id]').length, 1);

  system.reset();

  assert.equal(interactionCancelled, true, 'interactionSystem.cancel() must be called on reset');
  assert.equal(petA.state, 'idle', 'Pet state must be reset to idle');
  assert.equal(petA.queuedAction, 'meditate', 'queuedAction must be strictly retained');
  assert.equal(documentMock.querySelectorAll('[data-screensaver-session-id]').length, 0, 'All session DOM nodes must be removed');

  delete global.document;
});

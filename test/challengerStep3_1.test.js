const assert = require('node:assert/strict');
const test = require('node:test');

const { ScreensaverSystem } = require('../src/systems/ScreensaverSystem');
const { SkinManager } = require('../src/systems/SkinManager');
const SkinService = require('../src/main/services/SkinService');

// Fake DOM Builder for Node environment
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
      const styleObj = {};
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

  return { documentMock, elements, body };
}

function createFakePet(id, x = 100, y = 100, size = 100) {
  const { documentMock } = createFakeDom();
  const elem = documentMock.createElement('div');
  elem.bodyChild = documentMock.createElement('div');
  elem.bodyChild.className = 'pet-body';

  return {
    id,
    x,
    y,
    size,
    width: size,
    height: size,
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
      if (skinId === 'empty_skin') {
        return [];
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

// ==========================================================
// Edge Case 1: Midpoint of pets falling in display gaps
// ==========================================================
test('CHALLENGE 1 - Midpoint in display gap falls back to Yue Qi walkArea', () => {
  const petA = createFakePet('yueqi', 100, 200, 100); // center (150, 250) in Display 1
  const petB = createFakePet('shenjiu', 700, 200, 100); // center (750, 250) in Display 2

  const display1 = { displayId: 1, x: 0, y: 0, width: 500, height: 600, scaleRatio: 1.0 };
  const display2 = { displayId: 2, x: 600, y: 0, width: 500, height: 600, scaleRatio: 1.0 };

  const stageGeometry = {
    screenInfo: { walkAreas: [display1, display2] },
    getWalkAreaForPoint(x, y) {
      if (x >= display1.x && x <= display1.x + display1.width) return display1;
      if (x >= display2.x && x <= display2.x + display2.width) return display2;
      return null; // Gap between 500 and 600
    },
  };

  const system = new ScreensaverSystem({
    getPets: () => [petA, petB],
    stageGeometry,
  });

  // Midpoint is (450, 250) -> in gap
  // Fallback selects Yue Qi's center (150, 250) -> display1
  const bounds = system.computeSceneBounds();
  assert.ok(bounds, 'Scene bounds should not be null when Yue Qi is in display1');
  assert.equal(bounds.targetArea.displayId, 1, 'Must fallback to Yue Qi (petA) walkArea');

  // Sub-case 1b: Both midpoint and Yue Qi in gap -> fallback to screenInfo.walkAreas[0]
  const stageGeometryGapAll = {
    screenInfo: { walkAreas: [display2] },
    getWalkAreaForPoint() { return null; },
  };
  const systemGapAll = new ScreensaverSystem({
    getPets: () => [petA, petB],
    stageGeometry: stageGeometryGapAll,
  });
  const boundsGapAll = systemGapAll.computeSceneBounds();
  assert.ok(boundsGapAll);
  assert.equal(boundsGapAll.targetArea.displayId, 2, 'Fallback to walkAreas[0] when both midpoint and petA return null');
});

// ==========================================================
// Edge Case 2: Display area scaling boundary cases
// ==========================================================
test('CHALLENGE 2 - Display area scaling boundary cases (0.64 -> cancel, 0.80 -> scaled)', () => {
  // Sub-case 2a: rawScale = 0.64 -> returns null & cancels with 'insufficient_space'
  // BASE_WIDTH = 320, PADDING_X = 40. For rawScaleX = 0.64: availWidth = 320 * 0.64 = 204.8 => targetArea.width = 244.8
  const smallDisplay = { displayId: 99, x: 0, y: 0, width: 244.8, height: 500, scaleRatio: 1.0 };
  const stageGeometrySmall = {
    screenInfo: { walkAreas: [smallDisplay] },
    getWalkAreaForPoint() { return smallDisplay; },
  };

  const petA = createFakePet('yueqi', 50, 50);
  const petB = createFakePet('shenjiu', 100, 50);
  const electronAPI = createFakeElectronApi();

  const systemSmall = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    stageGeometry: stageGeometrySmall,
  });
  systemSmall.init();

  const boundsSmall = systemSmall.computeSceneBounds();
  assert.equal(boundsSmall, null, 'rawScale = 0.64 (< 0.65) must return null');

  electronAPI.emitStart({ sessionId: 201, startedAt: Date.now() });
  assert.equal(systemSmall.isActive(), false, 'Session must cancel on insufficient space');
  assert.equal(systemSmall.state, 'inactive');

  const finishedMsg = electronAPI.sentMessages.find((m) => m.channel === 'finished' && m.sessionId === 201);
  assert.ok(finishedMsg, 'Cancelled session 201 must issue finished notification');

  // Sub-case 2b: rawScale = 0.80 -> scene scaled appropriately
  // BASE_WIDTH = 320, PADDING_X = 40. availWidth = 320 * 0.80 = 256 => targetArea.width = 296
  const mediumDisplay = { displayId: 100, x: 0, y: 0, width: 296, height: 500, scaleRatio: 1.0 };
  const stageGeometryMed = {
    screenInfo: { walkAreas: [mediumDisplay] },
    getWalkAreaForPoint() { return mediumDisplay; },
  };

  const systemMed = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    stageGeometry: stageGeometryMed,
  });
  systemMed.init();

  const boundsMed = systemMed.computeSceneBounds();
  assert.ok(boundsMed, 'rawScale = 0.80 must return valid scene bounds');
  assert.equal(Math.round(boundsMed.scaleRatio * 100) / 100, 0.80, 'Scale ratio should be 0.80');

  // Sub-case 2c: Boundary rawScale = 0.65 exactly
  // availWidth = 320 * 0.65 = 208 => width = 248
  const boundDisplay = { displayId: 101, x: 0, y: 0, width: 248, height: 500, scaleRatio: 1.0 };
  const stageGeometryBound = {
    screenInfo: { walkAreas: [boundDisplay] },
    getWalkAreaForPoint() { return boundDisplay; },
  };
  const systemBound = new ScreensaverSystem({
    getPets: () => [petA, petB],
    stageGeometry: stageGeometryBound,
  });
  const boundsBound = systemBound.computeSceneBounds();
  assert.ok(boundsBound, 'rawScale = 0.65 must NOT return null');
  assert.equal(boundsBound.scaleRatio, 0.65);
});

// ==========================================================
// Edge Case 3: Missing overlay keys in SkinService/SkinManager
// ==========================================================
test('CHALLENGE 3 - Missing overlay keys in SkinService/SkinManager skipped cleanly without image error callbacks', async () => {
  const electronAPI = createFakeElectronApi();
  const petA = createFakePet('yueqi', 100, 100);
  const petB = createFakePet('shenjiu', 300, 100);
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  // Mock SkinManager returning custom keys missing 'shareFood'
  const skinManager = {
    getCurrentSkin: () => 'custom_no_food',
    getAvailableOverlayKeys: async () => ['hug', 'kiss'],
  };

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    skinManager,
    renderer: { stage: documentMock.body },
  });
  system.init();

  electronAPI.emitStart({ sessionId: 301, startedAt: Date.now() });
  system.update(16); // entering -> performing

  // Wait for prepareComboSequence microtask resolution
  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(system.activeComboSequence, ['hug', 'kiss'], 'shareFood must be filtered from activeComboSequence');

  // Advance time through performing state
  system.update(500); // triggers 'hug' overlay
  let overlayImg = documentMock.querySelector('.screensaver-overlay-image');
  assert.ok(overlayImg);
  assert.equal(overlayImg.alt, 'hug');

  system.update(1500); // clear hug -> pause
  system.update(1000); // triggers 'kiss' overlay (shareFood skipped completely!)
  overlayImg = documentMock.querySelector('.screensaver-overlay-image');
  assert.ok(overlayImg);
  assert.equal(overlayImg.alt, 'kiss', 'Next overlay must be kiss (shareFood was skipped without error)');

  delete global.document;
});

// ==========================================================
// Edge Case 4: Interruption during entering or performing -> caught state
// ==========================================================
test('CHALLENGE 4 - Interruption during entering or performing -> caught state displays "被抓包" dialog bubbles', () => {
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

  // Test 4a: Interruption during entering
  electronAPI.emitStart({ sessionId: 401, startedAt: Date.now() });
  assert.equal(system.state, 'entering');

  electronAPI.emitStop({ sessionId: 401, reason: 'input' });
  assert.equal(system.state, 'caught');

  // Each pet must receive a dialog bubble on caught state.
  assert.equal(bubbleCalls.length, 2);
  const enteringYueqi = bubbleCalls.find((c) => c.pet === 'yueqi');
  const enteringShenjiu = bubbleCalls.find((c) => c.pet === 'shenjiu');
  assert.ok(enteringYueqi, 'Yueqi must receive a caught bubble');
  assert.ok(global.DIALOGUES.screensaverCaught.yueqi.includes(enteringYueqi.text));
  assert.equal(enteringYueqi.duration, 4000, 'Caught bubble must display for 4000ms (matching other features, visible after pets return home)');
  assert.ok(enteringShenjiu, 'Shenjiu must receive a caught bubble');
  assert.ok(global.DIALOGUES.screensaverCaught.shenjiu.includes(enteringShenjiu.text));
  assert.equal(enteringShenjiu.duration, 4000, 'Caught bubble must display for 4000ms (matching other features, visible after pets return home)');
  assert.equal(documentMock.querySelector('.screensaver-caught-text'), null, 'No CSS ! text node must exist');

  bubbleCalls.length = 0;
  system.reset();

  // Test 4b: Interruption during performing
  electronAPI.emitStart({ sessionId: 402, startedAt: Date.now() });
  system.update(16); // entering -> performing
  assert.equal(system.state, 'performing');

  electronAPI.emitStop({ sessionId: 402, reason: 'input' });
  assert.equal(system.state, 'caught');

  assert.equal(bubbleCalls.length, 2, 'Both pets must receive caught bubbles during performing interruption');

  delete global.document;
  delete global.DIALOGUES;
});

// ==========================================================
// Edge Case 5: runningBack state with target points out-of-bounds
// ==========================================================
test('CHALLENGE 5 - runningBack state with target points out-of-bounds clamped to active walkArea', () => {
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

  // Target points recorded at start are out-of-bounds (e.g. x = 950, y = 600)
  system.startPositions = [{ x: 950, y: 600 }, { x: 400, y: 200 }];

  system.initRunningBack();

  assert.equal(system.state, 'runningBack');
  assert.equal(system.runningBackTargetCoords[0].x, 500, 'Out of bounds target x (950) must be clamped to walkArea max x (500)');
  assert.equal(system.runningBackTargetCoords[0].y, 500, 'Out of bounds target y (600) must be clamped to walkArea max y (500)');
  assert.equal(system.runningBackTargetCoords[1].x, 400);

  // Update runningBack interpolation
  system.updateRunningBack(250); // halfway (t = 0.5)
  assert.equal(petA.x, 200 + (500 - 200) * 0.5); // 350

  system.updateRunningBack(250); // full (t = 1.0)
  assert.equal(petA.x, 500, 'Pet position should reach clamped target (500) within active walkArea');
});

// ==========================================================
// Edge Case 6: reset() verification
// ==========================================================
test('CHALLENGE 6 - reset() removes DOM nodes [data-screensaver-session-id], clears timers, calls interactionSystem.cancel(), resets pet state to "idle", preserves pet.queuedAction', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const electronAPI = createFakeElectronApi();
  let cancelCalled = false;

  const petA = createFakePet('yueqi', 100, 100);
  petA.state = 'performing';
  petA.queuedAction = 'eat_snack';

  const petB = createFakePet('shenjiu', 300, 100);
  petB.state = 'performing';
  petB.queuedAction = 'sleep_nap';

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    interactionSystem: {
      cancel: () => {
        cancelCalled = true;
      },
    },
    renderer: { stage: documentMock.body },
  });
  system.init();

  electronAPI.emitStart({ sessionId: 601, startedAt: Date.now() });

  // Add dummy elements matching data-screensaver-session-id
  const node1 = documentMock.createElement('img');
  node1.className = 'screensaver-overlay-image';
  node1.setAttribute('data-screensaver-session-id', '601');
  documentMock.body.appendChild(node1);

  const node2 = documentMock.createElement('div');
  node2.className = 'screensaver-caught-text';
  node2.setAttribute('data-screensaver-session-id', '601');
  node2.textContent = '!';
  documentMock.body.appendChild(node2);

  assert.equal(documentMock.querySelectorAll('[data-screensaver-session-id]').length, 2);

  // Manually modify timers to non-zero to test clearing
  system.stateTimer = 450;
  system.comboStepTimer = 300;

  system.reset();

  // Assertions
  assert.equal(documentMock.querySelectorAll('[data-screensaver-session-id]').length, 0, 'DOM nodes with data-screensaver-session-id must be completely removed');
  assert.equal(system.stateTimer, 0, 'stateTimer must be reset to 0');
  assert.equal(system.comboStepTimer, 0, 'comboStepTimer must be reset to 0');
  assert.equal(system.runningBackElapsed, 0, 'runningBackElapsed must be reset to 0');
  assert.equal(cancelCalled, true, 'interactionSystem.cancel() must be called on reset');
  assert.equal(petA.state, 'idle', 'petA state must be reset to idle');
  assert.equal(petB.state, 'idle', 'petB state must be reset to idle');
  assert.equal(petA.queuedAction, 'eat_snack', 'petA.queuedAction must be strictly preserved');
  assert.equal(petB.queuedAction, 'sleep_nap', 'petB.queuedAction must be strictly preserved');
  assert.equal(system.state, 'inactive');
  assert.equal(system.sessionId, 0);

  const finishedMsg = electronAPI.sentMessages.find((m) => m.channel === 'finished' && m.sessionId === 601);
  assert.ok(finishedMsg, 'notifyScreensaverFinished must be called for session 601');

  delete global.document;
});

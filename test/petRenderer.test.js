const assert = require('node:assert/strict');
const test = require('node:test');

const { PetRenderer } = require('../src/pet/PetRenderer');

function createFakeElement(initialClasses = []) {
  const classes = new Set(initialClasses);

  return {
    style: {},
    classList: {
      add(className) {
        classes.add(className);
      },
      remove(className) {
        classes.delete(className);
      },
      contains(className) {
        return classes.has(className);
      },
    },
  };
}

function createFakeDomElement() {
  const style = {};
  style.setProperty = (name, value) => {
    style[name] = value;
  };

  return {
    id: '',
    className: '',
    style,
    children: [],
    listeners: {},
    classList: {
      contains() {
        return false;
      },
      add() {},
      remove() {},
    },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    },
  };
}

function createFakeClassList(initialClasses = []) {
  const classes = new Set(initialClasses);
  return {
    add(className) {
      classes.add(className);
    },
    remove(className) {
      classes.delete(className);
    },
    contains(className) {
      return classes.has(className);
    },
    toggle(className, force) {
      const shouldAdd = force === undefined ? !classes.has(className) : Boolean(force);
      if (shouldAdd) classes.add(className);
      else classes.delete(className);
      return shouldAdd;
    },
  };
}

test('qi aura size follows the pet visual scale', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  }, null, () => 2 / 3);
  const pet = {
    x: 100,
    y: 100,
    size: 96,
  };

  global.document = {
    createElement() {
      return {
        style: {},
        addEventListener() {},
      };
    },
  };

  renderer.spawnQiAura(pet, 'feed');

  assert.equal(appended.length, 1);
  assert.equal(appended[0].style.left, `${pet.x + (pet.size * (2 / 3)) / 2}px`);
  assert.equal(appended[0].style.top, `${pet.y + (pet.size * (2 / 3)) / 2}px`);
  assert.equal(appended[0].style.width, `${Math.max(112, pet.size * 1.45) * (2 / 3)}px`);
  assert.equal(appended[0].style.height, `${Math.max(112, pet.size * 1.45) * (2 / 3)}px`);

  delete global.document;
});

test('pet hover keeps mouse events enabled until the cursor leaves', () => {
  const calls = [];
  const listeners = {};
  const appended = [];
  const bodyClassList = createFakeClassList();
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  });
  const pet = {
    id: 'yueqi',
    nickname: 'Yue Qi',
    image: 'assets/default/left.webp',
    x: 100,
    y: 100,
    size: 96,
    isDragging: false,
    isBusy() {
      return false;
    },
    setState() {},
  };

  global.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    electronAPI: {
      setIgnoreMouseEvents(ignore, options) {
        calls.push([ignore, options]);
      },
    },
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
  };
  global.document = {
    body: {
      classList: bodyClassList,
    },
    createElement() {
      return createFakeDomElement();
    },
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    getElementById() {
      return createFakeElement(['hidden']);
    },
  };

  try {
    renderer.createPetElement(pet);
    appended[0].listeners.mouseenter();
    assert.equal(bodyClassList.contains('weather-interaction-muted'), true);
    appended[0].listeners.mouseleave();

    assert.deepEqual(calls[0], [false, undefined]);
    assert.deepEqual(calls[1], [true, { forward: true }]);
    assert.equal(bodyClassList.contains('weather-interaction-muted'), false);
  } finally {
    delete global.window;
    delete global.document;
  }
});

test('pet image scale is exposed as a CSS variable', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  });
  const pet = {
    id: 'yueqi',
    nickname: 'Yue Qi',
    image: 'assets/animal_ears/left.webp',
    imageScale: 1.08,
    x: 100,
    y: 100,
    size: 96,
    state: 'idle',
    isDragging: false,
    isHungry() {
      return false;
    },
    isLowMood() {
      return false;
    },
    setState() {},
  };

  global.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    electronAPI: {
      setIgnoreMouseEvents() {},
    },
    addEventListener() {},
  };
  global.document = {
    body: {
      classList: createFakeClassList(),
    },
    createElement() {
      return createFakeDomElement();
    },
    addEventListener() {},
    getElementById() {
      return createFakeElement(['hidden']);
    },
  };

  try {
    renderer.createPetElement(pet);
    assert.equal(appended[0].style['--pet-image-scale'], 1.08);

    pet.imageScale = 1;
    renderer.update(pet);
    assert.equal(appended[0].style['--pet-image-scale'], 1);
  } finally {
    delete global.window;
    delete global.document;
  }
});

test('interaction overlay image follows the pet visual scale', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  }, null, () => 2 / 3);
  const petA = {
    x: 2600,
    y: 240,
    size: 96,
  };
  const petB = {
    x: 2680,
    y: 240,
    size: 96,
  };

  global.document = {
    createElement() {
      return {
        style: {},
      };
    },
  };
  global.requestAnimationFrame = (callback) => callback();

  const overlayPos = renderer.showOverlay(petA, petB, 'cultivate');

  assert.equal(appended.length, 1);
  assert.equal(appended[0].style.width, `${176 * (2 / 3)}px`);
  assert.equal(appended[0].style.left, `${overlayPos.x}px`);
  assert.equal(appended[0].style.top, `${overlayPos.y}px`);
  assert.equal(overlayPos.width, 176 * (2 / 3));
  assert.equal(overlayPos.baseWidth, 176);
  assert.equal(overlayPos.scale, 2 / 3);

  delete global.document;
  delete global.requestAnimationFrame;
});

test('interaction overlay bubbles follow the overlay visual scale', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  });
  const overlayPos = {
    x: 2600,
    y: 240,
    width: 176 * (2 / 3),
    scale: 2 / 3,
  };

  global.document = {
    createElement() {
      const style = {};
      style.setProperty = (name, value) => {
        style[name] = value;
      };
      return {
        className: '',
        textContent: '',
        style,
        classList: {
          add() {},
        },
        remove() {},
      };
    },
  };
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => {
    callback();
    return 1;
  };

  renderer.showOverlayBubbles('left', 'right', overlayPos, 1000);

  assert.equal(appended.length, 2);
  assert.equal(appended[0].style['--bubble-scale'], 2 / 3);
  assert.equal(appended[1].style['--bubble-scale'], 2 / 3);
  assert.equal(appended[0].style.bottom, `${600 - overlayPos.y + 16 * (2 / 3)}px`);
  assert.equal(appended[1].style.bottom, `${600 - overlayPos.y + 16 * (2 / 3)}px`);

  delete global.document;
  global.setTimeout = originalSetTimeout;
});

test('PetRenderer falls back to scale 1 for invalid visual and image scales', () => {
  const renderer = new PetRenderer(null, null, () => -2);

  assert.equal(renderer.getPetVisualScale({ imageScale: 0 }), 1);
  assert.equal(renderer.getPetImageScale({ imageScale: 'not-a-number' }), 1);
  assert.deepEqual(renderer.getPetVisualCenter({ x: 10, y: 20, size: 100, imageScale: 0 }), {
    x: 60,
    y: 70,
    scale: 1,
  });
});

test('createPetElement renders emoji pets and updates state classes', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  });
  const pet = {
    id: 'emoji',
    nickname: 'Emoji Pet',
    emoji: ':)',
    image: null,
    x: 10,
    y: 20,
    size: 96,
    state: 'idle',
    direction: 'right',
    imageScale: 1,
    isDragging: false,
    isHungry: () => true,
    isLowMood: () => true,
    setState() {},
  };

  global.window = {
    innerWidth: 800,
    innerHeight: 600,
    electronAPI: { setIgnoreMouseEvents() {} },
    addEventListener() {},
  };
  global.document = {
    body: { classList: createFakeClassList() },
    createElement() {
      const element = createFakeDomElement();
      element.classList = createFakeClassList();
      return element;
    },
    addEventListener() {},
    getElementById() {
      return createFakeElement(['hidden']);
    },
  };

  try {
    const el = renderer.createPetElement(pet);
    assert.equal(el.children[0].textContent, ':)');

    pet.state = 'sleeping';
    renderer.update(pet);

    assert.equal(el.classList.contains('pet--sleeping'), true);
    assert.equal(el.classList.contains('pet--hungry'), true);
    assert.equal(el.classList.contains('pet--low-mood'), true);

    pet.state = 'idle';
    pet.isHungry = () => false;
    pet.isLowMood = () => false;
    renderer.update(pet);

    assert.equal(el.classList.contains('pet--sleeping'), false);
    assert.equal(el.classList.contains('pet--hungry'), false);
    assert.equal(el.classList.contains('pet--low-mood'), false);
  } finally {
    delete global.window;
    delete global.document;
  }
});

test('spawnEffect creates three particles and removes them on animation end', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  }, null, () => 0.5);
  const originalDocument = global.document;
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  global.document = {
    createElement() {
      const element = createFakeDomElement();
      element.remove = () => {
        element.removed = true;
      };
      return element;
    },
  };

  try {
    renderer.spawnEffect({ x: 100, y: 100, size: 96 }, '*');

    assert.equal(appended.length, 3);
    assert.equal(appended[0].textContent, '*');
    assert.equal(appended[0].style.top, '90px');
    assert.equal(appended[0].style.fontSize, '12px');

    appended[0].listeners.animationend();
    assert.equal(appended[0].removed, true);
  } finally {
    global.document = originalDocument;
    Math.random = originalRandom;
  }
});

test('hideOverlay fades overlay and restores pet body visibility', () => {
  const renderer = new PetRenderer(null);
  const overlay = createFakeDomElement();
  overlay.style.opacity = '1';
  overlay.style.transform = 'scale(1)';
  overlay.remove = () => {
    overlay.removed = true;
  };
  const bodyA = { style: { visibility: 'hidden' } };
  const bodyB = { style: { visibility: 'hidden' } };
  const originalDocument = global.document;
  const originalSetTimeout = global.setTimeout;
  global.document = {
    getElementById(id) {
      return id === 'interaction-overlay' ? overlay : null;
    },
  };
  global.setTimeout = (callback) => {
    callback();
    return 1;
  };

  try {
    renderer.hideOverlay(
      { element: { querySelector: () => bodyA } },
      { element: { querySelector: () => bodyB } },
    );

    assert.equal(overlay.style.opacity, '0');
    assert.equal(overlay.style.transform, 'scale(0.92)');
    assert.equal(overlay.removed, true);
    assert.equal(bodyA.style.visibility, '');
    assert.equal(bodyB.style.visibility, '');
  } finally {
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
  }
});

test('hideOverlay clears overlay bubbles and cancels timers', () => {
  const clearedTimers = [];
  const activeBubbles = [];
  const stage = {
    appendChild(el) {
      if (el && typeof el.className === 'string' && el.className.includes('overlay-bubble')) {
        el.remove = () => {
          const idx = activeBubbles.indexOf(el);
          if (idx !== -1) activeBubbles.splice(idx, 1);
        };
        activeBubbles.push(el);
      }
    },
    querySelectorAll(selector) {
      return selector === '.overlay-bubble' ? [...activeBubbles] : [];
    }
  };
  const renderer = new PetRenderer(stage);

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalDocument = global.document;

  let timerIdCounter = 100;
  global.setTimeout = () => ++timerIdCounter;
  global.clearTimeout = (id) => clearedTimers.push(id);
  global.document = {
    createElement() {
      return { className: '', style: { setProperty() {} }, classList: { add() {} }, remove() {} };
    },
    getElementById() { return null; }
  };

  try {
    renderer.showOverlayBubbles('hello', 'world', { x: 0, y: 0, width: 100, scale: 1 }, 1000);
    assert.equal(renderer._overlayBubbleTimers.length, 4);
    assert.equal(activeBubbles.length, 2);

    renderer.hideOverlay({ element: null }, { element: null });
    assert.equal(clearedTimers.length, 4);
    assert.equal(renderer._overlayBubbleTimers.length, 0);
    assert.equal(activeBubbles.length, 0);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.document = originalDocument;
  }
});

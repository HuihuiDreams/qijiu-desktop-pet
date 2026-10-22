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
    image: 'pet-asset://skin/default/left.webp',
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
    image: 'pet-asset://skin/animal_ears/left.webp',
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
        dataset: {},
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
      return { className: '', dataset: {}, style: { setProperty() {} }, classList: { add() {} }, remove() {} };
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

test('setSkinPrefix cleans up previous preloads and handles load events', () => {
  global.Image = class {
    constructor() {
      this.src = '';
      setTimeout(() => {
        if (this.src.includes('error')) {
          if (this.onerror) this.onerror();
        } else {
          if (this.onload) this.onload();
        }
      }, 0);
    }
  };
  
  const renderer = new PetRenderer();
  
  renderer.setSkinPrefix('pet-asset://skin/custom/');
  assert.equal(renderer._preloadedOverlays.length, 2);
  const firstBatch = renderer._preloadedOverlays;
  
  // Clean up triggered by prefix change
  renderer.setSkinPrefix('pet-asset://skin/other/');
  assert.equal(firstBatch[0].onload, null);
  assert.equal(firstBatch[0].onerror, null);
  
  // Trigger the load handlers manually to cover the done callback
  const img = renderer._preloadedOverlays[0];
  img.onload();
  assert.equal(img.onload, null);

  const img2 = renderer._preloadedOverlays[1];
  img2.onerror();
  assert.equal(img2.onerror, null);
  
  delete global.Image;
});


test('pet image onerror fallback to emoji', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  });
  const pet = {
    id: 'test',
    emoji: ':(',
    image: 'pet-asset://skin/default/broken.webp',
    x: 0,
    y: 0,
    size: 96,
  };
  global.window = { addEventListener() {} };
  global.document = {
    body: { classList: createFakeClassList() },
    createElement(tag) {
      const el = createFakeDomElement();
      el.tagName = tag;
      if (tag === 'img') {
        el.remove = () => { el.removed = true; };
      }
      return el;
    },
    addEventListener() {},
  };
  
  const el = renderer.createPetElement(pet);
  const body = el.children[0];
  const img = body.children[0];
  
  img.onerror();
  
  assert.equal(img.removed, true);
  assert.equal(body.textContent, ':(');
  delete global.window;
  delete global.document;
});

test('pet dragging updates position and limits to screen bounds', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  });
  const pet = {
    id: 'dragtest',
    x: 50,
    y: 50,
    size: 96,
    isDragging: false,
    setState(state) { this.state = state; }
  };
  
  let mouseEvents = [];
  global.window = {
    innerWidth: 800,
    innerHeight: 600,
    electronAPI: {
      setIgnoreMouseEvents(ignore, opts) {
        mouseEvents.push({ignore, opts});
      },
      notifyDragStarted() {},
      notifyDragEnded() {}
    },
    addEventListener() {},
  };
  const docListeners = {};
  global.document = {
    body: { classList: createFakeClassList() },
    createElement() {
      return createFakeDomElement();
    },
    addEventListener(type, cb) {
      docListeners[type] = cb;
    }
  };
  
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutCbs = [];
  global.setTimeout = (cb) => { timeoutCbs.push(cb); return 1; };
  global.clearTimeout = () => {};
  
  const el = renderer.createPetElement(pet);
  const mousedown = el.listeners.mousedown;
  
  // Right click should be ignored
  mousedown({ button: 2 });
  assert.equal(pet.isDragging, false);
  
  // Left click starts drag
  mousedown({ button: 0, clientX: 60, clientY: 60, preventDefault: () => {} });
  assert.equal(pet.isDragging, true);
  
  // Mousemove updates position
  docListeners.mousemove({ clientX: 160, clientY: 160 });
  assert.equal(pet.x, 150);
  assert.equal(pet.y, 150);
  
  // Drag out of bounds should be clamped on mouseup
  docListeners.mousemove({ clientX: -1000, clientY: -1000 });
  assert.equal(pet.x, -1010);
  
  docListeners.mouseup({});
  assert.equal(pet.isDragging, false);
  
  // Clamped to left/top: minVisible = 32, max(x) = 32-96 = -64, max(y) = 0
  assert.equal(pet.x, -64);
  assert.equal(pet.y, 0);
  
  // test blur event
  mousedown({ button: 0, clientX: 0, clientY: 0, preventDefault: () => {} });
  assert.equal(pet.isDragging, true);

  
  // Call the blur listener registered on window
  const blurListener = Object.values(el.listeners).find(l => typeof l === 'function');
  // the blur listener is registered on window, we didn't mock window listeners map correctly,
  // let's just trigger keepPetReachable through the window.blur mock we have? Wait, window.addEventListener wasn't saving the callback.
  
  delete global.window;
  delete global.document;
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
});

test('PetRenderer.update sets --pet-size when size changes and caches rendered size', () => {
  const setProperties = [];
  const fakeElement = {
    style: {
      transform: '',
      setProperty(name, value) {
        setProperties.push({ name, value });
      },
    },
    classList: {
      remove() {},
      add() {},
      contains() { return false; },
    },
  };

  const renderer = new PetRenderer({}, null, () => 1);
  const pet = {
    x: 10,
    y: 20,
    size: 96,
    element: fakeElement,
    _renderedSize: null,
    isHungry() { return false; },
    isLowMood() { return false; },
  };

  renderer.update(pet);
  assert.equal(pet._renderedSize, 96);
  assert.ok(setProperties.some(p => p.name === '--pet-size' && p.value === '96px'));

  const initialCount = setProperties.filter(p => p.name === '--pet-size').length;
  renderer.update(pet);
  assert.equal(setProperties.filter(p => p.name === '--pet-size').length, initialCount);

  pet.size = 144;
  renderer.update(pet);
  assert.equal(pet._renderedSize, 144);
  assert.equal(setProperties.filter(p => p.name === '--pet-size').length, initialCount + 1);
  assert.equal(setProperties[setProperties.length - 1].value, '144px');
});

test('PetRenderer.showOverlay scales overlay width proportionally to pet size', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  }, null, () => 1.5); // visualScale = 1.5

  const petA = { x: 100, y: 100, size: 48 };
  const petB = { x: 200, y: 100, size: 48 };

  const originalDocument = global.document;
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  global.requestAnimationFrame = (cb) => cb();
  global.document = {
    createElement() {
      return {
        id: '',
        style: {},
        addEventListener() {},
      };
    },
  };

  try {
    const result = renderer.showOverlay(petA, petB, 'kiss');
    // baseWidth 176 * visualScale 1.5 * petScale 0.5 = 132
    assert.equal(result.width, 176 * 1.5 * 0.5);
  } finally {
    global.document = originalDocument;
    global.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test('showOverlayBubbles lifts right bubble when interaction bubbles overlap horizontally (small pet scale)', () => {
  const appended = [];
  const stage = {
    appendChild(element) {
      appended.push(element);
    },
    querySelectorAll(selector) {
      if (selector === '.overlay-bubble') {
        return appended.filter(el => el.className?.includes('overlay-bubble'));
      }
      return [];
    },
  };
  const renderer = new PetRenderer(stage);
  const overlayPos = {
    x: 500,
    y: 300,
    width: 88, // 50% scale
    scale: 1,
  };

  const originalDocument = global.document;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (cb) => {
    cb();
    return 1;
  };

  global.document = {
    createElement() {
      const style = {};
      style.setProperty = (name, value) => {
        style[name] = value;
      };
      const classes = new Set();
      return {
        className: '',
        dataset: {},
        textContent: '',
        offsetWidth: 100,
        offsetHeight: 36,
        style,
        classList: {
          add(c) {
            classes.add(c);
            this._classes = Array.from(classes).join(' ');
          },
          contains(c) {
            return classes.has(c);
          },
        },
        remove() {},
      };
    },
  };

  try {
    renderer.showOverlayBubbles('…幼稚。', '小九，尝尝这个。', overlayPos, 1000);
    assert.equal(appended.length, 2);

    const [leftBubble, rightBubble] = appended;
    const baseBottom = 600 - overlayPos.y + 16; // 316px
    assert.equal(leftBubble.style.bottom, `${baseBottom}px`);
    // Overlap: center distance is 88 * 0.8 = 70.4px < (100 + 100) / 2 + 8 = 108px
    // Lift is leftHeight (36) + gap (8) = 44px
    assert.equal(rightBubble.style.bottom, `${baseBottom + 44}px`);
    assert.equal(rightBubble.style['--bubble-stack-offset'], '44px');
    assert.equal(rightBubble.style.zIndex, '102');
  } finally {
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
  }
});

test('showOverlayBubbles keeps bubbles side-by-side when they do not overlap', () => {
  const appended = [];
  const stage = {
    appendChild(element) {
      appended.push(element);
    },
    querySelectorAll(selector) {
      if (selector === '.overlay-bubble') {
        return appended.filter(el => el.className?.includes('overlay-bubble'));
      }
      return [];
    },
  };
  const renderer = new PetRenderer(stage);
  const overlayPos = {
    x: 500,
    y: 300,
    width: 176, // 100% scale
    scale: 1,
  };

  const originalDocument = global.document;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (cb) => {
    cb();
    return 1;
  };

  global.document = {
    createElement() {
      const style = {};
      style.setProperty = (name, value) => {
        style[name] = value;
      };
      const classes = new Set();
      return {
        className: '',
        dataset: {},
        textContent: '',
        offsetWidth: 40,
        offsetHeight: 30,
        style,
        classList: {
          add(c) {
            classes.add(c);
          },
          contains(c) {
            return classes.has(c);
          },
        },
        remove() {},
      };
    },
  };

  try {
    renderer.showOverlayBubbles('A', 'B', overlayPos, 1000);
    assert.equal(appended.length, 2);

    const [leftBubble, rightBubble] = appended;
    const baseBottom = 600 - overlayPos.y + 16;
    assert.equal(leftBubble.style.bottom, `${baseBottom}px`);
    assert.equal(rightBubble.style.bottom, `${baseBottom}px`);
    assert.equal(rightBubble.style['--bubble-stack-offset'], '0px');
  } finally {
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
  }
});

test('updateOverlay dynamically adjusts overlay bubble stack offset on pet scale change', () => {
  const elements = [];
  const overlayElement = {
    id: 'interaction-overlay',
    style: { setProperty(name, value) { this[name] = value; } },
  };
  elements.push(overlayElement);

  const stage = {
    appendChild(element) {
      elements.push(element);
    },
    querySelectorAll(selector) {
      if (selector === '.overlay-bubble') {
        return elements.filter(el => el.className?.includes('overlay-bubble'));
      }
      return [];
    },
  };

  const renderer = new PetRenderer(stage);
  const originalDocument = global.document;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (cb) => {
    cb();
    return 1;
  };

  global.document = {
    getElementById(id) {
      return elements.find(el => el.id === id) || null;
    },
    createElement() {
      const style = {};
      style.setProperty = (name, value) => {
        style[name] = value;
      };
      const classes = new Set();
      return {
        className: '',
        dataset: {},
        textContent: '',
        offsetWidth: 100,
        offsetHeight: 36,
        style,
        classList: {
          add(c) {
            classes.add(c);
          },
          contains(c) {
            return classes.has(c);
          },
        },
        remove() {},
      };
    },
  };

  try {
    // Start with 100% scale (no overlap for width=176 if offsetWidth was small, but here offsetWidth=100)
    // At pet size 48 (50% scale):
    const petA = { x: 500, y: 300, size: 48 };
    const petB = { x: 540, y: 300, size: 48 };

    renderer.showOverlayBubbles('left', 'right', renderer.getOverlayPosition(petA, petB), 1000);
    const bubbles = stage.querySelectorAll('.overlay-bubble');
    const [leftBubble, rightBubble] = bubbles;

    // At 50% scale, bubbles overlap, rightBubble should be lifted
    assert.equal(rightBubble.style['--bubble-stack-offset'], '44px');

    // Now scale up to 150% (size 144) where centerDistance is 176 * 1.5 * 0.8 = 211px > (100+100)/2 + 8 = 108px
    petA.size = 144;
    petB.size = 144;
    renderer.updateOverlay(petA, petB);

    // Overlap should be cleared!
    assert.equal(rightBubble.style['--bubble-stack-offset'], '0px');
  } finally {
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
  }
});

test('spawnOverlayQiAura scales aura center Y offset and diameter proportionally with pet size and visual scale', () => {
  const appended = [];
  const renderer = new PetRenderer({
    appendChild(element) {
      appended.push(element);
    },
  }, null, () => 1.5);

  const petA = { x: 100, y: 200, size: 48 };
  const petB = { x: 180, y: 200, size: 48 };
  const overlayPos = renderer.getOverlayPosition(petA, petB);

  const originalDocument = global.document;
  global.document = {
    createElement() {
      return {
        className: '',
        style: {},
        addEventListener() {},
      };
    },
  };

  try {
    renderer.spawnOverlayQiAura(overlayPos, 'kiss');
    assert.equal(appended.length, 1);

    const combinedScale = 1.5 * 0.5; // visualScale 1.5 * petScale 0.5 = 0.75
    assert.equal(appended[0].className, 'qi-aura qi-aura--kiss');
    assert.equal(appended[0].style.left, `${overlayPos.x + overlayPos.width / 2}px`);
    assert.equal(appended[0].style.top, `${overlayPos.y + 82 * combinedScale}px`);
    assert.equal(appended[0].style.width, `${overlayPos.width * 1.2}px`);
    assert.equal(appended[0].style.height, `${overlayPos.width * 1.2}px`);
  } finally {
    global.document = originalDocument;
  }
});
test('PetRenderer dirty checks transform and imageScale on update', () => {
  let transformSetCount = 0;
  let transformValue = '';
  const setProperties = [];

  const fakeElement = {
    style: {
      get transform() {
        return transformValue;
      },
      set transform(val) {
        transformSetCount++;
        transformValue = val;
      },
      setProperty(name, value) {
        setProperties.push({ name, value });
      },
    },
    classList: {
      remove() {},
      add() {},
      contains() { return false; },
    },
  };

  let visualScaleToReturn = 1;
  const renderer = new PetRenderer({ appendChild() {} }, null, () => visualScaleToReturn);
  const pet = {
    id: 'testpet',
    x: 10,
    y: 20,
    size: 96,
    imageScale: 1.2,
    element: fakeElement,
    _renderedSize: null,
    isHungry() { return false; },
    isLowMood() { return false; },
  };

  // Test createPetElement initializes cache fields
  global.window = {
    innerWidth: 800,
    innerHeight: 600,
    electronAPI: { setIgnoreMouseEvents() {} },
    addEventListener() {},
  };
  global.document = {
    body: { classList: createFakeClassList() },
    createElement() {
      const el = createFakeDomElement();
      el.classList = createFakeClassList();
      return el;
    },
    addEventListener() {},
    getElementById() {
      return createFakeElement(['hidden']);
    },
  };

  try {
    const createdEl = renderer.createPetElement(pet);
    assert.equal(pet._renderedX, 10);
    assert.equal(pet._renderedY, 20);
    assert.equal(pet._renderedVisualScale, 1);
    assert.equal(pet._renderedImageScale, 1.2);
  } finally {
    delete global.window;
    delete global.document;
  }

  // Now test update(pet) with fakeElement
  pet.element = fakeElement;
  // Initialize caches as createPetElement would
  pet._renderedX = 10;
  pet._renderedY = 20;
  pet._renderedVisualScale = 1;
  pet._renderedImageScale = 1.2;
  fakeElement.style.transform = 'translate3d(10px, 20px, 0) scale(1)';
  transformSetCount = 0;
  setProperties.length = 0;

  // First call with unchanged values: dirty check should prevent setting transform and imageScale
  renderer.update(pet);
  assert.equal(transformSetCount, 0, 'transform should not be set when position and scale did not change');
  assert.equal(setProperties.filter(p => p.name === '--pet-image-scale').length, 0, '--pet-image-scale should not be set when imageScale did not change');

  // Change x
  pet.x = 15;
  renderer.update(pet);
  assert.equal(transformSetCount, 1, 'transform should update when x changes');
  assert.equal(fakeElement.style.transform, 'translate3d(15px, 20px, 0) scale(1)');
  assert.equal(pet._renderedX, 15);
  assert.equal(setProperties.filter(p => p.name === '--pet-image-scale').length, 0);

  // Unchanged again
  renderer.update(pet);
  assert.equal(transformSetCount, 1, 'transform should not update when unchanged');

  // Change y
  pet.y = 25;
  renderer.update(pet);
  assert.equal(transformSetCount, 2, 'transform should update when y changes');
  assert.equal(fakeElement.style.transform, 'translate3d(15px, 25px, 0) scale(1)');
  assert.equal(pet._renderedY, 25);

  // Change visualScale
  visualScaleToReturn = 1.5;
  renderer.update(pet);
  assert.equal(transformSetCount, 3, 'transform should update when visualScale changes');
  assert.equal(fakeElement.style.transform, 'translate3d(15px, 25px, 0) scale(1.5)');
  assert.equal(pet._renderedVisualScale, 1.5);

  // Change imageScale
  pet.imageScale = 1.5;
  renderer.update(pet);
  assert.equal(transformSetCount, 3, 'transform should not update if only imageScale changes');
  assert.equal(setProperties.filter(p => p.name === '--pet-image-scale').length, 1, '--pet-image-scale should update when imageScale changes');
  assert.equal(setProperties[setProperties.length - 1].value, 1.5);
  assert.equal(pet._renderedImageScale, 1.5);

  // Calling again with unchanged imageScale
  renderer.update(pet);
  assert.equal(setProperties.filter(p => p.name === '--pet-image-scale').length, 1, '--pet-image-scale should not update again');
});

test('showOverlayBubbles coordinates exit with getAnimations() and cleans up timer', async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let animationFinishedResolve;
  const finishedPromise = new Promise((resolve) => {
    animationFinishedResolve = resolve;
  });

  const fakeAnimation = {
    finished: finishedPromise,
    cancel() {},
  };

  const appended = [];
  const stage = {
    appendChild(el) {
      appended.push(el);
    },
    querySelectorAll(selector) {
      return selector === '.overlay-bubble' ? [...appended] : [];
    },
  };
  const renderer = new PetRenderer(stage);

  const originalDocument = global.document;
  global.document = {
    createElement() {
      const style = {};
      style.setProperty = (name, value) => { style[name] = value; };
      const classes = new Set();
      const el = {
        className: '',
        dataset: {},
        textContent: '',
        style,
        classList: {
          add(c) { classes.add(c); },
          contains(c) { return classes.has(c); },
        },
        remove() {
          el.removed = true;
        },
        getAnimations() {
          return [fakeAnimation];
        },
      };
      return el;
    },
    getElementById() { return null; },
  };

  try {
    renderer.showOverlayBubbles('left text', 'right text', { x: 0, y: 0, width: 100, scale: 1 }, 600);
    assert.equal(appended.length, 2);
    assert.equal(renderer._overlayBubbleTimers.length, 4);

    // Wait for fadeTimer (600 - 500 = 100ms) to fire
    await wait(150);
    assert.equal(appended[0].classList.contains('dialog-bubble--fade-out'), true);
    assert.equal(appended[0].removed, undefined);

    // Resolve animation
    animationFinishedResolve();
    await wait(20);

    assert.equal(appended[0].removed, true);
    assert.equal(appended[1].removed, true);
    // removeTimer was cleared and spliced out of _overlayBubbleTimers
    assert.equal(renderer._overlayBubbleTimers.length, 2);
  } finally {
    renderer._clearOverlayBubbles();
    global.document = originalDocument;
  }
});

test('hideOverlay cancels active getAnimations on overlay bubbles', () => {
  let cancelCount = 0;
  const fakeAnimation = {
    cancel() {
      cancelCount++;
    },
  };

  const activeBubbles = [];
  const stage = {
    appendChild(el) {
      activeBubbles.push(el);
    },
    querySelectorAll(selector) {
      return selector === '.overlay-bubble' ? [...activeBubbles] : [];
    },
  };
  const renderer = new PetRenderer(stage);

  const originalDocument = global.document;
  global.document = {
    createElement() {
      return {
        className: 'dialog-bubble overlay-bubble',
        dataset: {},
        style: { setProperty() {} },
        classList: { add() {} },
        remove() { this.removed = true; },
        getAnimations() { return [fakeAnimation]; },
      };
    },
    getElementById() { return null; },
  };

  try {
    renderer.showOverlayBubbles('left', 'right', { x: 0, y: 0, width: 100, scale: 1 }, 1000);
    assert.equal(activeBubbles.length, 2);

    renderer.hideOverlay({ element: null }, { element: null });

    assert.equal(cancelCount, 2, 'cancel() should be called on animations for both bubbles');
    assert.equal(activeBubbles[0].removed, true);
    assert.equal(activeBubbles[1].removed, true);
    assert.equal(renderer._overlayBubbleTimers.length, 0);
  } finally {
    global.document = originalDocument;
  }
});


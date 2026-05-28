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
  return {
    id: '',
    className: '',
    style: {},
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
    appended[0].listeners.mouseleave();

    assert.deepEqual(calls[0], [false, undefined]);
    assert.deepEqual(calls[1], [true, { forward: true }]);
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
  assert.equal(appended[0].style.bottom, `${600 - overlayPos.y + 48 * (2 / 3)}px`);
  assert.equal(appended[1].style.bottom, `${600 - overlayPos.y + 48 * (2 / 3)}px`);

  delete global.document;
  global.setTimeout = originalSetTimeout;
});

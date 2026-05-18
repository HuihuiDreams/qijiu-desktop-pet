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

test('walking state clears stale flipped class when direction did not change', () => {
  const renderer = new PetRenderer(null);
  const element = createFakeElement(['pet--flipped']);
  const pet = {
    x: 100,
    y: 100,
    state: 'walking',
    direction: 'right',
    defaultDirection: 'left',
    _renderedState: 'idle',
    _renderedDirection: 'right',
    _renderedHungry: false,
    _renderedLowMood: false,
    isHungry: () => false,
    isLowMood: () => false,
    element,
  };

  renderer.update(pet);

  assert.equal(element.classList.contains('pet--flipped'), false);
  assert.equal(element.classList.contains('pet--walking'), true);
});

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
  assert.equal(appended[0].style.top, `${overlayPos.y - 48 * (2 / 3)}px`);
  assert.equal(appended[1].style.top, `${overlayPos.y - 48 * (2 / 3)}px`);

  delete global.document;
  global.setTimeout = originalSetTimeout;
});

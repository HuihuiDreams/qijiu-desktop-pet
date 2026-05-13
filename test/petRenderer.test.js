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

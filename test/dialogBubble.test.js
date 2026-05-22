const assert = require('node:assert/strict');
const test = require('node:test');

const { DialogBubble } = require('../src/ui/DialogBubble');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFakeElement() {
  const classes = new Set();
  const element = {
    children: [],
    classList: {
      add(className) {
        classes.add(className);
      },
      contains(className) {
        return classes.has(className);
      },
    },
    appendChild(child) {
      child.parentElement = element;
      element.children.push(child);
    },
    remove() {
      element.removed = true;
    },
  };
  return element;
}

function withFakeDocument(run) {
  const originalDocument = global.document;
  global.document = {
    createElement() {
      const element = createFakeElement();
      element.style = {};
      element.remove = function remove() {
        element.removed = true;
        if (element.parentElement) {
          element.parentElement.children = element.parentElement.children.filter((child) => child !== element);
        }
      };
      return element;
    },
  };

  try {
    return run();
  } finally {
    global.document = originalDocument;
  }
}

test('stale bubble timers do not remove a newer bubble for the same pet', async () => {
  await withFakeDocument(async () => {
    const dialogBubble = new DialogBubble();
    const pet = { id: 'yueqi', element: createFakeElement() };

    dialogBubble.show(pet, 'old bubble', 20);
    const oldBubble = dialogBubble.activeBubbles.get(pet.id);

    dialogBubble.show(pet, 'new bubble', 1000);
    const newBubble = dialogBubble.activeBubbles.get(pet.id);

    await wait(30);

    assert.equal(oldBubble.removed, true);
    assert.equal(dialogBubble.activeBubbles.get(pet.id), newBubble);
    assert.equal(newBubble.removed, undefined);
  });
});

test('removeForPets hides personal bubbles for both pets before interaction bubbles render', () => {
  withFakeDocument(() => {
    const dialogBubble = new DialogBubble();
    const yueqi = { id: 'yueqi', element: createFakeElement() };
    const shenjiu = { id: 'shenjiu', element: createFakeElement() };

    dialogBubble.show(yueqi, 'personal yueqi', 1000);
    dialogBubble.show(shenjiu, 'personal shenjiu', 1000);

    dialogBubble.removeForPets([yueqi, shenjiu]);

    assert.equal(dialogBubble.activeBubbles.has('yueqi'), false);
    assert.equal(dialogBubble.activeBubbles.has('shenjiu'), false);
    assert.equal(yueqi.element.children.length, 0);
    assert.equal(shenjiu.element.children.length, 0);
  });
});

test('remove clears scheduled bubble timers', () => {
  withFakeDocument(() => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    let nextTimerId = 1;
    const clearedTimers = [];

    global.setTimeout = () => nextTimerId++;
    global.clearTimeout = (timerId) => clearedTimers.push(timerId);

    try {
      const dialogBubble = new DialogBubble();
      const pet = { id: 'yueqi', element: createFakeElement() };

      dialogBubble.show(pet, 'temporary bubble', 1000);
      assert.equal(dialogBubble.activeBubbleTimers.has(pet.id), true);

      dialogBubble.remove(pet.id);

      assert.deepEqual(clearedTimers, [1, 2]);
      assert.equal(dialogBubble.activeBubbleTimers.has(pet.id), false);
      assert.equal(dialogBubble.activeBubbles.has(pet.id), false);
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });
});

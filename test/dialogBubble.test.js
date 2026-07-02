const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { DialogBubble } = require('../src/ui/DialogBubble');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFakeElement(rect = null) {
  const classes = new Set();
  const style = {};
  style.setProperty = (name, value) => {
    style[name] = value;
  };
  const element = {
    children: [],
    style,
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
  if (rect) {
    element.getBoundingClientRect = () => rect;
  }
  return element;
}

function withFakeDocument(run, createElement = createFakeElement) {
  const originalDocument = global.document;
  global.document = {
    createElement() {
      const element = createElement();
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

test('personal dialog bubbles wrap long English text', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'dialog-bubble.css'), 'utf8');
  const rule = css.match(/\.dialog-bubble\s*\{[^}]+\}/s)?.[0] || '';

  assert.match(rule, /width:\s*max-content/);
  assert.match(rule, /max-width:\s*min\(/);
  assert.match(rule, /white-space:\s*pre-wrap/);
  assert.match(rule, /overflow-wrap:\s*break-word/);
});

test('showInteraction lifts overlapping greet bubbles', () => {
  const bubbleRects = [
    { left: 100, right: 260, top: 100, bottom: 150 },
    { left: 170, right: 330, top: 110, bottom: 160 },
  ];

  withFakeDocument(() => {
    const originalDialogues = global.DIALOGUES;
    const originalConfig = global.CONFIG;
    const originalRandom = Math.random;
    global.DIALOGUES = {
      greet: {
        yueqi: ['Xiao-Jiu, are you also here?'],
        shenjiu: ['Hmph. Why are you everywhere?'],
      },
    };
    global.CONFIG = { INTERACTION_DURATION: 4000 };
    Math.random = () => 0;

    const dialogBubble = new DialogBubble();
    const yueqi = { id: 'yueqi', element: createFakeElement() };
    const shenjiu = { id: 'shenjiu', element: createFakeElement() };

    try {
      dialogBubble.showInteraction(yueqi, shenjiu, 'greet');
    } finally {
      global.DIALOGUES = originalDialogues;
      global.CONFIG = originalConfig;
      Math.random = originalRandom;
    }

    const secondBubble = dialogBubble.activeBubbles.get('shenjiu');
    assert.equal(secondBubble.style['--bubble-stack-offset'], '68px');
  }, () => createFakeElement(bubbleRects.shift()));
});

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

test('show removes an existing bubble and safely returns when the pet has no element', () => {
  withFakeDocument(() => {
    const dialogBubble = new DialogBubble();
    const pet = { id: 'yueqi', element: createFakeElement() };

    dialogBubble.show(pet, 'visible', 1000);
    const firstBubble = dialogBubble.activeBubbles.get(pet.id);

    pet.element = null;
    dialogBubble.show(pet, 'hidden', 1000);

    assert.equal(firstBubble.removed, true);
    assert.equal(dialogBubble.activeBubbles.has(pet.id), false);
  });
});

test('show applies horizontal offset when rendering interaction bubbles', () => {
  withFakeDocument(() => {
    const dialogBubble = new DialogBubble();
    const pet = { id: 'yueqi', element: createFakeElement() };

    dialogBubble.show(pet, 'offset bubble', 1000, 24);

    const bubble = dialogBubble.activeBubbles.get(pet.id);
    assert.equal(bubble.textContent, 'offset bubble');
    assert.equal(bubble.style.left, 'calc(50% + 24px)');
  });
});

test('showIdleChatter prefers weather chatter when the weather roll succeeds', () => {
  withFakeDocument(() => {
    const originalDialogues = global.DIALOGUES;
    const originalRandom = Math.random;
    global.DIALOGUES = {
      idle: { yueqi: ['idle text'] },
      weather_rain: { yueqi: ['rain text'] },
    };
    Math.random = () => 0;

    try {
      const dialogBubble = new DialogBubble();
      const pet = { id: 'yueqi', weatherKind: 'rain', element: createFakeElement() };

      dialogBubble.showIdleChatter(pet);

      assert.equal(dialogBubble.activeBubbles.get(pet.id).textContent, 'rain text');
    } finally {
      global.DIALOGUES = originalDialogues;
      Math.random = originalRandom;
    }
  });
});

test('showIdleChatter can use wind and thunderstorm weather chatter', () => {
  withFakeDocument(() => {
    const originalDialogues = global.DIALOGUES;
    const originalRandom = Math.random;
    global.DIALOGUES = {
      idle: { yueqi: ['idle text'], shenjiu: ['idle shenjiu'] },
      weather_windy: { yueqi: ['wind text'] },
      weather_thunderstorm: { shenjiu: ['thunder text'] },
    };
    Math.random = () => 0;

    try {
      const dialogBubble = new DialogBubble();
      const yueqi = { id: 'yueqi', weatherKind: 'windy', element: createFakeElement() };
      const shenjiu = { id: 'shenjiu', weatherKind: 'thunderstorm', element: createFakeElement() };

      dialogBubble.showIdleChatter(yueqi);
      dialogBubble.showIdleChatter(shenjiu);

      assert.equal(dialogBubble.activeBubbles.get(yueqi.id).textContent, 'wind text');
      assert.equal(dialogBubble.activeBubbles.get(shenjiu.id).textContent, 'thunder text');
    } finally {
      global.DIALOGUES = originalDialogues;
      Math.random = originalRandom;
    }
  });
});

test('showStatWarning renders the first matching low-stat warning', () => {
  withFakeDocument(() => {
    const originalDialogues = global.DIALOGUES;
    const originalRandom = Math.random;
    global.DIALOGUES = {
      hungry: { yueqi: ['hungry text'] },
      lowQi: { yueqi: ['low qi text'] },
      lowMood: { yueqi: ['low mood text'] },
    };
    Math.random = () => 0;

    try {
      const dialogBubble = new DialogBubble();
      const pet = {
        id: 'yueqi',
        element: createFakeElement(),
        isHungry: () => false,
        isLowQi: () => true,
        isLowMood: () => true,
      };

      dialogBubble.showStatWarning(pet);

      assert.equal(dialogBubble.activeBubbles.get(pet.id).textContent, 'low qi text');
    } finally {
      global.DIALOGUES = originalDialogues;
      Math.random = originalRandom;
    }
  });
});

test('showInteraction centers close interaction bubbles around the shared overlay', () => {
  withFakeDocument(() => {
    const originalDialogues = global.DIALOGUES;
    const originalConfig = global.CONFIG;
    const originalRandom = Math.random;
    global.DIALOGUES = {
      hug: {
        yueqi: ['yueqi hug'],
        shenjiu: ['shenjiu hug'],
      },
    };
    global.CONFIG = { INTERACTION_DURATION: 4000 };
    Math.random = () => 0;

    try {
      const dialogBubble = new DialogBubble();
      const yueqi = { id: 'yueqi', x: 100, size: 96, element: createFakeElement() };
      const shenjiu = { id: 'shenjiu', x: 260, size: 96, element: createFakeElement() };

      dialogBubble.showInteraction(yueqi, shenjiu, 'hug');

      assert.equal(dialogBubble.activeBubbles.get('yueqi').textContent, 'yueqi hug');
      assert.equal(dialogBubble.activeBubbles.get('shenjiu').textContent, 'shenjiu hug');
      assert.equal(dialogBubble.activeBubbles.get('yueqi').style.left, 'calc(50% + 35px)');
      assert.equal(dialogBubble.activeBubbles.get('shenjiu').style.left, 'calc(50% + -35px)');
    } finally {
      global.DIALOGUES = originalDialogues;
      global.CONFIG = originalConfig;
      Math.random = originalRandom;
    }
  });
});

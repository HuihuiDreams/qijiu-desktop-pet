const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Pet } = require('../src/pet/Pet');
const { PetRenderer } = require('../src/pet/PetRenderer');

test('renderer loads pet scale on startup and subscribes to pet scale changes', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.ok(
    appSource.includes('window.electronAPI.onPetScaleChanged?.(')
    || appSource.includes('window.electronAPI.onPetScaleChanged('),
    'renderer must subscribe to onPetScaleChanged',
  );

  assert.ok(
    appSource.includes('window.electronAPI.getPetScale()')
    || appSource.includes('window.electronAPI?.getPetScale()'),
    'renderer must read initial pet scale via getPetScale',
  );

  assert.ok(
    appSource.includes('pet.applyScale'),
    'renderer must apply scale to pets',
  );
});

test('scale subscription anchors each pet with its own display DPI before clamping', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const scaleHandler = source.slice(source.indexOf('  const applyPetScale ='), source.indexOf('  // === 久坐提醒处理 ==='));
  const pets = [new Pet({ id: 'a' }), new Pet({ id: 'b' })];
  pets.forEach((pet) => { pet.x = 200; pet.y = 300; });
  const ratios = [2 / 3, 1.5];
  const anchors = pets.map((pet, i) => ({ x: pet.x + pet.size * ratios[i] / 2, y: pet.y + pet.size * ratios[i] }));
  let onChange;
  const clamped = [];
  vm.runInNewContext(scaleHandler, {
    pets,
    interactionOverlayActive: false,
    getVisualScaleForPet: (pet) => ratios[pets.indexOf(pet)],
    keepPetReachable: (pet) => {
      const index = pets.indexOf(pet);
      assert.equal(pet.x + pet.size * ratios[index] / 2, anchors[index].x);
      assert.equal(pet.y + pet.size * ratios[index], anchors[index].y);
      clamped.push(pet);
    },
    window: { electronAPI: { onPetScaleChanged: (callback) => { onChange = callback; } } },
  });
  onChange(150);
  assert.deepEqual(clamped, pets);
});

test('scale preview and cancel resize the active overlay and bubbles without restarting them', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const elements = [];
  const stage = {
    appendChild: (element) => elements.push(element),
    querySelectorAll: () => elements.filter((element) => element.className === 'dialog-bubble overlay-bubble'),
  };
  const document = {
    getElementById: (id) => elements.find((element) => element.id === id),
    createElement: () => ({
      style: { setProperty(name, value) { this[name] = value; } },
      dataset: {},
      classList: { add() {} },
      remove() { elements.splice(elements.indexOf(this), 1); },
    }),
  };
  const originalDocument = global.document;
  const originalRaf = global.requestAnimationFrame;
  global.document = document;
  global.requestAnimationFrame = (callback) => callback();
  t.after(() => {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
    if (originalRaf === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = originalRaf;
  });

  const pets = [new Pet({ id: 'a' }), new Pet({ id: 'b' })];
  pets[0].x = 100;
  pets[1].x = 200;
  pets.forEach((pet) => { pet.y = 300; });
  const dpi = 2 / 3;
  const renderer = new PetRenderer(stage, null, () => dpi);
  const initialPos = renderer.showOverlay(...pets, 'hug');
  renderer.showOverlayBubbles('left text', 'right text', initialPos, 2000);
  const [overlay, leftBubble, rightBubble] = elements;
  let onChange;
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const scaleHandler = source.slice(source.indexOf('  const applyPetScale ='), source.indexOf('  // === 久坐提醒处理 ==='));
  vm.runInNewContext(scaleHandler, {
    pets, yueqi: pets[0], shenjiu: pets[1], renderer,
    interactionOverlayActive: true,
    getVisualScaleForPet: () => dpi,
    keepPetReachable: () => {},
    window: { electronAPI: { onPetScaleChanged: (callback) => { onChange = callback; } } },
  });

  t.mock.timers.tick(700);
  const assertPixels = (actual, expected) => assert.ok(Math.abs(parseFloat(actual) - expected) < 1e-9, `${actual} should equal ${expected}px`);
  for (const percent of [150, 50, 100]) {
    onChange(percent);
    const combinedScale = dpi * percent / 100;
    const centerA = renderer.getPetVisualCenter(pets[0]);
    const centerB = renderer.getPetVisualCenter(pets[1]);
    const width = 176 * combinedScale;
    const left = (centerA.x + centerB.x) / 2 - width / 2;
    const top = (centerA.y + centerB.y) / 2 - 64 * combinedScale;
    assertPixels(overlay.style.width, width);
    assertPixels(overlay.style.left, left);
    assertPixels(overlay.style.top, top);
    assertPixels(leftBubble.style.left, left + width * 0.1);
    assertPixels(rightBubble.style.left, left + width * 0.9);
    assertPixels(leftBubble.style.bottom, 600 - top + 16 * dpi);
    assert.equal(leftBubble.style['--bubble-scale'], dpi);
    assert.equal(overlay.style.opacity, '1');
    assert.deepEqual(elements, [overlay, leftBubble, rightBubble]);
  }
  assert.equal(leftBubble.textContent, 'left text');
  t.mock.timers.tick(1300);
  assert.deepEqual(elements, [overlay], 'preview must preserve the original bubble expiry');
});

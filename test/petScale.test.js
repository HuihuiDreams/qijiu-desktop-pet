const assert = require('node:assert/strict');
const test = require('node:test');

const { Pet } = require('../src/pet/Pet');

test('Pet.applyScale scales size and anchors bottom-center', () => {
  const pet = new Pet({ id: 'test', name: 'Test' });
  pet.size = 96;
  pet.x = 100;
  pet.y = 200;
  pet.targetX = 120;
  pet.targetY = 220;

  pet.applyScale(150);

  assert.equal(pet.size, 144);
  assert.equal(pet.x, 76);
  assert.equal(pet.y, 152);
  assert.equal(pet.targetX, 96);
  assert.equal(pet.targetY, 172);
});

test('Pet.applyScale preserves position when dragging', () => {
  const pet = new Pet({ id: 'test', name: 'Test' });
  pet.size = 96;
  pet.x = 100;
  pet.y = 200;
  pet.isDragging = true;

  pet.applyScale(150);

  assert.equal(pet.size, 144);
  assert.equal(pet.x, 100);
  assert.equal(pet.y, 200);
});

test('Pet.applyScale preserves the visual bottom-center and target at non-unit DPI', () => {
  for (const visualScale of [2 / 3, 1.5]) {
    const pet = new Pet({ id: 'test' });
    pet.x = 100;
    pet.y = 200;
    pet.targetX = 300;
    pet.targetY = 400;
    const anchor = { x: pet.x + pet.size * visualScale / 2, y: pet.y + pet.size * visualScale };
    const targetAnchor = {
      x: pet.targetX + pet.size * visualScale / 2,
      y: pet.targetY + pet.size * visualScale,
    };

    for (const percent of [150, 50, 100]) {
      pet.applyScale(percent, visualScale);
      assert.equal(pet.size, 96 * percent / 100);
      assert.equal(pet.x + pet.size * visualScale / 2, anchor.x);
      assert.equal(pet.y + pet.size * visualScale, anchor.y);
      assert.equal(pet.targetX + pet.size * visualScale / 2, targetAnchor.x);
      assert.equal(pet.targetY + pet.size * visualScale, targetAnchor.y);
    }
  }
});

test('Pet.applyScale falls back to unit DPI for invalid visual scales', () => {
  for (const visualScale of [null, NaN, Infinity, 0, -1]) {
    const pet = new Pet({ id: 'test' });
    pet.x = 100;
    pet.y = 200;
    pet.applyScale(150, visualScale);
    assert.equal(pet.x, 76);
    assert.equal(pet.y, 152);
  }
});

test('Pet.applyScale ignores invalid or non-positive input', () => {
  const pet = new Pet({ id: 'test', name: 'Test' });
  pet.size = 96;
  pet.x = 100;
  pet.y = 200;

  pet.applyScale(NaN);
  assert.equal(pet.size, 96);
  assert.equal(pet.x, 100);
  assert.equal(pet.y, 200);

  pet.applyScale(0);
  assert.equal(pet.size, 96);

  pet.applyScale(-50);
  assert.equal(pet.size, 96);

  pet.applyScale('invalid');
  assert.equal(pet.size, 96);
});

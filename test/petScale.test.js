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

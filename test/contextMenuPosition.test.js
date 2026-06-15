const assert = require('node:assert/strict');
const test = require('node:test');

const { ContextMenu } = require('../src/ui/ContextMenu.js');

test('context menu opens to the pet upper right when the click would overflow bottom', () => {
  const position = ContextMenu.resolvePosition({
    pet: { x: 200, y: 500, size: 96 },
    clickX: 220,
    clickY: 575,
    menuWidth: 170,
    menuHeight: 240,
    viewportWidth: 800,
    viewportHeight: 600,
    visualScale: 1,
  });

  assert.equal(position.opensAbove, true);
  assert.equal(position.x, 300);
  assert.equal(position.y, 256);
  assert.ok(position.y + 240 <= 590);
});

test('context menu clamps the upper-right placement back inside the right edge', () => {
  const position = ContextMenu.resolvePosition({
    pet: { x: 740, y: 500, size: 96 },
    clickX: 760,
    clickY: 575,
    menuWidth: 170,
    menuHeight: 240,
    viewportWidth: 800,
    viewportHeight: 600,
    visualScale: 1,
  });

  assert.equal(position.opensAbove, true);
  assert.equal(position.x, 620);
  assert.equal(position.y, 256);
  assert.ok(position.x + 170 <= 790);
});

test('context menu keeps normal click placement when there is enough bottom space', () => {
  const position = ContextMenu.resolvePosition({
    pet: { x: 200, y: 180, size: 96 },
    clickX: 230,
    clickY: 240,
    menuWidth: 170,
    menuHeight: 220,
    viewportWidth: 800,
    viewportHeight: 600,
    visualScale: 1,
  });

  assert.equal(position.opensAbove, false);
  assert.equal(position.x, 230);
  assert.equal(position.y, 240);
});

test('context menu uses walk area bottom instead of the full window bottom', () => {
  const position = ContextMenu.resolvePosition({
    pet: { x: 200, y: 250, size: 96 },
    clickX: 220,
    clickY: 330,
    menuWidth: 170,
    menuHeight: 220,
    viewportWidth: 800,
    viewportHeight: 600,
    bounds: { x: 0, y: 0, width: 800, height: 360 },
    visualScale: 1,
  });

  assert.equal(position.opensAbove, true);
  assert.equal(position.x, 300);
  assert.equal(position.y, 26);
  assert.ok(position.y + 220 <= 350);
});

test('context menu clamps inside non-zero display walk area bounds', () => {
  const position = ContextMenu.resolvePosition({
    pet: { x: 960, y: 250, size: 96 },
    clickX: 980,
    clickY: 330,
    menuWidth: 170,
    menuHeight: 220,
    viewportWidth: 1600,
    viewportHeight: 600,
    bounds: { x: 800, y: 0, width: 800, height: 360 },
    visualScale: 1,
  });

  assert.equal(position.opensAbove, true);
  assert.equal(position.x, 1060);
  assert.equal(position.y, 26);
  assert.ok(position.x >= 810);
  assert.ok(position.x + 170 <= 1590);
});

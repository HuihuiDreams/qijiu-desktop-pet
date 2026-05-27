const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('ContextMenu renders dynamic pet header content without innerHTML', () => {
  const source = readSource('src/ui/ContextMenu.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.ok(source.includes("document.createElement('img')"));
  assert.ok(source.includes('document.createTextNode'));
  assert.ok(source.includes('textContent'));
});

test('status window renders pet status content without innerHTML', () => {
  const source = readSource('src/statusWindow.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.ok(source.includes("document.createElement('article')"));
  assert.ok(source.includes('replaceChildren'));
  assert.ok(source.includes('textContent'));
});

test('PetRenderer creates pet DOM without innerHTML', () => {
  const source = readSource('src/pet/PetRenderer.js');

  assert.equal(source.includes('innerHTML'), false);
  assert.ok(source.includes("document.createElement('img')"));
  assert.ok(source.includes('appendChild'));
  assert.ok(source.includes('textContent'));
});

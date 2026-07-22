const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'src', 'assets', 'fonts');

test('Japanese typography keeps calligraphic display text and readable body text', () => {
  const stylesheet = fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8');
  const fontPath = path.join(FONT_DIR, 'YujiSyuku-Subset.woff2');
  const licensePath = path.join(FONT_DIR, 'YujiSyuku-OFL.txt');

  assert.match(stylesheet, /font-family: 'Yuji Syuku';/);
  assert.match(stylesheet, /--font-display: 'Yuji Syuku', 'Shippori Mincho'/);
  assert.match(stylesheet, /--font-body: 'Shippori Mincho'/);
  assert.ok(fs.statSync(fontPath).size > 0, 'Yuji Syuku subset should be bundled');
  assert.match(fs.readFileSync(licensePath, 'utf8'), /SIL Open Font License, Version 1\.1/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const debugSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'debug.js'), 'utf8');

test('testInteraction defaults to a valid overlay type', () => {
  assert.match(debugSource, /window\.testInteraction = function \(type = 'kiss'\)/);
  assert.match(debugSource, /validOverlayTypes = \['kiss', 'hug', 'cultivate', 'shareFood', 'throwup'\]/);
  assert.match(debugSource, /validOverlayTypes\.includes\(type\)/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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

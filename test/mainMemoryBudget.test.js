const assert = require('node:assert/strict');
const test = require('node:test');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

test('main process applies Chromium memory budget switches before creating windows', () => {
  const mainSource = readMainProcessSource();
  const configureIndex = mainSource.indexOf('configureChromiumMemoryBudget();');
  const createWindowIndex = mainSource.indexOf('function createWindow()');

  assert.ok(configureIndex >= 0);
  assert.ok(createWindowIndex >= 0);
  assert.ok(configureIndex < createWindowIndex);
  assert.ok(mainSource.includes("app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')"));
  assert.ok(mainSource.includes("app.commandLine.appendSwitch('disable-site-isolation-trials')"));
  assert.ok(mainSource.includes('HardwareMediaKeyHandling,MediaSessionService'));
});

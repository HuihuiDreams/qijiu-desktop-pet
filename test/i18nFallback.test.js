const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('dialogues init falls back without throwing when I18N is absent', () => {
  const context = {
    window: {},
  };
  vm.createContext(context);

  vm.runInContext(readSource('src/data/dialogues.js'), context);
  assert.doesNotThrow(() => vm.runInContext("initDialogues('en')", context));
  assert.ok(Array.isArray(context.window.DIALOGUES.greet.yueqi));
  assert.equal(context.window.DIALOGUES.greet.yueqi[0], '小九，你也在这里。');
});

test('renderer i18n fallback avoids direct optional chaining on an undeclared I18N global', () => {
  const appSource = readSource('src/app.js');

  assert.ok(appSource.includes('getI18nDictionaries()'), 'app.js should use a safe I18N accessor');
  assert.equal(appSource.includes('I18N?.zh'), false, 'undeclared I18N optional chaining would throw');
});

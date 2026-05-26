const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('macOS packaging rewrites the internal executable to an ASCII name', () => {
  const afterPackSource = fs.readFileSync(path.join(ROOT, 'scripts', 'afterPack.js'), 'utf8');

  assert.match(afterPackSource, /MAC_EXECUTABLE_NAME = 'DeskPet'/);
  assert.match(afterPackSource, /CFBundleExecutable/);
  assert.match(afterPackSource, /fs\.renameSync\(originalExecutablePath, asciiExecutablePath\)/);
});

test('macOS manual update text tells users to quit before replacing the app', () => {
  const i18nSource = fs.readFileSync(path.join(ROOT, 'src', 'data', 'i18n.js'), 'utf8');

  assert.match(i18nSource, /退出当前应用/);
  assert.match(i18nSource, /Quit the current app/);
  assert.match(i18nSource, /現在のアプリを完全に終了/);
});

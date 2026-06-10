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

test('macOS release workflows enforce Chinese wrapper app and ASCII executable names', () => {
  const workflowFiles = [
    '.github/workflows/build-installer.yml',
    '.github/workflows/release-preflight.yml',
  ];

  for (const workflowFile of workflowFiles) {
    const workflowSource = fs.readFileSync(path.join(ROOT, workflowFile), 'utf8');

    assert.ok(workflowSource.includes('expected_app_name="七九爱宠.app"'), workflowFile);
    assert.ok(workflowSource.includes('expected_executable="DeskPet"'), workflowFile);
    assert.ok(workflowSource.includes('legacy_executable_name="七九爱宠"'), workflowFile);
  }
});

test('macOS manual update text tells users to quit before replacing the app', () => {
  const i18nSource = fs.readFileSync(path.join(ROOT, 'src', 'data', 'i18n.js'), 'utf8');

  assert.match(i18nSource, /退出当前应用/);
  assert.match(i18nSource, /Quit the current app/);
  assert.match(i18nSource, /現在のアプリを完全に終了/);
});

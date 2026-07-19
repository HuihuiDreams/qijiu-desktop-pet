const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const smokeScriptPath = path.join(__dirname, '..', 'tools', 'playwright-electron-smoke.js');

test('package exposes an isolated Playwright Electron smoke command', () => {
  assert.equal(
    packageJson.scripts['qa:electron:smoke'],
    'node tools/playwright-electron-smoke.js',
  );
});

test('Playwright Electron smoke script uses an isolated profile and cleans it up', () => {
  assert.equal(fs.existsSync(smokeScriptPath), true, 'smoke script should exist');
  const smokeSource = fs.readFileSync(smokeScriptPath, 'utf8');

  assert.match(smokeSource, /require\('playwright'\)/);
  assert.match(smokeSource, /fs\.mkdtempSync\(path\.join\(os\.tmpdir\(\), 'desktop-pet-playwright-'\)\)/);
  assert.match(smokeSource, /`--user-data-dir=\$\{userDataDir\}`/);
  assert.match(smokeSource, /DESKTOP_PET_USER_DATA_DIR:\s*userDataDir/);
  assert.match(smokeSource, /app\.getPath\('userData'\)/);
  assert.match(smokeSource, /Electron userData was not isolated/);
  assert.match(smokeSource, /await electronApp\.firstWindow/);
  assert.match(smokeSource, /岳七 & 沈九 桌面宠物/);
  assert.match(smokeSource, /fs\.rmSync\(userDataDir, \{ recursive: true, force: true \}\)/);
});

test('main process redirects app userData when QA isolation is requested', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'AppLifecycle.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'TrayManager.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'IpcRouter.js'), 'utf8');

  assert.match(mainSource, /process\.env\.DESKTOP_PET_USER_DATA_DIR/);
  assert.match(mainSource, /app\.setPath\('userData', resolvedDir\)/);
  assert.ok(
    mainSource.indexOf('configureQaUserDataPath();') < mainSource.indexOf('StoreManager.initStore'),
    'QA userData path must be configured before electron-store initializes',
  );
});

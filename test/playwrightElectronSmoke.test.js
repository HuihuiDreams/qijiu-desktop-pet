const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { readMainProcessSource } = require('./helpers/sourceCorpus');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const smokeScriptPath = path.join(__dirname, '..', 'tools', 'playwright-electron-smoke.js');
const fontSpecPath = path.join(__dirname, 'e2e', 'font.spec.js');
const legacyFontSpecPath = path.join(__dirname, 'checkFont.spec.js');

test('package exposes an isolated Playwright Electron smoke command', () => {
  assert.equal(
    packageJson.scripts['qa:electron:smoke'],
    'node tools/playwright-electron-smoke.js',
  );
});

test('package exposes the Electron performance sampling command', () => {
  assert.equal(
    packageJson.scripts['qa:electron:performance'],
    'node tools/measure-electron-performance.js',
  );
});

test('Node and Playwright tests use separate commands', () => {
  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.js');
  assert.equal(packageJson.scripts['test:font'], 'playwright test font.spec.js');
  assert.equal(fs.existsSync(fontSpecPath), true, 'font spec should live under Playwright testDir');
  assert.equal(fs.existsSync(legacyFontSpecPath), false, 'legacy out-of-tree font spec should be removed');
});

test('font E2E uses the isolated launcher and the real locale API', () => {
  const fontSpecSource = fs.readFileSync(fontSpecPath, 'utf8');

  assert.match(fontSpecSource, /require\('\.\/helpers\/electron'\)/);
  assert.match(fontSpecSource, /await launchApp\(\)/);
  assert.match(fontSpecSource, /await closeApp\(electronApp, userDataDir\)/);
  assert.match(fontSpecSource, /await window\.electronAPI\.setLocale\('ja'\)/);
  assert.match(fontSpecSource, /finally\s*{/);
  assert.doesNotMatch(fontSpecSource, /setSetting\(/);
  assert.doesNotMatch(fontSpecSource, /document\.documentElement\.lang\s*=/);
  assert.doesNotMatch(fontSpecSource, /waitForTimeout\(/);
});

test('Playwright Electron smoke script uses an isolated profile and cleans it up', () => {
  assert.equal(fs.existsSync(smokeScriptPath), true, 'smoke script should exist');
  const smokeSource = fs.readFileSync(smokeScriptPath, 'utf8');

  assert.match(smokeSource, /require\('playwright'\)/);
  assert.match(smokeSource, /fs\.mkdtempSync\(path\.join\(os\.tmpdir\(\), 'desktop-pet-playwright-'\)\)/);
  assert.match(smokeSource, /`--user-data-dir=\$\{userDataDir\}`/);
  assert.match(smokeSource, /DESKTOP_PET_USER_DATA_DIR:\s*userDataDir/);
  assert.match(smokeSource, /delete launchEnv\.ELECTRON_RUN_AS_NODE/);
  assert.match(smokeSource, /app\.getPath\('userData'\)/);
  assert.match(smokeSource, /Electron userData was not isolated/);
  assert.match(smokeSource, /await electronApp\.firstWindow/);
  assert.match(smokeSource, /岳七 & 沈九 桌面宠物/);
  assert.match(smokeSource, /fs\.rmSync\(userDataDir, \{ recursive: true, force: true \}\)/);
});

test('main process redirects app userData when QA isolation is requested', () => {
  const mainSource = readMainProcessSource();

  assert.match(mainSource, /process\.env\.DESKTOP_PET_USER_DATA_DIR/);
  assert.match(mainSource, /app\.setPath\('userData', resolvedDir\)/);
  assert.ok(
    mainSource.indexOf('configureQaUserDataPath();') < mainSource.indexOf('StoreManager.initStore'),
    'QA userData path must be configured before electron-store initializes',
  );
});

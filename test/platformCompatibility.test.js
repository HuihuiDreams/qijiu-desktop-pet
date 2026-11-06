const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageJson = require('../package.json');

test('package.json targets modern 64-bit architectures and macOS 13+ (Ventura+)', () => {
  assert.equal(
    packageJson.build.mac.minimumSystemVersion,
    '13.0',
    'macOS minimumSystemVersion must be 13.0 to match Electron 44+ / Chromium 152+ upstream drop of macOS 12',
  );

  assert.ok(
    Array.isArray(packageJson.build.win.arch) && packageJson.build.win.arch.includes('x64'),
    'Windows build must explicitly target x64',
  );

  assert.ok(
    !packageJson.build.win.arch.includes('ia32'),
    'Windows build must not target ia32 since Electron 44+ dropped 32-bit binaries',
  );
});

test('GitHub Actions workflows specify node-version 22 to satisfy electron-store and conf engines', () => {
  const workflowDir = path.join(__dirname, '..', '.github', 'workflows');
  const files = ['build-installer.yml', 'release-preflight.yml'];

  for (const file of files) {
    const content = fs.readFileSync(path.join(workflowDir, file), 'utf8');
    const nodeVersions = Array.from(content.matchAll(/node-version:\s*(\d+)/g)).map(m => m[1]);
    assert.ok(nodeVersions.length > 0, `${file} must configure node-version`);
    for (const ver of nodeVersions) {
      assert.equal(ver, '22', `${file} must specify node-version 22, got ${ver}`);
    }
  }
});

test('AutoLaunchService does not use removed openAsHidden parameter on macOS', () => {
  const serviceSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'services', 'AutoLaunchService.js'),
    'utf8',
  );
  assert.ok(
    !serviceSource.includes('openAsHidden: true'),
    'AutoLaunchService must not pass openAsHidden which was removed in Electron 44+ / macOS 13+ SMAppService',
  );
});

test('all README and readme files declare macOS 13.0 as minimum requirement', () => {
  const root = path.join(__dirname, '..');
  const readmeFiles = [
    { file: 'README.md', expected: 'macOS 13.0' },
    { file: 'readme_zh.txt', expected: 'macOS 13.0' },
    { file: 'readme_en.txt', expected: 'macOS 13.0' },
    { file: 'readme_ja.txt', expected: 'macOS 13.0' },
  ];

  for (const { file, expected } of readmeFiles) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(text.includes(expected), `${file} must specify ${expected}`);
    assert.ok(!text.includes('macOS 12.0'), `${file} must no longer specify macOS 12.0`);
  }
});

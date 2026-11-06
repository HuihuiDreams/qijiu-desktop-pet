const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
// 注意：app-builder-lib 是 electron-builder 的核心传递依赖。
// 这里直接引用 validateConfiguration 校验器，以在单测环境中无需完整打包即可校验 electron-builder 配置合法性，属于有意的传递依赖耦合。
const { validateConfiguration } = require('app-builder-lib/out/util/config/config');

const packageJson = require('../package.json');

test('package.json targets modern 64-bit architectures and macOS 13+ (Ventura+)', () => {
  assert.equal(
    packageJson.build.mac.minimumSystemVersion,
    '13.0',
    'macOS minimumSystemVersion must be 13.0 to match Electron 44+ / Chromium 152+ upstream drop of macOS 12',
  );

  assert.deepEqual(
    packageJson.build.win.target,
    [{ target: 'nsis', arch: ['x64'] }],
    'Windows NSIS target must explicitly select x64 within the target configuration',
  );
});

test('package.json declares node engine requirement >=22.12.0 for @electron/asar and conf', () => {
  assert.equal(
    packageJson.engines?.node,
    '>=22.12.0',
    'package.json must explicitly require Node >=22.12.0 for ESM require support and conf v16',
  );
});

test('electron-builder accepts the complete build configuration for both platform workflows', async () => {
  await validateConfiguration(structuredClone(packageJson.build), { isEnabled: false });
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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageJson = require('../package.json');
const {
  findForbiddenEntries,
  verifyPackageContents,
} = require('../scripts/verify-package-contents');

const REQUIRED_PACKAGE_EXCLUSIONS = [
  '!.codex/**',
  '!.agents/**',
  '!.claude/**',
  '!.geminirules',
  '!AGENTS.md',
  '!CLAUDE.md',
  '!backups/**', // 本地未跟踪的明文皮肤备份；electron-builder 不读取 .gitignore
];

test('electron-builder excludes internal agent files from app.asar', () => {
  for (const exclusion of REQUIRED_PACKAGE_EXCLUSIONS) {
    assert.ok(
      packageJson.build.files.includes(exclusion),
      `missing electron-builder exclusion: ${exclusion}`,
    );
  }
});

test('package content verifier recognizes internal paths on every platform', () => {
  assert.deepEqual(
    findForbiddenEntries([
      '\\.codex\\tmp-worktree\\notes.md',
      '/.agents/skills/private.md',
      '/.claude/settings.local.json',
      '/.geminirules',
      '/AGENTS.md',
      '/CLAUDE.md',
      '/backups/assets/default_qijiu/left.webp',
      '/src/app.js',
    ]),
    [
      '.codex/tmp-worktree/notes.md',
      '.agents/skills/private.md',
      '.claude/settings.local.json',
      '.geminirules',
      'AGENTS.md',
      'CLAUDE.md',
      'backups/assets/default_qijiu/left.webp',
    ],
  );
});

test('package content verifier fails when no app.asar exists', () => {
  const emptyDist = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'deskpet-empty-dist-'));
  try {
    assert.throws(
      () => verifyPackageContents(emptyDist),
      /No app\.asar files found/,
    );
  } finally {
    fs.rmSync(emptyDist, { recursive: true, force: true });
  }
});

test('electron-builder leaves the unused tray template icons out of app.asar', () => {
  // 托盘图标由 TrayManager.createTrayIconBuffer 在代码中生成，运行时不读取这两个文件。
  // 不断言源文件是否存在：它们属于各角色分支的专属素材，不同分支上不一定有。
  assert.ok(packageJson.build.files.includes('!src/assets/iconTemplate*.png'));

  const runtimeSources = ['src/main/TrayManager.js', 'main.js']
    .map((file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
    .join('\n');
  assert.ok(!runtimeSources.includes('iconTemplate'), 'runtime code must not load the template icon files');
});

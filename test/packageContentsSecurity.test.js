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
  // 本机 IDE / Agent 工作目录与 Playwright 输出，同样被 .gitignore 忽略但会被 electron-builder 打包
  '!.kiro/**',
  '!.skillopt-sleep/**',
  '!.vscode/**',
  '!security-scans/**',
  '!test-results/**',
  // 本机环境变量、签名证书/私钥与临时产物同样被 .gitignore 忽略但不能进入安装包
  '!**/.env',
  '!**/.env.*',
  '!**/*.pfx',
  '!**/*.p12',
  '!**/*.key',
  '!**/*.pem',
  '!**/*.cer',
  '!**/*.crt',
  '!**/*.der',
  '!dist-update-test/**',
  '!output/**',
  '!**/__pycache__/**',
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
      '/.kiro/steering/product.md',
      '/.skillopt-sleep/antigravity_tasks.json',
      '\\.vscode\\settings.json',
      '/security-scans/threat_model.md',
      '/test-results/.last-run.json',
      '/.env',
      '/.env.local',
      '/config/.env.production',
      '/windows-code-signing.pfx',
      '/build/cert.p12',
      '/private.key',
      '/certs/ca.pem',
      '/cert.cer',
      '/cert.crt',
      '/cert.der',
      '/dist-update-test/app.asar',
      '/output/report.txt',
      '/tools/__pycache__/crop.pyc',
      '/src/assets/default/yueqi/idle.webp',
      '/src/assets/school_au/shenjiu/walk_left_01.WEBP',
      '/src/data/keyboard.js',
      '/src/assets/calligraphy-qj.webp',
      '/protected-assets/default/yueqi/idle.dat',
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
      '.kiro/steering/product.md',
      '.skillopt-sleep/antigravity_tasks.json',
      '.vscode/settings.json',
      'security-scans/threat_model.md',
      'test-results/.last-run.json',
      '.env',
      '.env.local',
      'config/.env.production',
      'windows-code-signing.pfx',
      'build/cert.p12',
      'private.key',
      'certs/ca.pem',
      'cert.cer',
      'cert.crt',
      'cert.der',
      'dist-update-test/app.asar',
      'output/report.txt',
      'tools/__pycache__/crop.pyc',
      'src/assets/default/yueqi/idle.webp',
      'src/assets/school_au/shenjiu/walk_left_01.WEBP',
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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

test('release-and-packaging skill exists with valid frontmatter and contents', () => {
  const skillPath = path.join(repoRoot, '.agents', 'skills', 'release-and-packaging', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'SKILL.md must exist in .agents/skills/release-and-packaging/');

  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\r?\nname:\s*release-and-packaging\r?\n/m, 'Must declare name: release-and-packaging in frontmatter');
  assert.match(content, /description:\s*>-?\s*\n\s+.+/m, 'Must declare a description in frontmatter');
  assert.ok(content.includes('DeskPet 发布打包与签名合规流水线'), 'Must contain Chinese documentation header');
  assert.ok(content.includes('verify:installer'), 'Must document verify:installer step');
  assert.ok(content.includes('verify:package'), 'Must document verify:package step');
  assert.ok(content.includes('release-preflight.yml'), 'Must document release-preflight workflow');
  assert.ok(content.includes('build-installer.yml'), 'Must document build-installer workflow');
  assert.ok(content.includes('DeskPet'), 'Must document DeskPet ASCII executable convention');
  assert.doesNotMatch(content, /file:\/\/|\/Users\//, 'Must not contain machine-specific absolute paths');

  const links = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length > 0, 'Must contain repository relative links');
  for (const link of links) {
    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      const targetPath = path.resolve(repoRoot, link.split('#')[0]);
      assert.ok(fs.existsSync(targetPath), `Linked path must exist in repo: ${link}`);
    }
  }
});

test('scripts/verify-installer.js passes in current repo environment', () => {
  const scriptPath = path.join(repoRoot, 'scripts', 'verify-installer.js');
  assert.ok(fs.existsSync(scriptPath));

  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, `verify-installer failed: ${result.stderr || result.stdout}`);
  assert.ok(result.stdout.includes('验证成功：环境已准备就绪'));
});

test('scripts/verify-package-contents.js exports valid forbidden path rules', () => {
  const { findForbiddenEntries } = require('../scripts/verify-package-contents.js');
  assert.equal(typeof findForbiddenEntries, 'function');

  const sampleEntries = [
    'src/main.js',
    '.agents/skills/test.md',
    '.claude/settings.local.json',
    'AGENTS.md',
    'docs/index.html',
  ];

  const forbidden = findForbiddenEntries(sampleEntries);
  assert.deepEqual(forbidden, [
    '.agents/skills/test.md',
    '.claude/settings.local.json',
    'AGENTS.md',
  ]);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

test('skin-asset-pipeline skill exists with valid frontmatter', () => {
  const skillPath = path.join(repoRoot, '.agents', 'skills', 'skin-asset-pipeline', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'SKILL.md must exist in .agents/skills/skin-asset-pipeline/');

  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\r?\nname:\s*skin-asset-pipeline\r?\n/m, 'Must declare name: skin-asset-pipeline in frontmatter');
  assert.match(content, /description:\s*>-?\s*\n\s+.+/m, 'Must declare a description in frontmatter');
  assert.ok(content.includes('DeskPet 皮肤素材处理流水线'), 'Must contain Chinese documentation header');
  assert.ok(content.includes('256x256'), 'Must document 256x256 WebP invariant');
  assert.ok(content.includes('protect:assets'), 'Must document asset encryption step');
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

test('scripts/convert_images.js syntax is valid and rejects non-existent cli target directory', () => {
  const scriptPath = path.join(repoRoot, 'scripts', 'convert_images.js');
  assert.ok(fs.existsSync(scriptPath));

  const check = spawnSync(process.execPath, ['--check', scriptPath]);
  assert.equal(check.status, 0, `Syntax check failed: ${check.stderr?.toString()}`);

  const invalidRun = spawnSync(process.execPath, [scriptPath, 'src/assets/__non_existent_skin__'], { encoding: 'utf8' });
  assert.equal(invalidRun.status, 1, 'Should exit with non-zero code when CLI target directory does not exist');
  assert.match(invalidRun.stderr, /Target skin directory does not exist/);
});

test('tools/run_trim.py syntax is valid and rejects non-existent target directory arguments', () => {
  const trimScriptPath = path.join(repoRoot, 'tools', 'run_trim.py');
  assert.ok(fs.existsSync(trimScriptPath));

  const check = spawnSync('python3', ['-m', 'py_compile', trimScriptPath]);
  assert.equal(check.status, 0, `Python syntax check failed: ${check.stderr?.toString()}`);

  const content = fs.readFileSync(trimScriptPath, 'utf8');
  assert.ok(content.includes('sys.argv[1:]'), 'run_trim.py should support target directory arguments');
  assert.ok(content.includes('run_groups_and_remaining'), 'run_trim.py should share group and individual file processing');
});

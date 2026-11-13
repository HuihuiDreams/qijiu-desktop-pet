const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const LINK_PATTERN = /\]\(([^)\s]+)\)/g;

function listMarkdown(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(relativeDir, name));
}

function findBrokenRelativeLinks(relativeFile) {
  const baseDir = path.dirname(path.join(ROOT, relativeFile));
  const broken = [];
  const lines = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(LINK_PATTERN)) {
      const target = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const filePart = target.split('#')[0];
      if (!filePart) continue;
      if (!fs.existsSync(path.resolve(baseDir, filePart))) {
        broken.push(`${relativeFile}:${index + 1} -> ${target}`);
      }
    }
  });
  return broken;
}

test('relative links in the maintained docs resolve to existing files', () => {
  // archive/ 与 performance/ 是历史记录，不在维护范围内
  const files = [
    ...listMarkdown('docs'),
    ...listMarkdown(path.join('docs', 'decisions')),
    ...listMarkdown(path.join('docs', 'plan')),
  ];
  const broken = files.flatMap(findBrokenRelativeLinks);

  assert.deepEqual(broken, []);
});

test('CHANGELOG links to the archived 2026-10-06 review documents at their archive location', () => {
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

  for (const name of [
    'code-review-report-2026-10-06.md',
    'code-review-recheck-2026-10-06.md',
    'code-review-fix-plan-2026-10-06.md',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'archive', name)), `${name} must exist in docs/archive`);
    assert.ok(changelog.includes(`](docs/archive/${name})`), `CHANGELOG must link ${name} under docs/archive`);
    assert.ok(!changelog.includes(`](docs/${name})`), `CHANGELOG must not link the old docs/${name} path`);
  }
});

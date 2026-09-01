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
  '!.geminirules',
  '!AGENTS.md',
  '!CLAUDE.md',
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
      '/.geminirules',
      '/AGENTS.md',
      '/CLAUDE.md',
      '/src/app.js',
    ]),
    [
      '.codex/tmp-worktree/notes.md',
      '.agents/skills/private.md',
      '.geminirules',
      'AGENTS.md',
      'CLAUDE.md',
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

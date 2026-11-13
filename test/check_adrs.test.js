const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { checkAdrFiles } = require('../scripts/check_adrs');

test('checkAdrFiles correctly identifies missing headers in ADR files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-test-'));
  
  // File 1: complete
  fs.writeFileSync(path.join(tmpDir, 'ADR-001-complete.md'), 
    "# ADR-001: Test\n## Status\n## Date\n## Context\n## Decision\n## Alternatives Considered\n## Consequences\n"
  );
  
  // File 2: missing Title and Context
  fs.writeFileSync(path.join(tmpDir, 'ADR-002-missing.md'), 
    "Wrong Title\n## Status\n## Date\n## Decision\n## Alternatives Considered\n## Consequences\n"
  );
  
  const report = checkAdrFiles(tmpDir);
  
  assert.equal(report.length, 1);
  assert.equal(report[0].file, 'ADR-002-missing.md');
  assert.deepEqual(report[0].missing, ['Title/Header', 'Context']);
  
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { spawnSync } = require('child_process');

const CHECK_SCRIPT = path.join(__dirname, '..', 'scripts', 'check_adrs.js');

function runCheckInRepo(adrFiles) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-cli-'));
  const adrDir = path.join(repoRoot, 'docs', 'decisions');
  fs.mkdirSync(adrDir, { recursive: true });
  for (const [name, content] of Object.entries(adrFiles)) {
    fs.writeFileSync(path.join(adrDir, name), content);
  }
  try {
    return spawnSync(process.execPath, [CHECK_SCRIPT], { cwd: repoRoot, encoding: 'utf8' });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

test('check_adrs CLI exits with 1 when an ADR is missing required sections', () => {
  const result = runCheckInRepo({
    'ADR-001-incomplete.md': '# ADR-001: Test\n## Status\n## Date\n## Context\n## Decision\n## Consequences\n',
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    { file: 'ADR-001-incomplete.md', missing: ['Alternatives Considered'] },
  ]);
});

test('check_adrs CLI exits with 0 when every ADR is complete', () => {
  const result = runCheckInRepo({
    'ADR-001-complete.md': '# ADR-001: Test\n## Status\n## Date\n## Context\n## Decision\n## Alternatives Considered\n## Consequences\n',
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test('every ADR in docs/decisions has the required sections and npm run check:adrs exists', () => {
  assert.deepEqual(checkAdrFiles(path.join(__dirname, '..', 'docs', 'decisions')), []);

  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['check:adrs'], 'node scripts/check_adrs.js');
});

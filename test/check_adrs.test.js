const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { checkAdrFiles } = require('../scripts/check_adrs');

test('checkAdrFiles correctly identifies missing headers in ADR files', () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, 'adr-test-'));
  
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

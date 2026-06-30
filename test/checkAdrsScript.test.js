const assert = require('assert');
const path = require('path');
const test = require('node:test');

const {
  getAdrDir,
  checkAdrFiles,
} = require('../scripts/check_adrs');

test('check_adrs resolves decisions directory from the repository root', () => {
  const adrDir = getAdrDir();

  assert.equal(adrDir, path.join(process.cwd(), 'docs', 'decisions'));
});

test('check_adrs scans repository ADR files without hard-coded user paths', () => {
  const report = checkAdrFiles();

  assert.ok(Array.isArray(report));
  assert.equal(report.length, 0);
});

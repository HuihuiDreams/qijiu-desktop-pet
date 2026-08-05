const fs = require('fs');
const path = require('path');

const requiredHeaders = [
  { regex: /^# ADR-\d+: .+/, name: 'Title/Header' },
  { regex: /^## Status/m, name: 'Status' },
  { regex: /^## Date/m, name: 'Date' },
  { regex: /^## Context/m, name: 'Context' },
  { regex: /^## Decision/m, name: 'Decision' },
  { regex: /^## Alternatives Considered/m, name: 'Alternatives Considered' },
  { regex: /^## Consequences/m, name: 'Consequences' }
];

function getAdrDir(repoRoot = process.cwd()) {
  return path.join(repoRoot, 'docs', 'decisions');
}

function stripBom(content) {
  return content.replace(/^\uFEFF/, '');
}

function checkAdrFiles(adrDir = getAdrDir()) {
  const files = fs.readdirSync(adrDir)
    .filter(f => f.startsWith('ADR-') && f.endsWith('.md'))
    .sort();

  const report = [];

  for (const file of files) {
    const content = stripBom(fs.readFileSync(path.join(adrDir, file), 'utf-8'));
    const missing = [];

    if (!requiredHeaders[0].regex.test(content.split(/\r?\n/)[0])) {
      missing.push('Title/Header');
    }

    for (let i = 1; i < requiredHeaders.length; i++) {
      if (!requiredHeaders[i].regex.test(content)) {
        missing.push(requiredHeaders[i].name);
      }
    }

    if (missing.length > 0) {
      report.push({ file, missing });
    }
  }

  return report;
}

if (require.main === module) {
  console.log(JSON.stringify(checkAdrFiles(), null, 2));
}

module.exports = {
  checkAdrFiles,
  getAdrDir,
  stripBom,
};

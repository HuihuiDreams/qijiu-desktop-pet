const fs = require('fs');
const path = require('path');

const adrDir = '/Users/huihui/Documents/qijiu-desktop-pet/docs/decisions';
const files = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));

const requiredHeaders = [
  { regex: /^# ADR-\d+: .+/, name: 'Title/Header' },
  { regex: /^## Status/m, name: 'Status' },
  { regex: /^## Date/m, name: 'Date' },
  { regex: /^## Context/m, name: 'Context' },
  { regex: /^## Decision/m, name: 'Decision' },
  { regex: /^## Alternatives Considered/m, name: 'Alternatives Considered' },
  { regex: /^## Consequences/m, name: 'Consequences' }
];

const report = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(adrDir, file), 'utf-8');
  const missing = [];
  
  if (!requiredHeaders[0].regex.test(content.split('\n')[0])) {
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

console.log(JSON.stringify(report, null, 2));

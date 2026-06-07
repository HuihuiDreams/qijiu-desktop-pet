const fs = require('fs');
const path = require('path');

const adrDir = path.join(process.cwd(), 'docs', 'decisions');
const files = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));

// Map of regular expressions for matching various heading formats to the target English format.
const headingMap = [
  { regex: /^##\s*(?:状态|Status|状态\s*\(Status\)|Status\s*\(状态\))\s*$/im, replacement: '## Status' },
  { regex: /^##\s*(?:日期|Date|日期\s*\(Date\)|Date\s*\(日期\))\s*$/im, replacement: '## Date' },
  { regex: /^##\s*(?:背景|Context|背景\s*\(Context\)|Context\s*\(背景\))\s*$/im, replacement: '## Context' },
  { regex: /^##\s*(?:决策|Decision|决策\s*\(Decision\)|Decision\s*\(决策\))\s*$/im, replacement: '## Decision' },
  { regex: /^##\s*(?:替代方案|其他方案|备选方案|Alternatives|Alternatives Considered|替代方案考虑|替代方案\s*\(Alternatives Considered\)|Alternatives Considered\s*\(替代方案\))\s*$/im, replacement: '## Alternatives Considered' },
  { regex: /^##\s*(?:影响|后果|Consequences|影响\s*\(Consequences\)|Consequences\s*\(影响\))\s*$/im, replacement: '## Consequences' },
];

const requiredHeaders = [
  '## Status',
  '## Date',
  '## Context',
  '## Decision',
  '## Alternatives Considered',
  '## Consequences'
];

const missingReport = [];

for (const file of files) {
  const filePath = path.join(adrDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  // Replace headers
  for (const mapping of headingMap) {
    content = content.replace(mapping.regex, mapping.replacement);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated headers in ${file}`);
  }

  // Check missing
  const missing = [];
  for (const req of requiredHeaders) {
    const reqRegex = new RegExp('^' + req + '\\s*$', 'im');
    if (!reqRegex.test(content)) {
      missing.push(req);
    }
  }

  if (missing.length > 0) {
    missingReport.push({ file, missing });
  }
}

console.log('\nMissing Sections Report:');
console.log(JSON.stringify(missingReport, null, 2));

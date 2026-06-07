const fs = require('fs');
const path = require('path');

const adrDir = path.join(process.cwd(), 'docs', 'decisions');
const files = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));

const headingMap = [
  { regex: /^##\s*(?:状态|Status|状态\s*\(Status\)|Status\s*\(状态\))\s*$/im, replacement: '## Status' },
  { regex: /^##\s*(?:日期|Date|日期\s*\(Date\)|Date\s*\(日期\))\s*$/im, replacement: '## Date' },
  { regex: /^##\s*(?:背景|Context|背景\s*\(Context\)|Context\s*\(背景\))\s*$/im, replacement: '## Context' },
  { regex: /^##\s*(?:决策|Decision|决策\s*\(Decision\)|Decision\s*\(决策\))\s*$/im, replacement: '## Decision' },
  { regex: /^##\s*(?:替代方案|其他方案|备选方案|Alternatives|Alternatives Considered|替代方案考虑|替代方案\s*\(Alternatives Considered\)|Alternatives Considered\s*\(替代方案\))\s*$/im, replacement: '## Alternatives Considered' },
  { regex: /^##\s*(?:影响|后果|Consequences|影响\s*\(Consequences\)|Consequences\s*\(影响\))\s*$/im, replacement: '## Consequences' },
];

const toolCalls = [];

for (const file of files) {
  const filePath = path.join(adrDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const chunks = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const mapping of headingMap) {
      if (mapping.regex.test(line)) {
        if (line !== mapping.replacement) {
          chunks.push({
            AllowMultiple: false,
            StartLine: i + 1,
            EndLine: i + 1,
            TargetContent: line,
            ReplacementContent: mapping.replacement
          });
        }
        break;
      }
    }
  }
  
  if (chunks.length > 0) {
    toolCalls.push({
      TargetFile: filePath,
      Instruction: `Format ADR headings to English standard`,
      Description: `Standardized Chinese headings to standard English template headings.`,
      ReplacementChunks: chunks
    });
  }
}

console.log(JSON.stringify(toolCalls, null, 2));

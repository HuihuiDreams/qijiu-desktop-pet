const fs = require('fs');
const path = require('path');

const adrDir = '/Users/huihui/Documents/qijiu-desktop-pet/docs/decisions';
const adrs = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md')).sort();

const expectedHeaders = ['Status', 'Date', 'Context', 'Decision', 'Alternatives Considered', 'Consequences'];
const issues = [];

adrs.forEach(adr => {
  const content = fs.readFileSync(path.join(adrDir, adr), 'utf-8');
  const headers = [];
  const regex = /^##\s+(.*)/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    headers.push(match[1].trim());
  }

  const missing = expectedHeaders.filter(h => !headers.some(existing => existing.toLowerCase().includes(h.toLowerCase())));
  if (missing.length > 0) {
    issues.push(`${adr} missing: ${missing.join(', ')}`);
  }

  const statusRegex = /^##\s+Status.*?\n(.*?)(?=\n##)/ims;
  const statusMatch = statusRegex.exec(content);
  if (statusMatch) {
    const val = statusMatch[1].trim();
    if (!['Accepted', 'Superseded', 'Deprecated'].includes(val)) {
      issues.push(`${adr} status format wrong: ${val.substring(0, 30).replace(/\n/g, ' ')}`);
    }
  } else {
    issues.push(`${adr} missing Status value block`);
  }
});

issues.forEach(i => console.log(i));

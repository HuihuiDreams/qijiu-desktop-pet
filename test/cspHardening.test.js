const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const glob = require('glob');

const ROOT = path.join(__dirname, '..');

test('HTML files include font-src in Content-Security-Policy for local WebFont support', () => {
  const htmlFiles = glob.sync('src/*.html', { cwd: ROOT });
  assert.ok(htmlFiles.length > 0, 'Should find HTML files in src/');

  for (const relativePath of htmlFiles) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    
    // Extract the CSP meta tag content
    const cspMatch = source.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/i);
    assert.ok(cspMatch, `File ${relativePath} should have a Content-Security-Policy meta tag`);
    
    const cspContent = cspMatch[1];
    
    // Since we embedded MaShanZheng-Subset.woff2 locally, font-src 'self' must be present
    assert.ok(
      cspContent.includes("font-src 'self'"),
      `File ${relativePath} is missing "font-src 'self'" in CSP. Found: ${cspContent}`
    );
  }
});

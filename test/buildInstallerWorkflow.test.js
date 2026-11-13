const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'build-installer.yml'),
  'utf8',
).replace(/\r\n/g, '\n');

test('Windows and macOS jobs both tolerate the other platform creating the draft release first', () => {
  // 两个平台作业在 tag push 时并行运行，都会尝试创建同一个 draft release。
  const windowsStart = source.indexOf('- name: Upload Windows release assets');
  const windowsEnd = source.indexOf('- name: Upload readme files to GitHub Release');
  const windowsStep = source.slice(windowsStart, windowsEnd);

  assert.ok(windowsStart >= 0 && windowsEnd > windowsStart, 'Windows upload step must exist');
  assert.match(windowsStep, /gh release create \$tag --draft/);
  assert.match(
    windowsStep,
    /gh release create[^\n]*\n\s+if \(\$LASTEXITCODE -ne 0\) \{[\s\S]*?gh release view \$tag[\s\S]*?throw "Failed to create or find release \$tag\."/,
    'a failed create must be followed by a view, and only throw when the release still does not exist',
  );

  const macStart = source.indexOf('gh release create "$TAG" --draft');
  assert.ok(macStart >= 0, 'macOS draft release creation must exist');
  assert.match(source.slice(macStart, macStart + 200), /\|\| gh release view "\$TAG"/);
});

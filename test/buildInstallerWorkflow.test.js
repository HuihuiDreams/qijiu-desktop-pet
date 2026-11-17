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

test('Windows and macOS installer jobs run unit and integration tests before electron-builder', () => {
  const windowsStart = source.indexOf('name: Build NSIS installer');
  const macStart = source.indexOf('name: Build macOS installer');
  assert.ok(windowsStart >= 0 && macStart > windowsStart, 'both installer jobs must exist');
  const jobs = {
    windows: source.slice(windowsStart, macStart),
    macos: source.slice(macStart),
  };
  for (const [platform, job] of Object.entries(jobs)) {
    const install = job.indexOf('run: npm ci');
    const unit = job.indexOf('run: npm test');
    const integration = job.indexOf('run: npm run test:integration');
    const build = job.indexOf('npx electron-builder');
    assert.ok(install >= 0, `${platform}: npm ci must exist`);
    assert.ok(unit > install, `${platform}: npm test must run after npm ci`);
    assert.ok(integration > unit, `${platform}: integration tests must run after unit tests`);
    assert.ok(build > integration, `${platform}: electron-builder must run after tests`);
  }
});

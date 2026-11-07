const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// 注意：以下直接引用了传递依赖 ajv 内部的 uri 运行时模块及 Ajv2020 导出。
// 这是为了直接校验上游传递依赖（electron-store -> conf -> ajv -> fast-uri）针对 CVE 补丁的解析行为，属于有意的深度回归测试耦合。
const uri = require('ajv/dist/runtime/uri').default;
const { Ajv2020 } = require('ajv/dist/2020.js');

test('Ajv URI resolver canonicalizes percent-encoded uppercase hosts', () => {
  assert.equal(uri.parse('//%41.com').host, 'a.com');
  assert.equal(uri.equal('//%41.com', '//a.com'), true);
});

test('Ajv URI resolver escapes scheme-like colons in suffix references', () => {
  for (const value of ['javascript:alert(1)', 'data:text/plain,hello']) {
    const normalized = uri.serialize({ path: value }, { reference: 'suffix' });
    assert.equal(normalized, value.replace(':', '%3A'));
    assert.equal(uri.parse(normalized).scheme, undefined);
  }
});

test('Ajv retains ordinary relative schema resolution and validation', () => {
  assert.equal(
    uri.resolve('https://example.com/schemas/root.json', './pet.json'),
    'https://example.com/schemas/pet.json',
  );

  const ajv = new Ajv2020();
  ajv.addSchema({
    $id: 'https://example.com/schemas/pet.json',
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  });
  const validate = ajv.compile({
    $id: 'https://example.com/schemas/root.json',
    $ref: 'pet.json',
  });
  assert.equal(validate({ name: 'Crowley' }), true);
  assert.equal(validate({ name: 42 }), false);
});

function parseSemver(v) {
  return v.replace(/^[^\d]*/, '').split('.').map(Number);
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

test('package-lock.json locks transitive dependencies to patched versions (fast-uri and undici)', () => {
  const packageLockPath = path.resolve(__dirname, '..', 'package-lock.json');
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

  const fastUriVersion = packageLock.packages?.['node_modules/fast-uri']?.version;
  assert.ok(fastUriVersion, 'package-lock.json must contain node_modules/fast-uri');
  assert.notEqual(fastUriVersion, '3.1.7', 'fast-uri must not be vulnerable version 3.1.7');
  assert.ok(
    compareSemver(fastUriVersion, '3.1.9') >= 0,
    `fast-uri must be >= 3.1.9, got ${fastUriVersion}`
  );

  const undiciVersion = packageLock.packages?.['node_modules/undici']?.version;
  assert.ok(undiciVersion, 'package-lock.json must contain node_modules/undici');
  assert.ok(
    compareSemver(undiciVersion, '7.30.2') >= 0,
    `undici must be >= 7.30.2 (outside vulnerable 7.0.0 - 7.30.0 range), got ${undiciVersion}`
  );
  assert.equal(
    compareSemver(undiciVersion, '7.0.0') >= 0 && compareSemver(undiciVersion, '7.30.0') <= 0,
    false,
    `undici must not be in vulnerable 7.0.0 - 7.30.0 range, got ${undiciVersion}`
  );
});

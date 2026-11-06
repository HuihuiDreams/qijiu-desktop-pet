const assert = require('node:assert/strict');
const test = require('node:test');
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
  assert.equal(validate({ name: '岳清源' }), true);
  assert.equal(validate({ name: 42 }), false);
});

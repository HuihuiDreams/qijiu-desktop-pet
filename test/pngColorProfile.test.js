const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PNG_SIGNATURE_LENGTH = 8;
const PNG_CHUNK_HEADER_LENGTH = 8;
const PNG_CHUNK_CRC_LENGTH = 4;

function listPngChunks(filePath) {
  const buffer = fs.readFileSync(filePath);
  const chunks = [];
  let offset = PNG_SIGNATURE_LENGTH;

  while (offset + PNG_CHUNK_HEADER_LENGTH <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push(type);
    offset += PNG_CHUNK_HEADER_LENGTH + length + PNG_CHUNK_CRC_LENGTH;
    if (type === 'IEND') break;
  }

  return chunks;
}

test('runtime PNG assets do not include iCCP chunks that trigger libpng warnings', () => {
  const files = [
    'src/assets/icon.png',
    'src/assets/iconTemplate.png',
    'src/assets/iconTemplate@2x.png',
  ];

  for (const file of files) {
    const chunks = listPngChunks(path.join(__dirname, '..', file));
    assert.ok(chunks.includes('IHDR'), `${file} should be a PNG`);
    assert.ok(!chunks.includes('iCCP'), `${file} should not include an iCCP chunk`);
  }
});

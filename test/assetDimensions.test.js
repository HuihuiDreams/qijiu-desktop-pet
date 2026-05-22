const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function listWebpFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listWebpFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.webp')) {
      files.push(entryPath);
    }
  }

  return files;
}

function readWebpSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', `${filePath} is not a RIFF file`);
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', `${filePath} is not a WebP file`);

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkType === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(chunkStart + 4, 3),
        height: 1 + buffer.readUIntLE(chunkStart + 7, 3),
      };
    }

    if (chunkType === 'VP8L') {
      const bits = buffer.readUInt32LE(chunkStart + 1);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
      };
    }

    if (chunkType === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(chunkStart + 6) & 0x3fff,
        height: buffer.readUInt16LE(chunkStart + 8) & 0x3fff,
      };
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  throw new Error(`Could not find a supported WebP image chunk in ${filePath}`);
}

test('default runtime WebP assets are capped at 256px on their longest edge', () => {
  const defaultDir = path.join(__dirname, '..', 'src', 'assets', 'default');
  const oversized = listWebpFiles(defaultDir)
    .filter((filePath) => {
      const { width, height } = readWebpSize(filePath);
      return Math.max(width, height) > 256;
    })
    .map((filePath) => path.relative(defaultDir, filePath).replaceAll(path.sep, '/'));

  assert.deepEqual(oversized, []);
});

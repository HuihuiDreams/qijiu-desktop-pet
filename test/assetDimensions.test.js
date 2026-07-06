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

function listPngFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listPngFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.png')) {
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

test('runtime WebP skin assets are capped at 256px on their longest edge', () => {
  const assetsDir = path.join(__dirname, '..', 'src', 'assets');
  const skinDirs = ['default', 'animal_ears', 'birds', 'school_au'];
  const oversized = skinDirs.flatMap((skinId) => {
    const skinDir = path.join(assetsDir, skinId);
    return listWebpFiles(skinDir)
      .filter((filePath) => {
        const { width, height } = readWebpSize(filePath);
        return Math.max(width, height) > 256;
      })
      .map((filePath) => path.relative(assetsDir, filePath).replaceAll(path.sep, '/'));
  });

  assert.deepEqual(oversized, []);
});

test('animal_ears source-backed runtime assets are present as 256px WebP files', () => {
  const sourceDir = path.join(__dirname, '..', 'docs', 'source-assets', 'animal_ears');
  const runtimeDir = path.join(__dirname, '..', 'src', 'assets', 'animal_ears');
  const missingOrWrongSize = listPngFiles(sourceDir)
    .filter((filePath) => {
      const relativePath = path.relative(sourceDir, filePath);
      const runtimePath = path.join(runtimeDir, relativePath.replace(/\.png$/i, '.webp'));
      if (!fs.existsSync(runtimePath)) return true;

      const { width, height } = readWebpSize(runtimePath);
      return width !== 256 || height !== 256;
    })
    .map((filePath) => path.relative(sourceDir, filePath).replaceAll(path.sep, '/'));

  assert.deepEqual(missingOrWrongSize, []);
});

test('school_au source-backed runtime assets are present as 256px WebP files', () => {
  const sourceDir = path.join(__dirname, '..', 'docs', 'source-assets', 'school_au');
  const runtimeDir = path.join(__dirname, '..', 'src', 'assets', 'school_au');
  const missingOrWrongSize = listPngFiles(sourceDir)
    .filter((filePath) => {
      const relativePath = path.relative(sourceDir, filePath);
      const runtimePath = path.join(runtimeDir, relativePath.replace(/\.png$/i, '.webp'));
      if (!fs.existsSync(runtimePath)) return true;

      const { width, height } = readWebpSize(runtimePath);
      return width !== 256 || height !== 256;
    })
    .map((filePath) => path.relative(sourceDir, filePath).replaceAll(path.sep, '/'));

  assert.deepEqual(missingOrWrongSize, []);
});

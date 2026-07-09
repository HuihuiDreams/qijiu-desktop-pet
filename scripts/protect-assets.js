const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUT_DIR = path.join(ROOT, 'src', 'assets');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'protected-assets');
const MANIFEST_NAME = 'manifest.json';
const MANIFEST_VERSION = 1;
const KEY = crypto.createHash('sha256')
  .update('deskpet-protected-skin-assets-v1')
  .digest();

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function isProtectedSkinAsset(relativePath) {
  const normalized = toPosixPath(relativePath);
  return normalized.split('/').length >= 2 && normalized.endsWith('.webp');
}

function createOutputFileName(assetId) {
  return `${assetId.replaceAll('/', '__')}.dat`;
}

function collectSkinAssets(inputDir = DEFAULT_INPUT_DIR) {
  const assets = [];
  if (!fs.existsSync(inputDir)) return assets;

  const walk = (dir) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!dirent.isFile()) continue;

      const relativePath = path.relative(inputDir, fullPath);
      if (!isProtectedSkinAsset(relativePath)) continue;

      const assetId = `skin/${toPosixPath(relativePath)}`;
      assets.push({ assetId, fullPath, relativePath: toPosixPath(relativePath) });
    }
  };

  walk(inputDir);
  return assets.sort((a, b) => a.assetId.localeCompare(b.assetId));
}

function encryptAsset(buffer, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function protectAssets(options = {}) {
  const inputDir = options.inputDir || DEFAULT_INPUT_DIR;
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const assets = collectSkinAssets(inputDir);

  fs.mkdirSync(outputDir, { recursive: true });

  const manifest = {
    version: MANIFEST_VERSION,
    algorithm: 'aes-256-gcm',
    generatedAt: new Date().toISOString(),
    assets: {},
  };

  for (const asset of assets) {
    const plain = fs.readFileSync(asset.fullPath);
    const file = createOutputFileName(asset.assetId);
    const { encrypted, iv, authTag } = encryptAsset(plain, asset.assetId);
    fs.writeFileSync(path.join(outputDir, file), encrypted);

    manifest.assets[asset.assetId] = {
      file,
      iv,
      authTag,
      contentType: 'image/webp',
      size: plain.length,
      sha256: crypto.createHash('sha256').update(plain).digest('hex'),
    };
  }

  fs.writeFileSync(
    path.join(outputDir, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return manifest;
}

if (require.main === module) {
  const manifest = protectAssets();
  const count = Object.keys(manifest.assets).length;
  console.log(`Protected ${count} skin assets into ${path.relative(ROOT, DEFAULT_OUTPUT_DIR)}`);
}

module.exports = {
  collectSkinAssets,
  createOutputFileName,
  isProtectedSkinAsset,
  protectAssets,
};

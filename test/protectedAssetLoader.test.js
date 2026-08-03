const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { protectAssets } = require('../scripts/protect-assets');
const {
  clearProtectedAssetCache,
  createAssetUrl,
  getProtectedAssetCacheStats,
  hasProtectedAsset,
  listAvailableSkinIds,
  loadProtectedAsset,
  normalizeAssetId,
  readManifest,
} = require('../protectedAssetLoader');

function createProtectedAssetsFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-protected-loader-'));
  const inputDir = path.join(root, 'src', 'assets');
  const outputDir = path.join(root, 'protected-assets');
  fs.mkdirSync(path.join(inputDir, 'default'), { recursive: true });
  fs.mkdirSync(path.join(inputDir, 'birds'), { recursive: true });
  fs.writeFileSync(path.join(inputDir, 'default', 'left.webp'), Buffer.from('default-left'));
  fs.writeFileSync(path.join(inputDir, 'birds', 'right.webp'), Buffer.from('birds-right'));
  protectAssets({ inputDir, outputDir });
  return outputDir;
}

test('normalizeAssetId accepts only skin WebP asset ids', async () => {
  assert.equal(normalizeAssetId('/skin/default/left.webp'), 'skin/default/left.webp');
  assert.equal(normalizeAssetId('skin/default/yueqi/walk_left01.webp'), 'skin/default/yueqi/walk_left01.webp');
  assert.equal(normalizeAssetId('skin/default/../left.webp'), null);
  assert.equal(normalizeAssetId('skin/default/icon.png'), null);
  assert.equal(normalizeAssetId('file:///skin/default/left.webp'), null);
});

test('loadProtectedAsset decrypts a manifest entry and lists skins', async () => {
  const protectedAssetsDir = createProtectedAssetsFixture();

  assert.equal(hasProtectedAsset('skin/default/left.webp', { protectedAssetsDir }), true);
  assert.equal(hasProtectedAsset('skin/default/missing.webp', { protectedAssetsDir }), false);
  assert.deepEqual(listAvailableSkinIds({ protectedAssetsDir }).sort(), ['birds', 'default']);
  assert.equal(createAssetUrl('skin/default/left.webp'), 'pet-asset://skin/default/left.webp');

  const asset = await loadProtectedAsset('skin/default/left.webp', { protectedAssetsDir });
  assert.equal(asset.contentType, 'image/webp');
  assert.equal(asset.data.toString('utf8'), 'default-left');
});

test('loadProtectedAsset rejects tampered encrypted payloads', async () => {
  clearProtectedAssetCache();
  const protectedAssetsDir = createProtectedAssetsFixture();
  const manifest = JSON.parse(fs.readFileSync(path.join(protectedAssetsDir, 'manifest.json'), 'utf8'));
  const entry = manifest.assets['skin/default/left.webp'];
  const encryptedPath = path.join(protectedAssetsDir, entry.file);
  const encrypted = fs.readFileSync(encryptedPath);
  encrypted[0] ^= 0xff;
  fs.writeFileSync(encryptedPath, encrypted);

  await assert.rejects(
      loadProtectedAsset('skin/default/left.webp', { protectedAssetsDir }),
    /Unsupported state|authenticate|bad decrypt|unable to authenticate/i,
  );
});

test('loadProtectedAsset caches decrypted assets until the cache is cleared', async () => {
  clearProtectedAssetCache();
  const protectedAssetsDir = createProtectedAssetsFixture();

  const first = await loadProtectedAsset('skin/default/left.webp', { protectedAssetsDir });
  assert.equal(first.data.toString('utf8'), 'default-left');
  assert.equal(getProtectedAssetCacheStats().entries, 1);

  first.data[0] = 'X'.charCodeAt(0);

  const manifest = JSON.parse(fs.readFileSync(path.join(protectedAssetsDir, 'manifest.json'), 'utf8'));
  const entry = manifest.assets['skin/default/left.webp'];
  const encryptedPath = path.join(protectedAssetsDir, entry.file);
  const encrypted = fs.readFileSync(encryptedPath);
  encrypted[0] ^= 0xff;
  fs.writeFileSync(encryptedPath, encrypted);

  const cached = await loadProtectedAsset('skin/default/left.webp', { protectedAssetsDir });
  assert.equal(cached.data.toString('utf8'), 'default-left');

  clearProtectedAssetCache();
  assert.equal(getProtectedAssetCacheStats().entries, 0);
  await assert.rejects(
      loadProtectedAsset('skin/default/left.webp', { protectedAssetsDir }),
    /Unsupported state|authenticate|bad decrypt|unable to authenticate/i,
  );
});

test('loadProtectedAsset does not cache assets larger than the configured cache limit', async () => {
  clearProtectedAssetCache();
  const protectedAssetsDir = createProtectedAssetsFixture();

  const asset = await loadProtectedAsset('skin/default/left.webp', {
    protectedAssetsDir,
    maxCacheBytes: 1,
  });

  assert.equal(asset.data.toString('utf8'), 'default-left');
  assert.equal(getProtectedAssetCacheStats().entries, 0);
});

test('readManifest uses memory cache without scanning disk when manifest Cache is active', async () => {
  clearProtectedAssetCache();
  const protectedAssetsDir = createProtectedAssetsFixture();

  const first = readManifest({ protectedAssetsDir });
  assert.ok(first);
  assert.ok(first.manifest);

  // Rename manifest on disk; if readManifest checks disk existsSync before cache, or re-reads, it will fail/miss
  const manifestPath = path.join(protectedAssetsDir, 'manifest.json');
  const tempPath = path.join(protectedAssetsDir, 'manifest.json.bak');
  fs.renameSync(manifestPath, tempPath);

  try {
    const second = readManifest({ protectedAssetsDir });
    assert.ok(second);
    assert.deepEqual(second.manifest, first.manifest);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.renameSync(tempPath, manifestPath);
    }
    clearProtectedAssetCache();
  }
});

test('readManifest caches negative lookups until clearProtectedAssetCache is called', async () => {
  clearProtectedAssetCache();
  const protectedAssetsDir = createProtectedAssetsFixture();
  const fixtureRoot = path.dirname(protectedAssetsDir);
  const fixtureManifestPath = path.join(protectedAssetsDir, 'manifest.json');
  const defaultManifestPath = path.resolve(__dirname, '..', 'protected-assets', 'manifest.json');
  const originalExistsSync = fs.existsSync;
  let hideManifest = true;

  fs.existsSync = (candidatePath) => {
    const resolved = path.resolve(candidatePath);
    if (hideManifest && (resolved === fixtureManifestPath || resolved === defaultManifestPath)) {
      return false;
    }
    return originalExistsSync(candidatePath);
  };

  try {
    // Simulate a missing default manifest, then make it available again.
    assert.equal(readManifest({ appRoot: fixtureRoot }), null);
    hideManifest = false;

    // The negative lookup remains cached until the cache is explicitly cleared.
    assert.equal(readManifest({ appRoot: fixtureRoot }), null);

    clearProtectedAssetCache();
    assert.ok(readManifest({ appRoot: fixtureRoot }));
  } finally {
    fs.existsSync = originalExistsSync;
    clearProtectedAssetCache();
  }
});

test('loadProtectedAsset asynchronously decrypts assets and deduplicates concurrent in-flight requests', async () => {
  clearProtectedAssetCache();
  const protectedAssetsDir = createProtectedAssetsFixture();

  // Launch two concurrent requests for the exact same asset before cache is populated
  const [asset1, asset2] = await Promise.all([
    loadProtectedAsset('skin/default/left.webp', { protectedAssetsDir }),
    loadProtectedAsset('skin/default/left.webp', { protectedAssetsDir }),
  ]);

  assert.equal(asset1.data.toString('utf8'), 'default-left');
  assert.equal(asset2.data.toString('utf8'), 'default-left');
  assert.equal(asset1.size, 12);
  assert.equal(getProtectedAssetCacheStats().entries, 1);

  clearProtectedAssetCache();
});


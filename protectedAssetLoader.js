const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_NAME = 'manifest.json';
const KEY = crypto.createHash('sha256')
  .update('deskpet-protected-skin-assets-v1')
  .digest();
const VALID_ASSET_ID = /^skin\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.webp$/;
const DEFAULT_MAX_CACHE_BYTES = 16 * 1024 * 1024;

const assetCache = new Map();
const inFlightLoads = new Map();
let cachedBytes = 0;
let manifestCache = null;
let manifestCacheDir = null;
let manifestNotFound = false;

function createAssetUrl(assetId) {
  return `pet-asset://${assetId}`;
}

function normalizeAssetId(assetId) {
  if (typeof assetId !== 'string') return null;
  const normalized = assetId.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!VALID_ASSET_ID.test(normalized)) return null;
  return normalized;
}

function getProtectedAssetRoots(options = {}) {
  const roots = [];
  if (options.protectedAssetsDir) roots.push(options.protectedAssetsDir);
  if (options.appRoot) roots.push(path.join(options.appRoot, 'protected-assets'));
  if (options.resourcesPath) roots.push(path.join(options.resourcesPath, 'protected-assets'));
  if (options.appPath) roots.push(path.join(options.appPath, 'protected-assets'));
  if (options.appPath) roots.push(path.join(path.dirname(options.appPath), 'protected-assets'));
  roots.push(path.join(__dirname, 'protected-assets'));

  return [...new Set(roots.map(root => path.resolve(root)))];
}

function findProtectedAssetsDir(options = {}) {
  return getProtectedAssetRoots(options).find(root => fs.existsSync(path.join(root, MANIFEST_NAME))) || null;
}

function readManifest(options = {}) {
  if (manifestCache && manifestCacheDir) {
    if (!options.protectedAssetsDir || path.resolve(options.protectedAssetsDir) === manifestCacheDir) {
      return { manifest: manifestCache, protectedAssetsDir: manifestCacheDir };
    }
  }

  if (manifestNotFound && !options.protectedAssetsDir) {
    return null;
  }

  const protectedAssetsDir = findProtectedAssetsDir(options);
  if (!protectedAssetsDir) {
    if (!options.protectedAssetsDir) {
      manifestNotFound = true;
    }
    return null;
  }

  const resolvedDir = path.resolve(protectedAssetsDir);
  if (manifestCache && manifestCacheDir === resolvedDir) {
    return { manifest: manifestCache, protectedAssetsDir: resolvedDir };
  }

  const manifestPath = path.join(resolvedDir, MANIFEST_NAME);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || manifest.algorithm !== 'aes-256-gcm' || !manifest.assets) {
    throw new Error('Unsupported protected asset manifest');
  }

  manifestCache = manifest;
  manifestCacheDir = resolvedDir;
  manifestNotFound = false;
  return { manifest, protectedAssetsDir: resolvedDir };
}

function cloneAsset(asset) {
  return {
    data: Buffer.from(asset.data),
    contentType: asset.contentType,
    size: asset.size,
  };
}

function createCacheKey(protectedAssetsDir, assetId) {
  return `${path.resolve(protectedAssetsDir)}\0${assetId}`;
}

function getCachedAsset(cacheKey) {
  const cached = assetCache.get(cacheKey);
  if (!cached) return null;

  assetCache.delete(cacheKey);
  assetCache.set(cacheKey, cached);
  return cloneAsset(cached.asset);
}

function setCachedAsset(cacheKey, asset, maxCacheBytes = DEFAULT_MAX_CACHE_BYTES) {
  if (!Number.isFinite(maxCacheBytes) || maxCacheBytes <= 0 || asset.size > maxCacheBytes) {
    return;
  }

  const existing = assetCache.get(cacheKey);
  if (existing) {
    cachedBytes -= existing.bytes;
    assetCache.delete(cacheKey);
  }

  const bytes = asset.size;
  assetCache.set(cacheKey, {
    asset,
    bytes,
  });
  cachedBytes += bytes;

  for (const [oldestKey, oldest] of assetCache) {
    if (cachedBytes <= maxCacheBytes) break;
    assetCache.delete(oldestKey);
    cachedBytes -= oldest.bytes;
  }
}

function clearProtectedAssetCache() {
  assetCache.clear();
  inFlightLoads.clear();
  cachedBytes = 0;
  manifestCache = null;
  manifestCacheDir = null;
  manifestNotFound = false;
}

function getProtectedAssetCacheStats() {
  return {
    entries: assetCache.size,
    bytes: cachedBytes,
    maxBytes: DEFAULT_MAX_CACHE_BYTES,
  };
}

function hasProtectedAsset(assetId, options = {}) {
  const normalized = normalizeAssetId(assetId);
  if (!normalized) return false;
  const result = readManifest(options);
  return Boolean(result?.manifest.assets[normalized]);
}

function listAvailableSkinIds(options = {}) {
  const result = readManifest(options);
  if (!result) return [];

  const ids = new Set();
  for (const assetId of Object.keys(result.manifest.assets)) {
    const match = assetId.match(/^skin\/([^/]+)\//);
    if (match) ids.add(match[1]);
  }
  return Array.from(ids);
}

function loadProtectedAsset(assetId, options = {}) {
  const normalized = normalizeAssetId(assetId);
  if (!normalized) {
    throw new Error('Invalid protected asset id');
  }

  const result = readManifest(options);
  const entry = result?.manifest.assets[normalized];
  if (!result || !entry) {
    throw new Error('Protected asset not found');
  }

  const fileName = path.basename(entry.file);
  if (fileName !== entry.file) {
    throw new Error('Invalid protected asset file name');
  }

  const cacheKey = createCacheKey(result.protectedAssetsDir, normalized);
  const cached = getCachedAsset(cacheKey);
  if (cached) return cached;

  const encrypted = fs.readFileSync(path.join(result.protectedAssetsDir, fileName));
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(entry.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(normalized));
  decipher.setAuthTag(Buffer.from(entry.authTag, 'base64'));
  const data = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  if (Number.isFinite(entry.size) && data.length !== entry.size) {
    throw new Error('Protected asset size mismatch');
  }
  if (entry.sha256) {
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (hash !== entry.sha256) throw new Error('Protected asset hash mismatch');
  }

  const asset = {
    data,
    contentType: entry.contentType || 'application/octet-stream',
    size: data.length,
  };
  setCachedAsset(cacheKey, asset, options.maxCacheBytes);
  return cloneAsset(asset);  // clone once on cache miss to protect cached buffer
}

async function loadProtectedAssetAsync(assetId, options = {}) {
  const normalized = normalizeAssetId(assetId);
  if (!normalized) {
    throw new Error('Invalid protected asset id');
  }

  const result = readManifest(options);
  const entry = result?.manifest.assets[normalized];
  if (!result || !entry) {
    throw new Error('Protected asset not found');
  }

  const fileName = path.basename(entry.file);
  if (fileName !== entry.file) {
    throw new Error('Invalid protected asset file name');
  }

  const cacheKey = createCacheKey(result.protectedAssetsDir, normalized);
  const cached = getCachedAsset(cacheKey);
  if (cached) return cached;

  let inFlightPromise = inFlightLoads.get(cacheKey);
  if (!inFlightPromise) {
    inFlightPromise = (async () => {
      try {
        const encrypted = await fs.promises.readFile(path.join(result.protectedAssetsDir, fileName));
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          KEY,
          Buffer.from(entry.iv, 'base64'),
        );
        decipher.setAAD(Buffer.from(normalized));
        decipher.setAuthTag(Buffer.from(entry.authTag, 'base64'));
        const data = Buffer.concat([decipher.update(encrypted), decipher.final()]);

        if (Number.isFinite(entry.size) && data.length !== entry.size) {
          throw new Error('Protected asset size mismatch');
        }
        if (entry.sha256) {
          const hash = crypto.createHash('sha256').update(data).digest('hex');
          if (hash !== entry.sha256) throw new Error('Protected asset hash mismatch');
        }

        const asset = {
          data,
          contentType: entry.contentType || 'application/octet-stream',
          size: data.length,
        };
        setCachedAsset(cacheKey, asset, options.maxCacheBytes);
        return asset;
      } finally {
        inFlightLoads.delete(cacheKey);
      }
    })();
    inFlightLoads.set(cacheKey, inFlightPromise);
  }

  const asset = await inFlightPromise;
  return cloneAsset(asset);
}

module.exports = {
  clearProtectedAssetCache,
  createAssetUrl,
  findProtectedAssetsDir,
  getProtectedAssetCacheStats,
  hasProtectedAsset,
  listAvailableSkinIds,
  loadProtectedAsset,
  loadProtectedAssetAsync,
  normalizeAssetId,
  readManifest,
};

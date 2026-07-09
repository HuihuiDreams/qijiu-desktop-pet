const fs = require('node:fs');
const path = require('node:path');
const { loadProtectedAsset, normalizeAssetId } = require('./protectedAssetLoader');

const PROTOCOL_SCHEME = 'pet-asset';

function assetIdFromUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;

  try {
    return normalizeAssetId(`${parsed.hostname}${decodeURIComponent(parsed.pathname)}`);
  } catch {
    return null;
  }
}

function createProtocolResponse(status, body, headers = {}) {
  return new Response(body, { status, headers });
}

function createAssetResponse(asset) {
  return createProtocolResponse(200, new Uint8Array(asset.data), {
    'Content-Type': asset.contentType,
    'Content-Length': String(asset.size),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
}

function loadDevelopmentSourceAsset(assetId, { appRoot } = {}) {
  const normalized = normalizeAssetId(assetId);
  if (!normalized) {
    throw new Error('Invalid source asset id');
  }

  const root = appRoot || __dirname;
  const assetsRoot = path.resolve(root, 'src', 'assets');
  const relativeAssetPath = normalized.replace(/^skin\//, '');
  const filePath = path.resolve(assetsRoot, ...relativeAssetPath.split('/'));
  const relativeToAssetsRoot = path.relative(assetsRoot, filePath);
  if (relativeToAssetsRoot.startsWith('..') || path.isAbsolute(relativeToAssetsRoot)) {
    throw new Error('Source asset path escaped assets root');
  }

  const data = fs.readFileSync(filePath);
  return {
    data,
    contentType: 'image/webp',
    size: data.length,
  };
}

function registerProtectedAssetProtocol({ protocol, app, protectedAssetsDir } = {}) {
  if (!protocol || typeof protocol.handle !== 'function') {
    throw new Error('Electron protocol.handle is required');
  }

  protocol.handle(PROTOCOL_SCHEME, (request) => {
    const assetId = assetIdFromUrl(request.url);
    if (!assetId) {
      return createProtocolResponse(400, 'Invalid pet asset URL');
    }

    const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : null;
    try {
      const asset = loadProtectedAsset(assetId, {
        protectedAssetsDir,
        appRoot: __dirname,
        appPath,
        resourcesPath: process.resourcesPath,
      });
      return createAssetResponse(asset);
    } catch (error) {
      if (!app?.isPackaged) {
        try {
          const asset = loadDevelopmentSourceAsset(assetId, { appRoot: appPath || __dirname });
          return createAssetResponse(asset);
        } catch {
          // Fall through to the protected-asset error path.
        }
      }

      console.error(`Failed to load protected asset ${assetId}:`, error);
      return createProtocolResponse(404, 'Pet asset not found');
    }
  });
}

module.exports = {
  PROTOCOL_SCHEME,
  assetIdFromUrl,
  loadDevelopmentSourceAsset,
  registerProtectedAssetProtocol,
};

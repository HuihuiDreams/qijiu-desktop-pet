const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { PROTOCOL_SCHEME, assetIdFromUrl, registerProtectedAssetProtocol } = require('../protectedAssetProtocol');
const { protectAssets } = require('../scripts/protect-assets');

test('assetIdFromUrl maps pet-asset skin URLs to manifest ids', () => {
  assert.equal(PROTOCOL_SCHEME, 'pet-asset');
  assert.equal(
    assetIdFromUrl('pet-asset://skin/default/yueqi/walk_left01.webp'),
    'skin/default/yueqi/walk_left01.webp',
  );
  assert.equal(assetIdFromUrl('pet-asset://skin/default/../left.webp'), null);
  assert.equal(assetIdFromUrl('https://skin/default/left.webp'), null);
  assert.equal(assetIdFromUrl('pet-asset://skin/default/icon.png'), null);
});

test('assetIdFromUrl rejects malformed encoded paths without throwing', () => {
  assert.doesNotThrow(() => assetIdFromUrl('pet-asset://skin/default/%E0%A4%A.webp'));
  assert.equal(assetIdFromUrl('pet-asset://skin/default/%E0%A4%A.webp'), null);
});

test('assetIdFromUrl rejects completely invalid URL strings', () => {
  assert.equal(assetIdFromUrl('not-a-url'), null);
  assert.equal(assetIdFromUrl(null), null);
});

test('protocol handler serves source assets in development when manifest is missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-protected-protocol-'));
  const sourceDir = path.join(root, 'src', 'assets', 'custom');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'cultivate.webp'), Buffer.from('source-webp'));

  const calls = [];
  const fakeProtocol = {
    handle(scheme, handler) {
      calls.push({ scheme, handler });
    },
  };
  const fakeApp = {
    isPackaged: false,
    getAppPath() {
      return root;
    },
  };

  registerProtectedAssetProtocol({
    protocol: fakeProtocol,
    app: fakeApp,
    protectedAssetsDir: path.join(root, 'missing-protected-assets'),
  });

  const response = await calls[0].handler({ url: 'pet-asset://skin/custom/cultivate.webp' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/webp');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('utf8'), 'source-webp');
});

test('protocol handler does not serve source assets in packaged mode', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-protected-packaged-'));
  const sourceDir = path.join(root, 'src', 'assets', 'custom');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'cultivate.webp'), Buffer.from('source-webp'));

  const calls = [];
  const fakeProtocol = {
    handle(scheme, handler) {
      calls.push({ scheme, handler });
    },
  };
  const fakeApp = {
    isPackaged: true,
    getAppPath() {
      return root;
    },
  };

  registerProtectedAssetProtocol({
    protocol: fakeProtocol,
    app: fakeApp,
    protectedAssetsDir: path.join(root, 'missing-protected-assets'),
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await calls[0].handler({ url: 'pet-asset://skin/custom/cultivate.webp' });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 404);
});

test('registerProtectedAssetProtocol installs one protocol handler', () => {
  const calls = [];
  const fakeProtocol = {
    handle(scheme, handler) {
      calls.push({ scheme, handler });
    },
  };

  registerProtectedAssetProtocol({ protocol: fakeProtocol });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].scheme, 'pet-asset');
  assert.equal(typeof calls[0].handler, 'function');
});

test('registerProtectedAssetProtocol throws if protocol is missing or invalid', () => {
  assert.throws(() => registerProtectedAssetProtocol({}), /Electron protocol.handle is required/);
  assert.throws(() => registerProtectedAssetProtocol({ protocol: {} }), /Electron protocol.handle is required/);
});

test('protocol handler rejects invalid URLs', async () => {
  const calls = [];
  const fakeProtocol = {
    handle(scheme, handler) {
      calls.push({ scheme, handler });
    },
  };
  registerProtectedAssetProtocol({ protocol: fakeProtocol });
  const response = await calls[0].handler({ url: 'not-a-url' });
  assert.equal(response.status, 400);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('utf8'), 'Invalid pet asset URL');
});

test('protocol handler falls through to 404 if source asset does not exist in dev mode', async () => {
  const calls = [];
  const fakeProtocol = {
    handle(scheme, handler) {
      calls.push({ scheme, handler });
    },
  };
  const fakeApp = {
    isPackaged: false,
    getAppPath() {
      return __dirname;
    },
  };
  registerProtectedAssetProtocol({ protocol: fakeProtocol, app: fakeApp });
  
  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await calls[0].handler({ url: 'pet-asset://skin/default/does-not-exist.webp' });
  } finally {
    console.error = originalConsoleError;
  }
  
  assert.equal(response.status, 404);
});

test('protocol handler asynchronously serves protected assets from encrypted files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-protected-protocol-async-'));
  const inputDir = path.join(root, 'src', 'assets');
  const skinDir = path.join(inputDir, 'default');
  fs.mkdirSync(skinDir, { recursive: true });
  fs.writeFileSync(path.join(skinDir, 'cultivate.webp'), Buffer.from('encrypted-async-webp'));
  const protectedAssetsDir = path.join(root, 'protected-assets');
  protectAssets({ inputDir, outputDir: protectedAssetsDir });

  const calls = [];
  const fakeProtocol = {
    handle(scheme, handler) {
      calls.push({ scheme, handler });
    },
  };

  registerProtectedAssetProtocol({
    protocol: fakeProtocol,
    protectedAssetsDir,
  });

  const response = await calls[0].handler({ url: 'pet-asset://skin/default/cultivate.webp' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/webp');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('utf8'), 'encrypted-async-webp');
});

const { loadDevelopmentSourceAsset, loadDevelopmentSourceAssetAsync } = require('../protectedAssetProtocol');

test('loadDevelopmentSourceAsset throws for invalid paths', () => {
  assert.throws(() => loadDevelopmentSourceAsset('invalid', {}), /Invalid source asset id/);
  assert.throws(() => loadDevelopmentSourceAsset('skin/../../escaping', {}), /Invalid source asset id/);
});

test('loadDevelopmentSourceAsset returns synchronous asset data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-dev-asset-'));
  const sourceDir = path.join(root, 'src', 'assets', 'default');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'test.webp'), Buffer.from('test-data'));

  const asset = loadDevelopmentSourceAsset('skin/default/test.webp', { appRoot: root });
  assert.equal(asset.contentType, 'image/webp');
  assert.equal(asset.size, 9);
  assert.equal(asset.data.toString(), 'test-data');
});

test('loadDevelopmentSourceAssetAsync throws for invalid paths', async () => {
  await assert.rejects(() => loadDevelopmentSourceAssetAsync('invalid', {}), /Invalid source asset id/);
  await assert.rejects(() => loadDevelopmentSourceAssetAsync('skin/../../escaping', {}), /Invalid source asset id/);
});

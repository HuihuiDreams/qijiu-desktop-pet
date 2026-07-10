const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSkinGalleryItems,
  resolveSkinPreviewUrl,
} = require('../skinGallery');

test('resolveSkinPreviewUrl prefers the skin right portrait, then left portrait', () => {
  const assets = new Set(['skin/birds/left.webp']);

  const previewUrl = resolveSkinPreviewUrl('birds', {
    assetExists: (skinId, filename) => assets.has(`skin/${skinId}/${filename}`),
    createAssetUrl: (assetId) => `pet-asset://${assetId}`,
  });

  assert.equal(previewUrl, 'pet-asset://skin/birds/left.webp');
});

test('resolveSkinPreviewUrl falls back to the default right portrait', () => {
  const previewUrl = resolveSkinPreviewUrl('missing-preview', {
    assetExists: () => false,
    createAssetUrl: (assetId) => `pet-asset://${assetId}`,
  });

  assert.equal(previewUrl, 'pet-asset://skin/default/kiss.webp');
});

test('buildSkinGalleryItems exposes safe localized gallery metadata', () => {
  const assets = new Set([
    'skin/default/right.webp',
    'skin/birds/right.webp',
  ]);

  const items = buildSkinGalleryItems({
    skinIds: ['default', 'birds'],
    currentSkinId: 'birds',
    getDisplayName: (skinId) => ({ default: 'Default skin', birds: 'Bird skin' })[skinId] || skinId,
    assetExists: (skinId, filename) => assets.has(`skin/${skinId}/${filename}`),
    createAssetUrl: (assetId) => `pet-asset://${assetId}`,
  });

  assert.deepEqual(items, [
    {
      id: 'default',
      displayName: 'Default skin',
      skinLabel: 'Default skin',
      artistName: '',
      previewUrl: 'pet-asset://skin/default/right.webp',
      isCurrent: false,
    },
    {
      id: 'birds',
      displayName: 'Bird skin',
      skinLabel: 'Bird skin',
      artistName: '',
      previewUrl: 'pet-asset://skin/birds/right.webp',
      isCurrent: true,
    },
  ]);
});

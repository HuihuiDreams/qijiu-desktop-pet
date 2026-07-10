const PREVIEW_FILENAMES = ['right.webp', 'left.webp', 'cultivate.webp'];
const FALLBACK_PREVIEW_ASSET_ID = 'skin/default/right.webp';

function resolveSkinPreviewUrl(skinId, { assetExists, createAssetUrl }) {
  for (const filename of PREVIEW_FILENAMES) {
    if (assetExists(skinId, filename)) {
      return createAssetUrl(`skin/${skinId}/${filename}`);
    }
  }

  return createAssetUrl(FALLBACK_PREVIEW_ASSET_ID);
}

function buildSkinGalleryItems({
  skinIds,
  currentSkinId,
  getDisplayName,
  assetExists,
  createAssetUrl,
}) {
  return skinIds.map((id) => ({
    id,
    displayName: getDisplayName(id),
    previewUrl: resolveSkinPreviewUrl(id, { assetExists, createAssetUrl }),
    isCurrent: id === currentSkinId,
  }));
}

module.exports = {
  buildSkinGalleryItems,
  resolveSkinPreviewUrl,
};

const PREVIEW_FILENAMES = ['kiss.webp', 'right.webp', 'left.webp', 'cultivate.webp'];
const FALLBACK_PREVIEW_ASSET_ID = 'skin/default/kiss.webp';

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
  getSkinLabel,
  getArtistName,
  assetExists,
  createAssetUrl,
}) {
  return skinIds.map((id) => ({
    id,
    displayName: getDisplayName(id),
    skinLabel: getSkinLabel ? getSkinLabel(id) : getDisplayName(id),
    artistName: getArtistName ? getArtistName(id) : '',
    previewUrl: resolveSkinPreviewUrl(id, { assetExists, createAssetUrl }),
    isCurrent: id === currentSkinId,
  }));
}

module.exports = {
  buildSkinGalleryItems,
  resolveSkinPreviewUrl,
};

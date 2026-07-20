const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  createIpcFailure,
  createIpcSuccess,
  isAllowedSkinId,
} = require('../../../ipcContracts');
const { createAssetUrl, hasProtectedAsset, listAvailableSkinIds } = require('../../../protectedAssetLoader');
const { buildSkinGalleryItems } = require('../../../skinGallery');

let deps = {};

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('get-available-skins', () => {
    return scanAvailableSkins();
  });

  ipcMain.handle('get-skin-gallery-items', (event) => {
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    return getSkinGalleryItems();
  });

  ipcMain.handle('set-current-skin', async (_event, skinId) => {
    const { sendPomodoroState, trayManager } = deps;
    if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
      return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
    }
    try {
      currentSkinId = skinId;
      sendPomodoroState();
      trayManager.refreshTrayMenu();
      return createIpcSuccess({ skinId });
    } catch (error) {
      console.error('Failed to set current skin:', error);
      return createIpcFailure('INTERNAL_ERROR', 'Failed to set current skin');
    }
  });

  ipcMain.handle('select-skin', async (event, skinId) => {
    const { skinSelectorWindowModule } = deps;
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
      return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
    }

    try {
      skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
      return createIpcSuccess(selectSkin(skinId));
    } catch (error) {
      skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
      console.error('Failed to select skin:', error);
      return createIpcFailure('INTERNAL_ERROR', 'Failed to select skin');
    }
  });

  ipcMain.handle('preview-skin', async (event, skinId) => {
    const { skinSelectorWindowModule } = deps;
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
      return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
    }

    try {
      skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
      selectSkin(skinId);
      return createIpcSuccess({ skinId });
    } catch (error) {
      console.error('Failed to preview skin:', error);
      return createIpcFailure('INTERNAL_ERROR', 'Failed to preview skin');
    }
  });

  ipcMain.handle('confirm-skin', async (event) => {
    const { skinSelectorWindowModule } = deps;
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    try {
      skinSelectorWindowModule.setSkinSelectorOriginalSkinId();
      hideSkinSelector();
      return createIpcSuccess({ skinId: currentSkinId });
    } catch (error) {
      console.error('Failed to confirm skin:', error);
      return createIpcFailure('INTERNAL_ERROR', 'Failed to confirm skin');
    }
  });

  ipcMain.handle('cancel-skin', (event) => {
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    cancelSkinPreview();
    return createIpcSuccess();
  });

  ipcMain.handle('close-skin-selector', (event) => {
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    cancelSkinPreview();
    return createIpcSuccess();
  });
}

// 皮肤显示名多语言 key 映射表（文件夹名 → I18N.ui key）
const SKIN_NAME_KEYS = {
  'default': 'skinDefault',
  'birds': 'skinBirds',
  'animal_ears': 'skinAnimalEars',
  'school_au': 'skinSchoolAu',
};

// 皮肤选择器用：皮肤名（不含画师）
const SKIN_LABEL_KEYS = {
  'default': 'skinDefaultLabel',
  'birds': 'skinBirdsLabel',
  'animal_ears': 'skinAnimalEarsLabel',
  'school_au': 'skinSchoolAuLabel',
};

// 皮肤选择器用：画师名
const SKIN_ARTIST_KEYS = {
  'default': 'skinDefaultArtist',
  'birds': 'skinBirdsArtist',
  'animal_ears': 'skinAnimalEarsArtist',
  'school_au': 'skinSchoolAuArtist',
};

function getSkinGalleryDisplayName(skinId) {
  const key = SKIN_NAME_KEYS[skinId];
  return key ? deps.trayManager.trayT(key) : skinId;
}

function getSkinLabel(skinId) {
  const key = SKIN_LABEL_KEYS[skinId];
  return key ? deps.trayManager.trayT(key) : skinId;
}

function getSkinArtistName(skinId) {
  const key = SKIN_ARTIST_KEYS[skinId];
  return key ? deps.trayManager.trayT(key) : '';
}

let currentSkinId = 'default'; // 当前皮肤 ID（用于托盘菜单 radio 标记）

/**
 * 扫描 src/assets/ 下的子目录，返回可用皮肤 ID 列表。
 * 使用 fs.statSync 过滤，仅返回文件夹名，排除非目录文件。
 */
let cachedAvailableSkins = null;
let cachedAvailableSkinsTimestamp = 0;
const SKINS_CACHE_TTL_MS = 2000;

function scanAvailableSkins(forceRefresh = false) {
  if (!forceRefresh && cachedAvailableSkins && Date.now() - cachedAvailableSkinsTimestamp < SKINS_CACHE_TTL_MS) {
    return cachedAvailableSkins;
  }
  try {
    const protectedSkinIds = listAvailableSkinIds({
      appRoot: __dirname,
      resourcesPath: process.resourcesPath,
      appPath: typeof app?.getAppPath === 'function' ? app.getAppPath() : null,
    });
    if (protectedSkinIds.length > 0) {
      cachedAvailableSkins = protectedSkinIds.sort(sortSkinIds);
      cachedAvailableSkinsTimestamp = Date.now();
      return cachedAvailableSkins;
    }

    const assetsDir = path.join(__dirname, '..', '..', '..', 'src', 'assets');
    const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
    cachedAvailableSkins = entries.filter(dirent => {
      if (!dirent.isDirectory()) return false;
      const entry = path.basename(dirent.name); // Sanitize to prevent traversal
      try {
        const fullPath = path.join(assetsDir, entry);
        if (!fullPath.startsWith(assetsDir)) return false;
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }

    }).map(dirent => dirent.name).sort(sortSkinIds);
    cachedAvailableSkinsTimestamp = Date.now();
    return cachedAvailableSkins;
  } catch (error) {
    console.error('Failed to scan skins:', error);
    return ['default'];
  }
}

function sortSkinIds(a, b) {
  const keys = Object.keys(SKIN_NAME_KEYS);
  const indexA = keys.indexOf(a);
  const indexB = keys.indexOf(b);
  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  return a.localeCompare(b);
}

function hasSkinAsset(skinId, filename) {
  const assetId = `skin/${skinId}/${filename}`;
  try {
    if (hasProtectedAsset(assetId, { appRoot: __dirname, resourcesPath: process.resourcesPath })) {
      return true;
    }
  } catch (error) {
    console.warn(`Failed to inspect protected skin asset ${assetId}:`, error);
  }

  return fs.existsSync(path.join(__dirname, '..', '..', '..', 'src', 'assets', skinId, filename));
}

function getSkinGalleryItems() {
  const { skinSelectorWindowModule } = deps;
  const activeSkinId = skinSelectorWindowModule.getSkinSelectorOriginalSkinId() != null ? skinSelectorWindowModule.getSkinSelectorOriginalSkinId() : currentSkinId;
  return buildSkinGalleryItems({
    skinIds: scanAvailableSkins(),
    currentSkinId: activeSkinId,
    getDisplayName: getSkinGalleryDisplayName,
    getSkinLabel,
    getArtistName: getSkinArtistName,
    assetExists: hasSkinAsset,
    createAssetUrl,
  });
}

function selectSkin(skinId) {
  const { windowManager, sendPomodoroState, trayManager } = deps;
  currentSkinId = skinId;
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send('switch-skin', skinId);
  }
  sendPomodoroState();
  trayManager.refreshTrayMenu();
  return { skinId };
}

function isSkinSelectorRequest(event) {
  const { windowManager } = deps;
  return Boolean(
    windowManager.skinSelectorWindow
    && !windowManager.skinSelectorWindow.isDestroyed()
    && event?.sender?.id === windowManager.skinSelectorWindow.webContents.id,
  );
}

function cancelSkinPreview() {
  const { skinSelectorWindowModule } = deps;
  if (skinSelectorWindowModule.getSkinSelectorOriginalSkinId() != null && skinSelectorWindowModule.getSkinSelectorOriginalSkinId() !== currentSkinId) {
    selectSkin(skinSelectorWindowModule.getSkinSelectorOriginalSkinId());
  }
  skinSelectorWindowModule.setSkinSelectorOriginalSkinId();
  hideSkinSelector();
}

function hideSkinSelector() {
  const { windowManager, skinSelectorWindowModule } = deps;
  skinSelectorWindowModule.setSkinSelectorSelectionInProgress();
  if (windowManager.skinSelectorWindow && !windowManager.skinSelectorWindow.isDestroyed()) {
    windowManager.skinSelectorWindow.hide();
  }
}

/**
 * 番茄钟场景下解析皮肤素材 URL，皮肤非法或素材缺失时回退到 default。
 */
function resolvePomodoroAsset(skinId, filename) {
  const safeSkinId = isAllowedSkinId(skinId, scanAvailableSkins()) ? skinId : 'default';
  const protectedAssetId = `skin/${safeSkinId}/${filename}`;
  if (hasProtectedAsset(protectedAssetId, { appRoot: __dirname, resourcesPath: process.resourcesPath })) {
    return createAssetUrl(protectedAssetId);
  }

  const candidatePath = path.join(__dirname, '..', '..', '..', 'src', 'assets', safeSkinId, filename);
  if (fs.existsSync(candidatePath)) {
    return createAssetUrl(protectedAssetId);
  }
  return createAssetUrl(`skin/default/${filename}`);
}

module.exports = {
  init,
  scanAvailableSkins,
  getSkinGalleryItems,
  selectSkin,
  isSkinSelectorRequest,
  cancelSkinPreview,
  hideSkinSelector,
  resolvePomodoroAsset,
  getCurrentSkinId: () => currentSkinId,
  setCurrentSkinId: (val) => { currentSkinId = val; },
};

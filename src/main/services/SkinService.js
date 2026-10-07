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
const { isSenderMainWindow } = require('./IpcSenderAuthorization');

let deps = {};

function init(dependencies) {
  deps = dependencies;

  ipcMain.handle('get-available-skins', (event) => {
    if (!isSenderMainWindow(event, deps.windowManager.mainWindow)) return [];
    return scanAvailableSkins();
  });

  ipcMain.handle('get-available-overlay-keys', (event, skinId) => {
    if (!isSenderMainWindow(event, deps.windowManager.mainWindow)) return [];
    return getAvailableOverlayKeys(skinId || confirmedSkinId);
  });

  ipcMain.handle('get-skin-gallery-items', (event) => {
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    return getSkinGalleryItems();
  });

  ipcMain.handle('set-current-skin', async (event, skinId) => {
    const { sendPomodoroState, trayManager } = deps;
    if (!isSenderMainWindow(event, deps.windowManager.mainWindow)) {
      return createIpcFailure('FORBIDDEN', 'Skin access denied');
    }
    if (!isAllowedSkinId(skinId, scanAvailableSkins())) {
      return createIpcFailure('VALIDATION_ERROR', 'Invalid skin id');
    }
    if (previewTargetSkinId) {
      return createIpcFailure('STALE_REQUEST', 'A skin preview is active');
    }
    try {
      confirmedSkinId = skinId;
      previewTargetSkinId = null;
      lastLoadedSkinId = skinId;
      lastLoadSuccess = true;
      sendPomodoroState();
      trayManager.refreshTrayMenu();
      return createIpcSuccess({ skinId });
    } catch (error) {
      console.error('Failed to set current skin:', error);
      return createIpcFailure('INTERNAL_ERROR', 'Failed to set current skin');
    }
  });

  ipcMain.handle('report-skin-loaded', async (event, skinId, result = {}) => {
    if (!isSenderMainWindow(event, deps.windowManager?.mainWindow)) {
      return createIpcFailure('FORBIDDEN', 'Skin report access denied');
    }
    const success = result.success !== false;
    recordSkinLoadResult(skinId, success, result.error || null, result.requestId);
    return createIpcSuccess({ skinId, success });
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
      selectSkin(skinId, { isPreview: true });
      return createIpcSuccess({ skinId });
    } catch (error) {
      console.error('Failed to preview skin:', error);
      return createIpcFailure('INTERNAL_ERROR', 'Failed to preview skin');
    }
  });

  ipcMain.handle('confirm-skin', async (event) => {
    const { skinSelectorWindowModule, sendPomodoroState, trayManager } = deps;
    if (!isSkinSelectorRequest(event)) {
      return createIpcFailure('FORBIDDEN', 'Skin selector access denied');
    }
    try {
      const targetSkinId = previewTargetSkinId || confirmedSkinId;
      const requestId = skinLoadRequestId;

      if (previewTargetSkinId) {
        if (lastLoadedSkinId !== targetSkinId || lastLoadedRequestId !== requestId) {
          const loadResult = await waitForSkinLoad(targetSkinId, requestId, 2500);
          if (!loadResult.success) {
            return createIpcFailure('LOAD_FAILED', loadResult.error || 'Skin failed to load');
          }
        } else if (!lastLoadSuccess) {
          return createIpcFailure('LOAD_FAILED', lastLoadError || 'Skin failed to load');
        }

        if (requestId !== skinLoadRequestId || targetSkinId !== previewTargetSkinId || !isSkinSelectorRequest(event)) {
          return createIpcFailure('STALE_REQUEST', 'Skin preview changed');
        }

        confirmedSkinId = targetSkinId;
        previewTargetSkinId = null;

        const store = deps.StoreManager?.getStore?.();
        if (store) {
          const petState = store.get('petState');
          if (petState && typeof petState === 'object') {
            store.set('petState', { ...petState, skinId: confirmedSkinId });
          }
        }

        sendPomodoroState();
        trayManager.refreshTrayMenu();

        if (deps.windowManager?.mainWindow && !deps.windowManager.mainWindow.isDestroyed()) {
          deps.windowManager.mainWindow.webContents.send('switch-skin', confirmedSkinId, { isPreview: false, persist: true });
        }
      } else {
        previewTargetSkinId = null;
      }

      skinSelectorWindowModule.setSkinSelectorOriginalSkinId();
      hideSkinSelector();
      return createIpcSuccess({ skinId: confirmedSkinId });
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

let confirmedSkinId = 'default'; // 当前已确认提交的皮肤 ID
let previewTargetSkinId = null; // 当前正在预览的皮肤 ID（未确认时为 null）
let lastLoadedSkinId = 'default';
let lastLoadSuccess = true;
let lastLoadError = null;
let skinLoadRequestId = 0;
let lastLoadedRequestId = null;
let pendingLoadResolvers = [];

function cancelPendingSkinLoads(error) {
  for (const item of pendingLoadResolvers) {
    clearTimeout(item.timer);
    item.resolve({ success: false, error });
  }
  pendingLoadResolvers = [];
}

function recordSkinLoadResult(skinId, success, error = null, requestId) {
  if (previewTargetSkinId && (requestId !== skinLoadRequestId || skinId !== previewTargetSkinId)) return;
  lastLoadedSkinId = skinId;
  lastLoadedRequestId = requestId;
  lastLoadSuccess = success;
  lastLoadError = error;

  const remaining = [];
  for (const item of pendingLoadResolvers) {
    if (item.skinId === skinId && item.requestId === requestId) {
      if (item.timer) clearTimeout(item.timer);
      item.resolve({ success, error });
    } else {
      remaining.push(item);
    }
  }
  pendingLoadResolvers = remaining;
}

function waitForSkinLoad(targetSkinId, requestId, timeoutMs = 2500) {
  if (lastLoadedSkinId === targetSkinId && lastLoadedRequestId === requestId) {
    return Promise.resolve({ success: lastLoadSuccess, error: lastLoadError });
  }
  return new Promise((resolve) => {
    let timer = null;
    let entry = null;
    timer = setTimeout(() => {
      pendingLoadResolvers = pendingLoadResolvers.filter(p => p !== entry);
      resolve({ success: false, error: 'TIMEOUT' });
    }, timeoutMs);
    entry = { skinId: targetSkinId, requestId, resolve, timer };
    pendingLoadResolvers.push(entry);
  });
}

/**
 * 返回可用皮肤 ID 列表。
 * 优先从加密 manifest 读取；manifest 缺失时 fallback 到 src/assets/ 目录扫描，
 * 但只保留已在 SKIN_NAME_KEYS 白名单中注册的皮肤 ID，
 * 防止 fonts 等非皮肤子目录被误识别为皮肤。
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

    const knownSkinIds = new Set(Object.keys(SKIN_NAME_KEYS));
    const assetsDir = path.join(__dirname, '..', '..', '..', 'src', 'assets');
    const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
    cachedAvailableSkins = entries.filter(dirent => {
      if (!dirent.isDirectory()) return false;
      const entry = path.basename(dirent.name); // Sanitize to prevent traversal
      if (!knownSkinIds.has(entry)) return false; // 只允许白名单内的皮肤 ID
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
  const currentSkinId = confirmedSkinId;
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
  const options = arguments[1] || {};
  const { windowManager, sendPomodoroState, trayManager } = deps;
  const isPreview = options.isPreview === true;
  cancelPendingSkinLoads('SUPERSEDED');
  const requestId = ++skinLoadRequestId;

  if (isPreview) {
    previewTargetSkinId = skinId;
    lastLoadedSkinId = null;
    lastLoadedRequestId = null;
    lastLoadSuccess = false;
    lastLoadError = null;
    if (typeof deps.cancelScreensaverSession === 'function') {
      deps.cancelScreensaverSession('skin-changed');
    }
    if (windowManager?.mainWindow && !windowManager.mainWindow.isDestroyed()) {
      windowManager.mainWindow.webContents.send('switch-skin', skinId, { isPreview: true, requestId });
    }
  } else {
    confirmedSkinId = skinId;
    previewTargetSkinId = null;
    lastLoadedSkinId = skinId;
    lastLoadSuccess = true;
    if (typeof deps.cancelScreensaverSession === 'function') {
      deps.cancelScreensaverSession('skin-changed');
    }
    if (windowManager?.mainWindow && !windowManager.mainWindow.isDestroyed()) {
      windowManager.mainWindow.webContents.send('switch-skin', skinId, { isPreview: false });
    }
    if (typeof sendPomodoroState === 'function') {
      sendPomodoroState();
    }
    if (trayManager?.refreshTrayMenu) {
      trayManager.refreshTrayMenu();
    }
  }
  return { skinId };
}

function isSkinSelectorRequest(event) {
  const { windowManager } = deps;
  return Boolean(
    windowManager?.skinSelectorWindow
    && !windowManager.skinSelectorWindow.isDestroyed()
    && event?.sender?.id === windowManager.skinSelectorWindow.webContents.id,
  );
}

function revertSkinPreview(originalSkinId) {
  cancelPendingSkinLoads('CANCELLED');
  ++skinLoadRequestId;

  const targetId = originalSkinId || confirmedSkinId;
  confirmedSkinId = targetId;
  previewTargetSkinId = null;
  lastLoadedSkinId = confirmedSkinId;
  lastLoadSuccess = true;

  if (deps.windowManager?.mainWindow && !deps.windowManager.mainWindow.isDestroyed()) {
    deps.windowManager.mainWindow.webContents.send('switch-skin', confirmedSkinId, { isPreview: false });
  }
}

function cancelSkinPreview() {
  const { skinSelectorWindowModule } = deps;
  const originalSkinId = skinSelectorWindowModule?.getSkinSelectorOriginalSkinId?.();
  revertSkinPreview(originalSkinId);
  skinSelectorWindowModule?.setSkinSelectorOriginalSkinId?.();
  hideSkinSelector();
}

function hideSkinSelector() {
  deps.skinSelectorWindowModule?.closeSkinSelectorWindow?.();
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

function getAvailableOverlayKeys(skinId) {
  const CANDIDATE_KEYS = ['hug', 'shareFood', 'kiss', 'throwup', 'cultivate'];
  const safeSkinId = isAllowedSkinId(skinId, scanAvailableSkins()) ? skinId : 'default';
  return CANDIDATE_KEYS.filter((key) => hasSkinAsset(safeSkinId, `${key}.webp`));
}

module.exports = {
  init,
  scanAvailableSkins,
  getSkinGalleryItems,
  selectSkin,
  isSkinSelectorRequest,
  revertSkinPreview,
  cancelSkinPreview,
  hideSkinSelector,
  resolvePomodoroAsset,
  getAvailableOverlayKeys,
  getCurrentSkinId: () => confirmedSkinId,
  getConfirmedSkinId: () => confirmedSkinId,
  getPreviewSkinId: () => previewTargetSkinId,
  setCurrentSkinId: (val) => {
    cancelPendingSkinLoads('CANCELLED');
    ++skinLoadRequestId;
    confirmedSkinId = val;
    previewTargetSkinId = null;
    lastLoadedSkinId = val;
    lastLoadSuccess = true;
  },
};

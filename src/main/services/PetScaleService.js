/**
 * src/main/services/PetScaleService.js
 * 桌宠体型大小服务：持久化存储、实时预览、确认/取消状态机与 IPC 通信。
 */
const { ipcMain: electronIpcMain } = require('electron');
const { PET_SCALE_STORE_KEY } = require('../constants');
const { normalizePetScalePercent, PET_SCALE_DEFAULT_PERCENT } = require('../../../ipcContracts');
const { isSenderMainWindow } = require('./IpcSenderAuthorization');

function createPetScaleService(dependencies = {}, options = {}) {
  const serviceDeps = { ...dependencies };
  let localCommitted = PET_SCALE_DEFAULT_PERCENT;
  let localPreview = null;

  const store = serviceDeps.StoreManager?.getStore?.() || serviceDeps.store;
  if (store && typeof store.get === 'function') {
    localCommitted = normalizePetScalePercent(store.get(PET_SCALE_STORE_KEY));
  }

  const broadcast = (percent) => {
    const mainWindow = serviceDeps.windowManager?.mainWindow;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pet-scale-changed', percent);
    }
  };

  if (options.registerIpc !== false) {
    const ipc = serviceDeps.ipcMain || electronIpcMain;
    if (ipc && typeof ipc.handle === 'function') {
      ipc.handle('get-pet-scale', (event) => {
        if (!isSenderMainWindow(event, serviceDeps.windowManager?.mainWindow)) {
          return null;
        }
        return localCommitted;
      });
    }
  }

  return {
    getCommittedPercent: () => localCommitted,
    getPreviewPercent: () => localPreview ?? localCommitted,
    preview: (percent) => {
      const normalized = normalizePetScalePercent(percent);
      localPreview = normalized;
      broadcast(normalized);
      return normalized;
    },
    confirm: () => {
      const target = localPreview ?? localCommitted;
      localCommitted = target;
      localPreview = null;
      if (store && typeof store.set === 'function') {
        store.set(PET_SCALE_STORE_KEY, localCommitted);
      }
      broadcast(localCommitted);
      return localCommitted;
    },
    cancel: () => {
      localPreview = null;
      broadcast(localCommitted);
      return localCommitted;
    },
  };
}

let activeService = createPetScaleService({}, { registerIpc: false });

function init(dependencies = {}) {
  activeService = createPetScaleService(dependencies);
  return activeService;
}

module.exports = {
  init,
  createPetScaleService,
  getCommittedPercent: () => activeService.getCommittedPercent(),
  getPreviewPercent: () => activeService.getPreviewPercent(),
  preview: (percent) => activeService.preview(percent),
  confirm: () => activeService.confirm(),
  cancel: () => activeService.cancel(),
};


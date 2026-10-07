/**
 * SkinSwitchController — 皮肤切换编排：读取主进程提供的可用皮肤列表、
 * 防止并发切换、应用皮肤到 SkinManager、回写当前皮肤到主进程，并触发持久化。
 *
 * deps：
 *   - skinManager: SkinManager 实例
 *   - skinTargets: 传给 SkinManager.applySkin 的 { petA, petB, spriteView, renderer }
 *   - electronAPI: window.electronAPI（getAvailableSkins / setCurrentSkin）
 *   - saveCurrentState: () => Promise 持久化回调
 *   - clearInteractionOverlay: () => void 清除当前互动覆盖层的回调
 */
class SkinSwitchController {
  constructor(deps = {}) {
    this.skinManager = deps.skinManager;
    this.skinTargets = deps.skinTargets;
    this.electronAPI = deps.electronAPI;
    this.saveCurrentState = typeof deps.saveCurrentState === 'function'
      ? deps.saveCurrentState
      : () => Promise.resolve();
    this.clearInteractionOverlay = typeof deps.clearInteractionOverlay === 'function'
      ? deps.clearInteractionOverlay
      : () => {};
    this.skinSwitchInProgress = false;
    this.pendingRequest = null;
  }

  isSwitching() {
    return this.skinSwitchInProgress || this.pendingRequest !== null;
  }

  /**
   * 从主进程读取可用皮肤列表并写入 SkinManager；失败时静默回退到 default。
   */
  async refreshAvailableSkins() {
    try {
      const skinIds = await this.electronAPI.getAvailableSkins();
      if (Array.isArray(skinIds) && skinIds.length > 0) {
        this.skinManager.setAvailableSkins(skinIds);
      }
    } catch (err) {
      console.warn('读取可用皮肤列表失败，回退到 default:', err);
    }
  }

  /**
   * 切换到指定皮肤 ID；未知 ID 回退到 default。串行加载并保留最后待执行请求。
   * @param {string} skinId
   * @param {{ persist?: boolean }} options - persist 默认 true，加载存档时传 false 避免覆盖式重复保存
   */
  async applySkinById(skinId, options = {}) {
    if (this.skinSwitchInProgress) {
      if (this.pendingRequest) {
        this.pendingRequest.resolve({ success: false, superseded: true });
      }
      return new Promise((resolve, reject) => {
        this.pendingRequest = { skinId, options, resolve, reject };
      });
    }

    this.skinSwitchInProgress = true;
    let currentSkinId = skinId;
    let currentOptions = options;
    let currentDeferred = null;

    try {
      while (true) {
        let switchError = null;
        let appliedSkinId = null;
        const reportOptions = currentOptions.requestId === undefined ? {} : { requestId: currentOptions.requestId };

        try {
          const availableSkinIds = this.skinManager.getAvailableSkins().map(skin => skin.id);
          const nextSkinId = availableSkinIds.includes(currentSkinId) ? currentSkinId : 'default';

          this.clearInteractionOverlay();

          await this.skinManager.applySkin(nextSkinId, this.skinTargets);
          appliedSkinId = nextSkinId;

          // 若在加载期间产生了新的待执行请求，不覆盖主进程状态也不保存过时状态
          if (!this.pendingRequest) {
            const isPreview = currentOptions.isPreview === true;
            const shouldPersist = !isPreview && currentOptions.persist !== false;

            if (!isPreview && this.electronAPI && typeof this.electronAPI.setCurrentSkin === 'function') {
              this.electronAPI.setCurrentSkin(nextSkinId);
            }
            if (shouldPersist) {
              await this.saveCurrentState();
            }
            if (this.electronAPI && typeof this.electronAPI.reportSkinLoaded === 'function') {
              await this.electronAPI.reportSkinLoaded(nextSkinId, { success: true, ...reportOptions });
            }
          }
        } catch (err) {
          switchError = err;
          console.error('切换皮肤失败:', err);
          if (!this.pendingRequest && this.electronAPI && typeof this.electronAPI.reportSkinLoaded === 'function') {
            await this.electronAPI.reportSkinLoaded(currentSkinId, { success: false, error: err?.message || String(err), ...reportOptions });
          }
        }

        if (currentDeferred) {
          currentDeferred.resolve({
            success: !switchError,
            skinId: appliedSkinId,
            error: switchError,
          });
          currentDeferred = null;
        }

        if (this.pendingRequest) {
          const next = this.pendingRequest;
          this.pendingRequest = null;
          currentSkinId = next.skinId;
          currentOptions = next.options;
          currentDeferred = next;
        } else {
          break;
        }
      }
    } finally {
      this.skinSwitchInProgress = false;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SkinSwitchController };
}

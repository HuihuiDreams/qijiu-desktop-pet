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
  }

  isSwitching() {
    return this.skinSwitchInProgress;
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
   * 切换到指定皮肤 ID；未知 ID 回退到 default。同一时间只允许一次切换在途。
   * @param {string} skinId
   * @param {{ persist?: boolean }} options - persist 默认 true，加载存档时传 false 避免覆盖式重复保存
   */
  async applySkinById(skinId, options = {}) {
    if (this.skinSwitchInProgress) return;
    this.skinSwitchInProgress = true;
    const shouldPersist = options.persist !== false;

    try {
      const availableSkinIds = this.skinManager.getAvailableSkins().map(skin => skin.id);
      const nextSkinId = availableSkinIds.includes(skinId) ? skinId : 'default';

      this.clearInteractionOverlay();

      await this.skinManager.applySkin(nextSkinId, this.skinTargets);
      this.electronAPI.setCurrentSkin(nextSkinId);
      if (shouldPersist) {
        await this.saveCurrentState();
      }
    } catch (err) {
      console.error('切换皮肤失败:', err);
    } finally {
      this.skinSwitchInProgress = false;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SkinSwitchController };
}

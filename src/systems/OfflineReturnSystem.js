/**
 * OfflineReturnSystem — 离线回归结算的统一入口，以及围绕它的挂起/恢复/存档编排。
 *
 * 系统睡眠唤醒（macOS powerMonitor）、存档加载、游戏循环内的巨大 deltaMs 时间跳跃，
 * 三条路径最终都收敛到 handleOfflineReturn()：属性衰减 → 时辰计算 → 回归气泡 → 即时存档。
 *
 * deps：
 *   - getPets(): 返回 [yueqi, shenjiu]（顺序固定，与 app.js 创建顺序一致）
 *   - nurtureSystemA / nurtureSystemB: 分别对应 yueqi / shenjiu 的 NurtureSystem 实例
 *   - timeSystem: TimeSystem 实例（save/deserializePet）
 *   - skinManager: SkinManager 实例（读取当前皮肤 ID 用于存档）
 *   - dialogBubble: DialogBubble 实例（回归气泡）
 *   - getI18nUi(): () => window.I18N_UI，实时读取当前语言 UI 字典（语言切换时会被整体重新赋值，
 *     不能在构造时快照）
 *   - CONFIG: 全局配置对象（DECAY_INTERVAL）
 *   - now(): 可注入的墙钟时钟，默认 Date.now，测试时替换为受控时钟
 *   - isDocumentVisible(): 可注入的可见性查询，默认 document.visibilityState === 'visible'
 *   - initialLastVisibleTime: 初始的“用户上次可见”时间戳，默认 now()
 */
class OfflineReturnSystem {
  constructor(deps = {}) {
    this.getPets = deps.getPets;
    this.nurtureSystemA = deps.nurtureSystemA;
    this.nurtureSystemB = deps.nurtureSystemB;
    this.timeSystem = deps.timeSystem;
    this.skinManager = deps.skinManager;
    this.dialogBubble = deps.dialogBubble;
    this.getI18nUi = typeof deps.getI18nUi === 'function' ? deps.getI18nUi : () => null;
    this.CONFIG = deps.CONFIG;
    this.now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    this.isDocumentVisible = typeof deps.isDocumentVisible === 'function'
      ? deps.isDocumentVisible
      : () => document.visibilityState === 'visible';

    // 用户上次可见时的墙钟时间（跨 Dark Wake 不重置）
    this.lastVisibleTime = Number.isFinite(deps.initialLastVisibleTime)
      ? deps.initialLastVisibleTime
      : this.now();
  }

  /**
   * 保存两只宠物当前状态 + 当前皮肤 + lastVisibleTime。
   */
  saveCurrentState() {
    const [yueqi, shenjiu] = this.getPets();
    return this.timeSystem.save(yueqi, shenjiu, this.skinManager.getCurrentSkin(), this.lastVisibleTime);
  }

  /**
   * 离线回归结算（统一入口）。
   * 系统唤醒、保存恢复、游戏循环时间跳跃均复用此函数。
   * 负责：属性衰减 → 时辰计算 → 回归气泡 → 即时存档。
   */
  handleOfflineReturn(offlineMs) {
    const [yueqi, shenjiu] = this.getPets();
    this.nurtureSystemA.applyOfflineDecay(yueqi, offlineMs);
    this.nurtureSystemB.applyOfflineDecay(shenjiu, offlineMs);

    // 用“距离用户上次可见”的真实时长计算时辰，而不是本次碎片化的 offlineMs。
    // 这避免了 macOS Dark Wake 将完整睡眠切割成碎片导致对白少报。
    const realAwayMs = this.now() - this.lastVisibleTime;
    const shichensAway = Math.floor(realAwayMs / 7200000); // 7200000ms = 2小时 = 1时辰
    const isUserPresent = this.isDocumentVisible();

    if (shichensAway >= 1 && isUserPresent) {
      const i18nUi = this.getI18nUi();
      const returnMsgYueqi = i18nUi?.returnYueqi
        ? (typeof i18nUi.returnYueqi === 'function'
          ? i18nUi.returnYueqi(shichensAway)
          : i18nUi.returnYueqi)
        : `你走了${shichensAway}个时辰…`;
      const returnMsgShenjiu = i18nUi?.returnShenjiu ?? '…哼，终于回来了。';
      setTimeout(() => {
        this.dialogBubble.show(yueqi, returnMsgYueqi, 4000);
      }, 1500);
      setTimeout(() => {
        this.dialogBubble.show(shenjiu, returnMsgShenjiu, 4000);
      }, 3000);
    }

    if (isUserPresent) {
      this.lastVisibleTime = this.now();
    }

    this.saveCurrentState();
  }

  // === 系统睡眠/唤醒处理 (macOS 专用路径) ===
  // macOS 下 performance.now() 在睡眠期间冻结，导致 rAF 的 deltaMs 不会跳跃，
  // 所以游戏循环内的 deltaMs > 60000 检测永远不会触发。
  // 改用 Electron powerMonitor 事件 + Date.now() 墙钟差值来结算离线衰减。

  handleSystemSuspend() {
    if (this.isDocumentVisible()) {
      this.lastVisibleTime = this.now();
    }
    this.saveCurrentState(); // 睡前即时存档，锁定新鲜 timestamp
  }

  handleSystemResume(data) {
    const offlineMs = data?.offlineMs ?? 0;
    if (offlineMs > this.CONFIG.DECAY_INTERVAL) {
      this.handleOfflineReturn(offlineMs);
    }
  }

  /**
   * 应用从存档加载的状态：恢复 lastVisibleTime、反序列化宠物数值，
   * 离线时长超过衰减阈值时结算离线回归。savedState 为空时是无操作。
   */
  applyLoadedState(savedState) {
    if (!savedState) return;
    this.lastVisibleTime = savedState.lastVisibleTime ?? this.now();
    const [yueqi, shenjiu] = this.getPets();
    this.timeSystem.deserializePet(yueqi, savedState.petAData);
    this.timeSystem.deserializePet(shenjiu, savedState.petBData);

    // 应用离线衰减计算
    if (savedState.offlineMs > this.CONFIG.DECAY_INTERVAL) {
      this.handleOfflineReturn(savedState.offlineMs);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { OfflineReturnSystem };
}

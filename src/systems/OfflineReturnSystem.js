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

const RETURN_BUBBLE_DURATION_MS = 4000;   // 回归气泡展示时长

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

    this.isScreensaverActive = typeof deps.isScreensaverActive === 'function'
      ? deps.isScreensaverActive
      : () => false;
    this.pendingReturnBubble = null;
    this.returnBubbleSequenceId = 0;
  }

  /**
   * 保存两只宠物当前状态 + 当前皮肤 + lastVisibleTime。
   */
  /**
   * 刷新"用户上次可见"时间戳。游戏循环在正常模式（非暂停/非屏保/可见）时周期性调用，
   * 确保保存的 lastVisibleTime 始终是用户最近一次盯着桌宠的真实时刻。
   */
  refreshLastVisibleTime() {
    if (this.isDocumentVisible()) {
      this.lastVisibleTime = this.now();
    }
  }

  saveCurrentState() {
    this.refreshLastVisibleTime();
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

      const pending = {
        yueqi,
        shenjiu,
        returnMsgYueqi,
        returnMsgShenjiu,
      };
      this.pendingReturnBubble = pending;
      if (!this.isScreensaverActive()) {
        this.scheduleReturnBubbles(pending);
      }
    }

    if (isUserPresent) {
      this.lastVisibleTime = this.now();
    }

    this.saveCurrentState();
  }

  /**
   * 调度一组回归气泡（1.5s/3s 依次弹出），每次触发前重新检查屏保状态：
   * 屏保在展示期间又开始时（onStart 的 removeForPets 会清掉 DOM 气泡），
   * 剩余内容重新暂存，待屏保结束后由 flushPendingReturnBubble() 补发。
   * 同一序列的两个回调都成功展示（屏保未打断）时释放暂存。
   * // ponytail: 若屏保在末条气泡已触发（3s）后才开始，气泡会被 removeForPets 清掉且无法补发，
   * 仅影响用户回归后 3-7s 内再次进入屏保的极窄窗口（macOS 空闲超时通常远大于此），可接受；
   * 若需补上，恢复 ScreensaverSystem 的 onStart 钩子即可。
   */
  scheduleReturnBubbles(pending) {
    const sequenceId = ++this.returnBubbleSequenceId;
    let shownCount = 0;
    const fire = (pet, msg) => {
      if (sequenceId !== this.returnBubbleSequenceId || this.pendingReturnBubble !== pending) {
        return;
      }
      if (this.isScreensaverActive()) {
        this.returnBubbleSequenceId++; // 让同组尚未触发的旧回调失效，等待屏保结束后重排。
        return;
      }
      this.dialogBubble.show(pet, msg, RETURN_BUBBLE_DURATION_MS);
      shownCount++;
      if (shownCount === 2) {
        this.pendingReturnBubble = null; // 全部触发完成且未被打断，释放暂存
      }
    };
    setTimeout(() => fire(pending.yueqi, pending.returnMsgYueqi), 1500);
    setTimeout(() => fire(pending.shenjiu, pending.returnMsgShenjiu), 3000);
  }

  /**
   * 屏保结束（ScreensaverSystem.reset()）后调用：弹出暂存的回归气泡。
   * 无暂存气泡时是无操作。
   */
  flushPendingReturnBubble() {
    const pending = this.pendingReturnBubble;
    if (!pending) return;
    this.returnBubbleSequenceId++;
    this.scheduleReturnBubbles(pending);
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

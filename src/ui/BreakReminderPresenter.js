/**
 * BreakReminderPresenter — 久坐提醒的展示与消失编排。
 *
 * 收到主进程的触发事件后：把双人瞬移到主显示器中心、面对面站定、暂停移动、
 * 按时序显示提醒气泡，并在 20 秒后（或用户点击宠物）自动消失、恢复 idle。
 *
 * deps：
 *   - getPets(): 返回 [yueqi, shenjiu]（顺序固定，与 app.js 创建顺序一致）
 *   - dialogBubble: DialogBubble 实例
 *   - renderer: PetRenderer 实例
 *   - spriteView: SpriteView 实例
 *   - stageGeometry: StageGeometry 实例（读取 width/height/getWalkAreas）
 *   - getIsPaused(): () => boolean，桌宠是否处于暂停/隐藏状态
 *   - clearInteractionOverlay(): () => void，清除当前互动覆盖层的回调
 *   - electronAPI: window.electronAPI（dismissBreakReminder）
 *   - CONFIG: 全局配置对象（PET_SIZE）
 *   - getDialogues(): () => DIALOGUES，实时读取当前语言的对话文案池
 *     （DIALOGUES 会在语言切换时被 initDialogues() 整体重新赋值，必须每次调用时重新读取，
 *     不能在构造时快照，否则语言切换后提醒文案会停留在旧语言）
 */
class BreakReminderPresenter {
  constructor(deps = {}) {
    this.getPets = deps.getPets;
    this.dialogBubble = deps.dialogBubble;
    this.renderer = deps.renderer;
    this.spriteView = deps.spriteView;
    this.stageGeometry = deps.stageGeometry;
    this.getIsPaused = typeof deps.getIsPaused === 'function' ? deps.getIsPaused : () => false;
    this.clearInteractionOverlay = typeof deps.clearInteractionOverlay === 'function'
      ? deps.clearInteractionOverlay
      : () => {};
    this.electronAPI = deps.electronAPI;
    this.CONFIG = deps.CONFIG;
    this.getDialogues = typeof deps.getDialogues === 'function' ? deps.getDialogues : () => null;

    this.breakReminderActive = false;
    this.breakReminderDismissTimer = null;
  }

  isActive() {
    return this.breakReminderActive;
  }

  /**
   * 点击消失 / 20 秒自动消失：清除气泡、恢复 idle、通知主进程。
   */
  dismiss() {
    if (!this.breakReminderActive) return;
    this.breakReminderActive = false;
    if (this.breakReminderDismissTimer) {
      clearTimeout(this.breakReminderDismissTimer);
      this.breakReminderDismissTimer = null;
    }

    const [yueqi, shenjiu] = this.getPets();
    // 清除气泡
    this.dialogBubble.removeForPets([yueqi, shenjiu]);
    // 恢复状态
    yueqi.setState('idle');
    shenjiu.setState('idle');
    yueqi.idleTimer = 2000;
    shenjiu.idleTimer = 2000;
    // 通知主进程
    this.electronAPI.dismissBreakReminder();
  }

  /**
   * 主进程触发久坐提醒时调用。
   */
  handleTriggered(_payload) {
    // 桌宠隐藏或暂停时不展示
    if (this.getIsPaused()) {
      this.electronAPI.dismissBreakReminder();
      return;
    }
    // 如果已经在展示提醒，忽略
    if (this.breakReminderActive) return;

    this.breakReminderActive = true;

    const [yueqi, shenjiu] = this.getPets();

    // 清除现有互动覆盖层
    this.clearInteractionOverlay();
    // 清除现有气泡
    this.dialogBubble.removeForPets([yueqi, shenjiu]);

    const layout = this.stageGeometry.getCenteredPairLayout(
      yueqi,
      shenjiu,
      null,
      { fallbackPetSize: this.CONFIG.PET_SIZE },
    );
    if (!layout) {
      this.breakReminderActive = false;
      this.electronAPI.dismissBreakReminder();
      return;
    }

    [yueqi, shenjiu].forEach((pet, index) => {
      const position = layout.positions[index];
      pet.x = position.x;
      pet.y = position.y;
      pet.direction = position.direction;
    });

    // 暂停移动
    yueqi.setState('interacting');
    shenjiu.setState('interacting');

    // 立即更新渲染位置
    this.renderer.update(yueqi);
    this.renderer.update(shenjiu);
    this.spriteView.update(yueqi, 0);
    this.spriteView.update(shenjiu, 0);

    // 从文案池随机选取
    const pool = this.getDialogues()?.breakReminder;
    const yueqiTexts = pool?.yueqi;
    const shenjiuTexts = pool?.shenjiu;
    const yueqiText = Array.isArray(yueqiTexts) && yueqiTexts.length > 0
      ? yueqiTexts[Math.floor(Math.random() * yueqiTexts.length)]
      : '起来活动一下吧！';
    const shenjiuText = Array.isArray(shenjiuTexts) && shenjiuTexts.length > 0
      ? shenjiuTexts[Math.floor(Math.random() * shenjiuTexts.length)]
      : '…别坐太久了。';

    // 显示气泡
    setTimeout(() => {
      if (!this.breakReminderActive) return;
      this.dialogBubble.show(yueqi, yueqiText, 18000);
    }, 300);
    setTimeout(() => {
      if (!this.breakReminderActive) return;
      this.dialogBubble.show(shenjiu, shenjiuText, 17500);
    }, 800);

    // 20秒后自动消失
    this.breakReminderDismissTimer = setTimeout(() => this.dismiss(), 20000);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { BreakReminderPresenter };
}

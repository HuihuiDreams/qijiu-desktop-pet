/**
 * AmbientDialogueSystem — 随机闲聊、状态警告与深夜梦话的节奏调度。
 *
 * 每帧调用 update(deltaMs)：
 *   - 状态警告计时器：优先让状态过低（饥饿/灵力低/心情低）的宠物发言。
 *   - 闲聊计时器：随机挑一只宠物，按当前时段触发对应文案；深夜时段有概率触发梦话。
 *
 * deps：
 *   - getPets(): 返回 [yueqi, shenjiu]（顺序固定，与 app.js 创建顺序一致）
 *   - dialogBubble: DialogBubble 实例
 *   - t(key): 实时读取 window.t 的转发函数（语言切换后 window.t 会被重新赋值，
 *     因此这里传入的必须是每次调用都重新读取 window.t 的转发函数，而不是构造时的快照）
 *   - getDialogues(): () => DIALOGUES，实时读取当前语言的对话文案池（同样因语言切换重新赋值而需要实时读取）
 */
class AmbientDialogueSystem {
  constructor(deps = {}) {
    this.getPets = deps.getPets;
    this.dialogBubble = deps.dialogBubble;
    this.t = typeof deps.t === 'function' ? deps.t : (key) => key;
    this.getDialogues = typeof deps.getDialogues === 'function' ? deps.getDialogues : () => null;

    // === 闲聊计时器 ===
    this.chatterTimer = 15000 + Math.random() * 30000;
    // 状态警告专属计时器（比普通闲聊更频繁，确保低状态能触发对话）
    this.statWarningTimer = 8000 + Math.random() * 5000;
  }

  /**
   * 深夜梦话：读取 dream 词库，好感度达标时触发更亲昵的专属梦话；
   * 沈九有概率触发联动梦话，延迟触发岳七的梦中回应。
   */
  showNightDream(pet) {
    const [yueqi] = this.getPets();
    const dreamPool = this.getDialogues()?.dream;

    if (dreamPool) {
      let text = '';
      const affection = pet.stats.affection || 0;
      const isHighAffection = affection >= 80;

      // 尝试联动梦话 (目前以沈九发起，岳七回应为例)
      let isLinked = false;
      if (pet.id === 'shenjiu' && yueqi && yueqi.element && yueqi.timePhase === 'night') {
        // 沈九有概率触发联动梦话
        if (Math.random() < 0.3 && dreamPool.linked?.shenjiu) {
          isLinked = true;
          const pool = dreamPool.linked.shenjiu;
          text = pool[Math.floor(Math.random() * pool.length)];
          // 触发岳七的回应 (延迟几秒)
          setTimeout(() => {
            // 确保岳七依然处于合适状态
            if (!yueqi.isBusy() && yueqi.timePhase === 'night' && yueqi.element.style.display !== 'none') {
              const replyPool = dreamPool.linked.yueqi_reply;
              if (replyPool) {
                const replyText = replyPool[Math.floor(Math.random() * replyPool.length)];
                this.dialogBubble.show(yueqi, replyText, 4000);
              }
            }
          }, 2500); // 延迟2.5秒回复
        }
      }

      if (!isLinked) {
        const poolCategory = isHighAffection ? dreamPool.highAffection : dreamPool.lowAffection;
        if (poolCategory && poolCategory[pet.id]) {
          const pool = poolCategory[pet.id];
          text = pool[Math.floor(Math.random() * pool.length)];
        } else {
          // Fallback
          text = pet.id === 'yueqi'
            ? (this.t('nightYueqi') || '夜深了，早些休息吧。')
            : (this.t('nightShenjiu') || '…还不睡？想猝死吗。');
        }
      }

      if (text) {
        this.dialogBubble.show(pet, text, 5000);
      }
    } else {
      // Fallback
      const text = pet.id === 'yueqi'
        ? (this.t('nightYueqi') || '夜深了，早些休息吧。')
        : (this.t('nightShenjiu') || '…还不睡？想猝死吗。');
      this.dialogBubble.show(pet, text, 5000);
    }
  }

  /**
   * 每帧调用：推进状态警告与闲聊计时器，到点时挑选宠物触发对应对话。
   */
  update(deltaMs) {
    const [yueqi, shenjiu] = this.getPets();

    // 状态警告计时器：优先处理低状态的宠物
    this.statWarningTimer -= deltaMs;
    if (this.statWarningTimer <= 0) {
      this.statWarningTimer = 10000 + Math.random() * 8000;
      // 收集所有处于低状态的宠物
      const warnCandidates = [yueqi, shenjiu].filter(
        pet => !pet.isBusy() && !this.dialogBubble.activeBubbles.has(pet.id)
            && (pet.isHungry() || pet.isLowQi() || pet.isLowMood())
      );
      if (warnCandidates.length > 0) {
        // 随机挑一个低状态的宠物发言
        const pet = warnCandidates[Math.floor(Math.random() * warnCandidates.length)];
        this.dialogBubble.showStatWarning(pet);
      }
    }

    // 随机闲聊（仅在状态正常时触发）
    this.chatterTimer -= deltaMs;
    if (this.chatterTimer <= 0) {
      this.chatterTimer = 20000 + Math.random() * 40000;
      const pet = Math.random() > 0.5 ? yueqi : shenjiu;
      if (!pet.isBusy() && !this.dialogBubble.activeBubbles.has(pet.id)) {

        // 时段专属闲聊 (即使状态低落也有概率触发)
        if (pet.timePhase === 'morning' && Math.random() < 0.3) {
          const text = pet.id === 'yueqi'
            ? (this.t('morningYueqi') || '早安。')
            : (this.t('morningShenjiu') || '哼，起得倒早。');
          this.dialogBubble.show(pet, text, 5000);
        } else if (pet.timePhase === 'day' && Math.random() < 0.3) {
          const text = pet.id === 'yueqi'
            ? (this.t('dayYueqi') || '白日漫长，莫要太过劳累。')
            : (this.t('dayShenjiu') || '…大白天的，别到处乱晃。');
          this.dialogBubble.show(pet, text, 5000);
        } else if (pet.timePhase === 'dusk' && Math.random() < 0.3) {
          const text = pet.id === 'yueqi'
            ? (this.t('duskYueqi') || '黄昏了，一日又要结束了。')
            : (this.t('duskShenjiu') || '天色暗了。');
          this.dialogBubble.show(pet, text, 5000);
        } else if (pet.timePhase === 'evening' && Math.random() < 0.3) {
          const text = pet.id === 'yueqi'
            ? (this.t('eveningYueqi') || '夜幕已降，早点歇息吧。')
            : (this.t('eveningShenjiu') || '…少烦我，滚去睡觉。');
          this.dialogBubble.show(pet, text, 5000);
        } else if (pet.timePhase === 'night' && pet.state === 'idle' && Math.random() < 0.5) {
          // 深夜有 50% 概率保持安静，另外 50% 触发梦话
          if (Math.random() < 0.5) {
            this.showNightDream(pet);
          }
        } else if (!pet.isHungry() && !pet.isLowQi() && !pet.isLowMood()) {
          // 只有在状态健康时，才会进行普通的随机闲聊
          this.dialogBubble.showIdleChatter(pet);
        }
      }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { AmbientDialogueSystem };
}

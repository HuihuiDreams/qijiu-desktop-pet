/**
 * NurtureSystem — 养成系统。管理属性随时间的自然衰减以及玩家操作 (喂食、打坐、休息、抚摸)。
 */
class NurtureSystem {
  constructor() {
    this.decayAccumulator = 0; // 用于累计自然衰减时间的计时器
  }

  /**
   * 应用定期的属性衰减到宠物身上。
   * 每间隔 CONFIG.DECAY_INTERVAL 时间执行一次衰减。
   */
  update(pet, deltaMs) {
    // 累计过去的时间
    this.decayAccumulator += deltaMs;

    if (this.decayAccumulator >= CONFIG.DECAY_INTERVAL) {
      this.decayAccumulator -= CONFIG.DECAY_INTERVAL;
      this.applyDecay(pet);
    }

    // 处理有时间限制的动作状态
    if (pet.stateTimer > 0) {
      pet.stateTimer -= deltaMs;

      // 打坐状态下：随时间逐渐恢复灵力
      if (pet.state === 'meditating') {
        pet.modifyStat('qi', CONFIG.MEDITATE_QI_RATE * (deltaMs / 1000));
      }

      // 动作状态计时结束
      if (pet.stateTimer <= 0) {
        pet.stateTimer = 0;
        pet.setState('idle');
        pet.idleTimer = 2000;
      }
    }
  }

  /**
   * 应用自然的属性衰减。
   */
  applyDecay(pet) {
    pet.modifyStat('hunger', -CONFIG.HUNGER_DECAY);
    pet.modifyStat('qi', -CONFIG.QI_DECAY);
    pet.modifyStat('mood', -CONFIG.MOOD_DECAY);

    // 复合效果：过度饥饿或灵力过低会导致心境额外下降
    if (pet.stats.hunger < 30) {
      pet.modifyStat('mood', -1);
    }
    if (pet.stats.qi < 20) {
      pet.modifyStat('mood', -1);
    }
  }

  /**
   * 计算离线属性衰减（根据距离上次保存的时间）。
   */
  applyOfflineDecay(pet, offlineMs) {
    const intervals = Math.floor(offlineMs / CONFIG.DECAY_INTERVAL);
    for (let i = 0; i < intervals; i++) {
      this.applyDecay(pet);
    }
  }

  // === 玩家操作 (Player Actions) ===

  /**
   * 喂食宠物。
   */
  feed(pet) {
    if (pet.isBusy()) return false;
    pet.modifyStat('hunger', CONFIG.FEED_HUNGER);
    pet.modifyStat('mood', CONFIG.FEED_MOOD);
    pet.setState('eating');
    pet.stateTimer = 3000; // 进食动画的持续时间
    return true;
  }

  /**
   * 摸头/关怀宠物。
   */
  headPat(pet) {
    if (pet.isBusy()) return false;
    pet.modifyStat('affection', CONFIG.PET_AFFECTION);
    pet.modifyStat('mood', CONFIG.PET_MOOD);
    pet.setState('patted');
    pet.stateTimer = 3000;
    return true;
  }

  /**
   * 开始打坐修炼。
   */
  meditate(pet) {
    if (pet.isBusy()) return false;
    pet.setState('meditating');
    pet.stateTimer = CONFIG.MEDITATE_DURATION;
    return true;
  }

  /**
   * 休息。瞬间恢复灵力但会消耗饱腹度。
   */
  rest(pet) {
    if (pet.isBusy()) return false;
    if (pet.stats.hunger < CONFIG.REST_HUNGER_COST + 5) return false; // 太饿了不能休息
    pet.modifyStat('qi', CONFIG.REST_QI);
    pet.modifyStat('hunger', -CONFIG.REST_HUNGER_COST);
    pet.setState('sleeping');
    pet.stateTimer = CONFIG.REST_DURATION;
    return true;
  }
}

/**
 * InteractionSystem — 交互系统。检测两只宠物靠近时触发 CP 互动。
 */
class InteractionSystem {
  constructor() {
    this.cooldownTimer = 0; // 冷却计时器
    this.isInteracting = false; // 是否正在互动
    this.interactionTimer = 0; // 当前互动的剩余时间
    this.currentInteraction = null; // 当前正在进行的互动对象
  }

  /**
   * 计算两只宠物之间的距离 (中心点到中心点)。
   */
  getDistance(petA, petB) {
    const ax = petA.x + petA.size / 2;
    const ay = petA.y + petA.size / 2;
    const bx = petB.x + petB.size / 2;
    const by = petB.y + petB.size / 2;
    return Math.hypot(ax - bx, ay - by);
  }

  /**
   * 基于当前的好感度等级，根据权重随机挑选一个可用的互动动作。
   */
  pickInteraction(affection) {
    const interactions = CONFIG.INTERACTIONS;
    const eligible = [];
    let totalWeight = 0;

    for (const [key, data] of Object.entries(interactions)) {
      if (affection >= data.minAffection) {
        eligible.push({ key, ...data });
        totalWeight += data.weight;
      }
    }

    let roll = Math.random() * totalWeight;
    for (const item of eligible) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }

    return eligible[eligible.length - 1]; // 兜底返回最后一个
  }

  /**
   * 将互动带来的属性变化效果应用到两只宠物身上。
   */
  applyInteraction(petA, petB, interaction) {
    petA.modifyStat('mood', interaction.moodA);
    petB.modifyStat('mood', interaction.moodB);
    petA.modifyStat('hunger', interaction.hungerA);
    petB.modifyStat('hunger', interaction.hungerB);
    petA.modifyStat('qi', interaction.qiA);
    petB.modifyStat('qi', interaction.qiB);

    // 好感度是两人共享共同增加的
    petA.modifyStat('affection', interaction.affection);
    petB.modifyStat('affection', interaction.affection);
  }

  /**
   * 主更新循环。如果本帧触发了互动，则返回互动信息。
   * @returns {{ key: string, interaction: object } | null}
   */
  update(petA, petB, deltaMs) {
    // 更新冷却时间
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= deltaMs;
    }

    // 处理正在进行中的互动
    if (this.isInteracting) {
      this.interactionTimer -= deltaMs;
      if (this.interactionTimer <= 0) {
        // 互动结束
        this.isInteracting = false;
        this.currentInteraction = null;
        petA.setState('idle');
        petB.setState('idle');
        // 互动结束时，可以选恢复到默认朝向，或者是保持看向对方。因为会进行新一轮行走，保持看向对方比较自然。
        petA.idleTimer = 2000;
        petB.idleTimer = 2000;

        // 开始计算冷却时间
        this.cooldownTimer = CONFIG.INTERACTION_COOLDOWN;
      }
      return null;
    }

    // 如果任何一个宠物正在忙、正在被拖拽，或是互动在冷却中，则不进行检查
    if (petA.isBusy() || petB.isBusy()) return null;
    if (petA.isDragging || petB.isDragging) return null;
    if (this.cooldownTimer > 0) return null;

    // 距离检测
    const distance = this.getDistance(petA, petB);
    if (distance < CONFIG.INTERACTION_DISTANCE) {
      // 使用两人的平均好感度来挑选互动动作
      const avgAffection = (petA.stats.affection + petB.stats.affection) / 2;
      const interaction = this.pickInteraction(avgAffection);

      if (interaction) {
        // 触发互动
        this.isInteracting = true;
        this.interactionTimer = CONFIG.INTERACTION_DURATION;
        this.currentInteraction = interaction;

        petA.setState('interacting');
        petB.setState('interacting');

        // 让双方互相面对面打招呼
        if (petA.x < petB.x) {
          petA.direction = 'right';
          petB.direction = 'left';
        } else {
          petA.direction = 'left';
          petB.direction = 'right';
        }

        // 应用属性增减效果
        this.applyInteraction(petA, petB, interaction);

        return { key: interaction.key, interaction };
      }
    }

    return null;
  }
}

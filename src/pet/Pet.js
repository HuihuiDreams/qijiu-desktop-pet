/**
 * Pet Class — 代表单个桌面宠物角色的类。
 * 管理位置、状态机和养成属性。
 */
class Pet {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.nickname = config.nickname;
    this.emoji = config.emoji;
    this.image = config.image;
    this.sprites = config.sprites || null;  // 序列帧配置，由 SpriteView 使用

    // 位置信息
    this.x = 200 + Math.random() * 400;
    this.y = 300 + Math.random() * 200;
    this.targetX = this.x;
    this.targetY = this.y;
    this.defaultDirection = config.defaultDirection || 'right';
    this.direction = this.defaultDirection;   // 'left' | 'right' （朝向左或右）

    // 状态机
    this.state = 'idle';        // 当前状态：idle (发呆) | walking (行走) | eating (进食) | sleeping (睡眠) | meditating (打坐) | working (工作) | interacting (互动)
    this.previousState = 'idle'; // 上一个状态
    this.stateTimer = 0;        // 当前定时状态的剩余时间 (毫秒)
    this.idleTimer = 0;         // 距离下一次行走的剩余时间 (毫秒)

    // 养成属性 (修仙主题)
    this.stats = {
      affection: 0,     // 好感度 0-100 (不会自然衰减)
      hunger: 80,       // 饱腹度 0-100
      qi: 100,          // 灵力 0-100
      mood: 70,         // 心境 0-100
    };

    // 其他
    this.size = CONFIG.PET_SIZE; // 宠物尺寸
    this.speed = CONFIG.MOVE_SPEED; // 宠物速度
    this.element = null;        // 关联的 DOM 元素 (由 PetRenderer 设置)
  }

  /**
   * 更改宠物的状态。存储上一个状态以便恢复。
   */
  setState(newState) {
    if (this.state === newState) return;
    this.previousState = this.state;
    this.state = newState;
  }

  /**
   * 将属性值限制在 0 到 100 之间。
   */
  clampStat(key) {
    this.stats[key] = Math.max(0, Math.min(100, this.stats[key]));
  }

  /**
   * 按给定的增量修改属性，并进行范围限制。
   */
  modifyStat(key, delta) {
    this.stats[key] += delta;
    this.clampStat(key);
  }

  /**
   * 检查宠物是否处于忙碌状态（正在执行有时间限制的动作）。
   */
  isBusy() {
    return ['eating', 'sleeping', 'meditating', 'working', 'interacting', 'patted'].includes(this.state);
  }

  /**
   * 检查宠物的各项属性是否处于临界条件（过低）。
   */
  isHungry() { return this.stats.hunger < 25; }
  isLowQi() { return this.stats.qi < 20; }
  isLowMood() { return this.stats.mood < 25; }
}

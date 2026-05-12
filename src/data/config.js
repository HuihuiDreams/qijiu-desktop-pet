/**
 * 桌面宠物全局配置 (DeskPet Global Configuration)
 * 这里包含了所有可以调整的数值参数。
 */
const CONFIG = {
  // === 移动相关 (Movement) ===
  MOVE_SPEED: 1.2,                    // 移动速度（每帧移动的像素）
  IDLE_DURATION_MIN: 3000,            // 最小发呆时间 (毫秒)
  IDLE_DURATION_MAX: 8000,            // 最大发呆时间 (毫秒)
  WALK_TARGET_MARGIN: 60,             // 屏幕边缘保护距离
  TASKBAR_HEIGHT: 48,                 // 底部任务栏的高度预留

  // === 互动相关 (Interaction) ===
  INTERACTION_DISTANCE: 180,          // 触发CP互动的判定距离
  INTERACTION_COOLDOWN: 20000,        // 两次互动之间的冷却时间
  INTERACTION_DURATION: 4000,         // 互动动作的持续时间

  // === 养成数值 - 自然消耗 (Nurture - Decay) ===
  DECAY_INTERVAL: 300000,             // 结算周期：每5分钟
  HUNGER_DECAY: 2,                    // 每个周期减少的饱腹度
  QI_DECAY: 1,                        // 每个周期减少的灵力
  MOOD_DECAY: 1,                      // 每个周期减少的心境

  // === 养成数值 - 玩家操作带来的恢复 (Nurture - Actions) ===
  FEED_HUNGER: 25,                    // 【喂食】恢复的饱腹度
  FEED_MOOD: 5,                       // 【喂食】恢复的心境
  PET_AFFECTION: 3,                   // 【右键关怀/撒娇】增加的好感度
  PET_MOOD: 5,                        // 【右键关怀/撒娇】增加的心境
  MEDITATE_QI_RATE: 2,                // 【打坐】每秒恢复的灵力
  MEDITATE_DURATION: 30000,           // 【打坐】持续时间
  REST_QI: 30,                        // 【休息】瞬间恢复的灵力
  REST_HUNGER_COST: 10,               // 【休息】消耗的饱腹度
  REST_DURATION: 20000,               // 【休息】持续时间

  // === CP互动效果配置 (Interaction Effects) ===
  INTERACTIONS: {
    greet: { weight: 30, moodA: 5, moodB: 5, affection: 1, hungerA: 0, hungerB: 0, qiA: 0, qiB: 0, minAffection: 0 },
    shareFood: { weight: 20, moodA: 8, moodB: 3, affection: 2, hungerA: -5, hungerB: 10, qiA: 0, qiB: 0, minAffection: 0 },
    cultivate: { weight: 25, moodA: 8, moodB: 8, affection: 3, hungerA: 0, hungerB: 0, qiA: 15, qiB: 15, minAffection: 20 },
    kiss: { weight: 15, moodA: 12, moodB: 12, affection: 8, hungerA: 0, hungerB: 0, qiA: 0, qiB: 0, minAffection: 70 },
    hug: { weight: 10, moodA: 15, moodB: 15, affection: 12, hungerA: 0, hungerB: 0, qiA: 0, qiB: 0, minAffection: 50 },
  },

  // === 角色定义 (Pet Definitions) ===
  PET_A: {
    id: 'yueqi',
    name: '岳清源',
    nickname: '岳七',
    emoji: '🗡️',
    image: 'assets/left.png',
    defaultDirection: 'left',
    sprites: {
      idle:    { frames: ['assets/left.png'], fps: 1 },
      walkingLeft: {
        frames: [
          'assets/yueqi/walk_left01.png',
          'assets/yueqi/walk_left02.png',
          'assets/yueqi/walk_left03.png',
          'assets/yueqi/walk_left04.png',
        ],
        fps: 4,
      },
      walkingRight: {
        frames: [
          'assets/yueqi/walk_right01.png',
          'assets/yueqi/walk_right02.png',
          'assets/yueqi/walk_right03.png',
          'assets/yueqi/walk_right04.png',
        ],
        fps: 4,
      },
    },
  },
  PET_B: {
    id: 'shenjiu',
    name: '沈清秋',
    nickname: '沈九',
    emoji: '🪭',
    image: 'assets/right.png',
    defaultDirection: 'right',
    sprites: {
      idle:    { frames: ['assets/right.png'], fps: 1 },
      walkingLeft: {
        frames: [
          'assets/shenjiu/walk_left01.png',
          'assets/shenjiu/walk_left02.png',
          'assets/shenjiu/walk_left03.png',
          'assets/shenjiu/walk_left04.png',
        ],
        fps: 4,
      },
      walkingRight: {
        frames: [
          'assets/shenjiu/walk_right01.png',
          'assets/shenjiu/walk_right02.png',
          'assets/shenjiu/walk_right03.png',
          'assets/shenjiu/walk_right04.png',
        ],
        fps: 4,
      },
    },
  },

  // === 视觉设置 (Visual) ===
  PET_SIZE: 96,
};

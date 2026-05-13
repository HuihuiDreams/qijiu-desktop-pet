/**
 * MovementSystem — 移动系统。处理随机行走、发呆等待以及屏幕边界检测。
 */
class MovementSystem {
  constructor(screenWidth, screenHeight) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  /**
   * 更新屏幕尺寸信息（例如在调整窗口大小时）。
   */
  setScreenSize(w, h) {
    this.screenWidth = w;
    this.screenHeight = h;
  }

  /**
   * 在屏幕边界内生成一个随机的目标位置。
   */
  randomTarget(pet) {
    const margin = CONFIG.WALK_TARGET_MARGIN;
    const maxX = this.screenWidth - pet.size - margin;
    const maxY = this.screenHeight - pet.size - margin - CONFIG.TASKBAR_HEIGHT;
    pet.targetX = margin + Math.random() * (maxX - margin);
    pet.targetY = margin + Math.random() * (maxY - margin);
  }

  /**
   * 获取一个随机的发呆时间。
   */
  randomIdleDuration() {
    return CONFIG.IDLE_DURATION_MIN +
      Math.random() * (CONFIG.IDLE_DURATION_MAX - CONFIG.IDLE_DURATION_MIN);
  }

  /**
   * 将宠物向目标位置移动。当到达时返回 true。
   */
  moveTowardTarget(pet, deltaMs) {
    const dx = pet.targetX - pet.x;
    const dy = pet.targetY - pet.y;
    const dist = Math.hypot(dx, dy);

    // 将速度进行帧率无关的归一化 (以 60 帧 16.66ms 为基准)
    const timeScale = deltaMs / 16.666;
    const moveDist = pet.speed * timeScale;

    if (dist < moveDist) {
      // 已经到达目标位置
      pet.x = pet.targetX;
      pet.y = pet.targetY;
      return true;
    }

    // 向量归一化然后移动
    const nx = dx / dist;
    const ny = dy / dist;
    pet.x += nx * moveDist;
    pet.y += ny * moveDist;

    // 更新朝向
    pet.direction = dx > 0 ? 'right' : 'left';

    return false;
  }

  /**
   * 单个宠物的主更新函数（每帧调用）。
   * @param {Pet} pet - 宠物对象
   * @param {number} deltaMs - 距离上一帧的时间间隔，单位为毫秒
   */
  update(pet, deltaMs) {
    // 如果宠物正在被用户拖拽或处于忙碌状态，则不进行移动逻辑
    if (pet.isDragging || pet.isBusy()) return;

    switch (pet.state) {
      case 'idle':
        pet.idleTimer -= deltaMs;
        if (pet.idleTimer <= 0) {
          // 发呆结束，设置新目标开始行走
          this.randomTarget(pet);
          pet.direction = pet.targetX > pet.x ? 'right' : 'left';
          pet.setState('walking');
        }
        break;

      case 'walking':
        const arrived = this.moveTowardTarget(pet, deltaMs);
        if (arrived) {
          pet.setState('idle');
          pet.idleTimer = this.randomIdleDuration();
        }
        break;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { MovementSystem };
}

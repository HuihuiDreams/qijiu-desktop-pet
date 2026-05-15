/**
 * MovementSystem — 移动系统。处理随机行走、发呆等待以及屏幕边界检测。
 */
class MovementSystem {
  constructor(screenWidth, screenHeight, walkAreas = null) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.walkAreas = this.normalizeWalkAreas(walkAreas);
  }

  /**
   * 更新屏幕尺寸信息（例如在调整窗口大小时）。
   */
  setScreenSize(w, h, walkAreas = null) {
    this.screenWidth = w;
    this.screenHeight = h;
    this.walkAreas = this.normalizeWalkAreas(walkAreas);
  }

  normalizeWalkAreas(walkAreas) {
    if (!Array.isArray(walkAreas)) return [];

    return walkAreas
      .map((area) => ({
        x: Number(area?.x),
        y: Number(area?.y),
        width: Number(area?.width),
        height: Number(area?.height),
        scaleRatio: Number(area?.scaleRatio),
      }))
      .filter((area) => (
        Number.isFinite(area.x)
        && Number.isFinite(area.y)
        && Number.isFinite(area.width)
        && Number.isFinite(area.height)
        && area.width > 0
        && area.height > 0
      ))
      .map((area) => ({
        ...area,
        scaleRatio: Number.isFinite(area.scaleRatio) && area.scaleRatio > 0 ? area.scaleRatio : 1,
      }));
  }

  getFallbackWalkArea() {
    return {
      x: 0,
      y: 0,
      width: this.screenWidth,
      height: Math.max(0, this.screenHeight - (CONFIG.TASKBAR_HEIGHT || 0)),
    };
  }

  getWalkAreas() {
    return this.walkAreas.length > 0 ? this.walkAreas : [this.getFallbackWalkArea()];
  }

  clampToRange(value, min, max) {
    if (min > max) return (min + max) / 2;
    return Math.min(Math.max(value, min), max);
  }

  getTargetRange(area, pet, margin) {
    return {
      minX: area.x + margin,
      maxX: area.x + area.width - pet.size - margin,
      minY: area.y + margin,
      maxY: area.y + area.height - pet.size - margin,
    };
  }

  pickWalkArea(pet, margin) {
    const weightedAreas = this.getWalkAreas().map((area) => {
      const range = this.getTargetRange(area, pet, margin);
      const width = Math.max(1, range.maxX - range.minX);
      const height = Math.max(1, range.maxY - range.minY);
      return { area, weight: width * height };
    });

    const totalWeight = weightedAreas.reduce((sum, item) => sum + item.weight, 0);
    let cursor = Math.random() * totalWeight;
    for (const item of weightedAreas) {
      cursor -= item.weight;
      if (cursor <= 0) return item.area;
    }

    return weightedAreas[weightedAreas.length - 1]?.area || this.getFallbackWalkArea();
  }

  sameArea(a, b) {
    return Boolean(a && b)
      && a.x === b.x
      && a.y === b.y
      && a.width === b.width
      && a.height === b.height;
  }

  findMatchingWalkArea(area) {
    if (!area) return null;
    return this.getWalkAreas().find((walkArea) => this.sameArea(walkArea, area)) || null;
  }

  findAreaContainingPoint(x, y) {
    return this.getWalkAreas().find((area) => (
      x >= area.x
      && x <= area.x + area.width
      && y >= area.y
      && y <= area.y + area.height
    )) || null;
  }

  findAreaContainingPet(pet, x = pet.x, y = pet.y) {
    return this.findAreaContainingPoint(x + pet.size / 2, y + pet.size / 2);
  }

  clampTargetToArea(pet, area) {
    if (!area) return;
    const range = this.getTargetRange(area, pet, 0);
    pet.targetX = this.clampToRange(pet.targetX, range.minX, range.maxX);
    pet.targetY = this.clampToRange(pet.targetY, range.minY, range.maxY);
  }

  findAreaContainingPetBounds(pet, x = pet.x, y = pet.y) {
    return this.getWalkAreas().find((area) => (
      x >= area.x
      && y >= area.y
      && x + pet.size <= area.x + area.width
      && y + pet.size <= area.y + area.height
    )) || null;
  }

  getNearestPositionInWalkAreas(pet, x = pet.x, y = pet.y) {
    let bestPosition = null;
    let bestDistance = Infinity;

    for (const area of this.getWalkAreas()) {
      const minX = area.x;
      const maxX = area.x + area.width - pet.size;
      const minY = area.y;
      const maxY = area.y + area.height - pet.size;
      const clampedX = this.clampToRange(x, minX, maxX);
      const clampedY = this.clampToRange(y, minY, maxY);
      const distance = (clampedX - x) ** 2 + (clampedY - y) ** 2;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPosition = {
          x: clampedX,
          y: clampedY,
          area,
        };
      }
    }

    return bestPosition;
  }

  resolveTargetArea(pet) {
    const cachedArea = this.findMatchingWalkArea(pet.targetArea);
    if (cachedArea) {
      this.clampTargetToArea(pet, cachedArea);
      return cachedArea;
    }

    const targetArea = this.findAreaContainingPetBounds(pet, pet.targetX, pet.targetY)
      || this.findAreaContainingPet(pet, pet.targetX, pet.targetY);
    if (targetArea) {
      this.clampTargetToArea(pet, targetArea);
      pet.targetArea = targetArea;
      return targetArea;
    }

    const nearestPosition = this.getNearestPositionInWalkAreas(pet, pet.targetX, pet.targetY);
    if (nearestPosition) {
      pet.targetX = nearestPosition.x;
      pet.targetY = nearestPosition.y;
      pet.targetArea = nearestPosition.area;
      return nearestPosition.area;
    }

    pet.targetArea = null;
    return null;
  }

  bridgeToTargetArea(pet, currentArea, targetArea) {
    if (!targetArea || this.sameArea(currentArea, targetArea)) return false;

    if (!currentArea || targetArea.x >= currentArea.x + currentArea.width) {
      pet.x = targetArea.x;
    } else if (targetArea.x + targetArea.width <= currentArea.x) {
      pet.x = targetArea.x + targetArea.width - pet.size;
    } else {
      pet.x = this.clampToRange(pet.x, targetArea.x, targetArea.x + targetArea.width - pet.size);
    }

    if (!currentArea || targetArea.y >= currentArea.y + currentArea.height) {
      pet.y = targetArea.y;
    } else if (targetArea.y + targetArea.height <= currentArea.y) {
      pet.y = targetArea.y + targetArea.height - pet.size;
    } else {
      pet.y = this.clampToRange(pet.y, targetArea.y, targetArea.y + targetArea.height - pet.size);
    }

    return true;
  }

  /**
   * 在屏幕边界内生成一个随机的目标位置。
   */
  randomTarget(pet) {
    const margin = CONFIG.WALK_TARGET_MARGIN;
    const area = this.pickWalkArea(pet, margin);
    const range = this.getTargetRange(area, pet, margin);
    pet.targetArea = area;

    pet.targetX = this.clampToRange(
      range.minX + Math.random() * Math.max(0, range.maxX - range.minX),
      range.minX,
      range.maxX,
    );
    pet.targetY = this.clampToRange(
      range.minY + Math.random() * Math.max(0, range.maxY - range.minY),
      range.minY,
      range.maxY,
    );
  }

  clampPetToWalkAreas(pet) {
    const bestPosition = this.getNearestPositionInWalkAreas(pet);

    if (bestPosition) {
      pet.x = bestPosition.x;
      pet.y = bestPosition.y;
    }
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
      this.clampPetToWalkAreas(pet);
      return true;
    }

    // 向量归一化然后移动
    const nx = dx / dist;
    const ny = dy / dist;
    const nextX = pet.x + nx * moveDist;
    const nextY = pet.y + ny * moveDist;
    const currentArea = this.findAreaContainingPetBounds(pet) || this.findAreaContainingPet(pet);
    const nextArea = this.findAreaContainingPetBounds(pet, nextX, nextY)
      || this.findAreaContainingPet(pet, nextX, nextY);
    const targetArea = this.resolveTargetArea(pet);
    const isCrossDisplayMove = currentArea && targetArea && !this.sameArea(currentArea, targetArea);
    let bridgedDisplayGap = false;

    if (currentArea && !nextArea && isCrossDisplayMove) {
      this.bridgeToTargetArea(pet, currentArea, targetArea);
      bridgedDisplayGap = true;
    } else {
      pet.x = nextX;
      pet.y = nextY;
    }

    const areaAfterMove = this.findAreaContainingPet(pet);
    if (!isCrossDisplayMove || bridgedDisplayGap || this.sameArea(areaAfterMove, targetArea)) {
      this.clampPetToWalkAreas(pet);
    }

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

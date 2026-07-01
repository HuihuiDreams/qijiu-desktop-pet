/**
 * MovementSystem — 移动系统。处理随机行走、发呆等待以及屏幕边界检测。
 */
class MovementSystem {
  static getEdgeMigrationDirection(pet, screenWidth, screenHeight, adjacentDisplays, options = {}) {
    if (!pet || !adjacentDisplays || pet.isDragging || pet.state !== 'walking') return null;

    const width = Number(screenWidth);
    const height = Number(screenHeight);
    const size = Number(pet.size);
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(size)) return null;

    const edgeThreshold = Number.isFinite(options.edgeThreshold) ? options.edgeThreshold : 5;
    const configuredMargin = typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.WALK_TARGET_MARGIN)
      ? CONFIG.WALK_TARGET_MARGIN
      : 0;
    const walkTargetMargin = Number.isFinite(options.walkTargetMargin)
      ? options.walkTargetMargin
      : configuredMargin;
    const threshold = Math.max(edgeThreshold, walkTargetMargin + edgeThreshold);

    if (adjacentDisplays.left && pet.direction === 'left' && pet.x <= threshold) {
      return 'left';
    }
    if (adjacentDisplays.right
      && pet.direction === 'right'
      && pet.x + size >= width - threshold) {
      return 'right';
    }
    if (adjacentDisplays.top && pet.targetY < pet.y && pet.y <= threshold) {
      return 'top';
    }
    if (adjacentDisplays.bottom
      && pet.targetY > pet.y
      && pet.y + size >= height - threshold) {
      return 'bottom';
    }

    return null;
  }

  constructor(screenWidth, screenHeight, walkAreas = null) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.walkAreas = this.normalizeWalkAreas(walkAreas);
    this.activePlatform = null;
    this.surfacePlatforms = [];
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
        source: area?.source,
        isPrimary: area?.isPrimary === true,
      }))
      .filter((area) => (
        Number.isFinite(area.x)
        && Number.isFinite(area.y)
        && Number.isFinite(area.width)
        && Number.isFinite(area.height)
        && area.width > 0
        && area.height > 0
      ))
      .map((area) => {
        const normalized = {
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
          scaleRatio: Number.isFinite(area.scaleRatio) && area.scaleRatio > 0 ? area.scaleRatio : 1,
        };
        if (area.source) normalized.source = area.source;
        if (area.isPrimary) normalized.isPrimary = true;
        return normalized;
      });
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

  setActivePlatform(platform) {
    this.setSurfacePlatforms(platform ? [platform] : []);
  }

  setSurfacePlatforms(platforms) {
    this.surfacePlatforms = this.normalizeWalkAreas(Array.isArray(platforms) ? platforms : []);
    this.activePlatform = this.surfacePlatforms.find((area) => this.isActiveWindowPlatform(area)) || null;
  }

  getMovementAreas(options = {}) {
    const areas = this.surfacePlatforms.length > 0
      ? [...this.surfacePlatforms, ...this.getWalkAreas()]
      : this.getWalkAreas();
    if (options.excludeActiveWindowPlatform) {
      return areas.filter((area) => !this.isActiveWindowPlatform(area));
    }
    return areas;
  }

  clampToRange(value, min, max) {
    if (min > max) return (min + max) / 2;
    return Math.min(Math.max(value, min), max);
  }

  isActiveWindowPlatform(area) {
    return area?.source === 'active-window-top';
  }

  isSurfacePlatform(area) {
    return area?.source === 'active-window-top' || area?.source === 'taskbar-edge';
  }

  isPetOnTargetRange(pet, area, margin = 0) {
    if (!pet || !this.isSurfacePlatform(area)) return false;
    const range = this.getReachableTargetRange(area, pet, margin);
    if (!range) return false;
    const epsilon = Math.max(1, pet.speed || 0);
    return pet.x >= range.minX - epsilon
      && pet.x <= range.maxX + epsilon
      && pet.y >= range.minY - epsilon
      && pet.y <= range.maxY + epsilon;
  }

  findCurrentSurfacePlatform(pet) {
    const cachedArea = this.findMatchingWalkArea(pet?.targetArea, pet);
    if (this.isPetOnTargetRange(pet, cachedArea, 0)) return cachedArea;

    return this.surfacePlatforms.find((area) => (
      this.isPetOnTargetRange(pet, area, 0)
    )) || null;
  }

  getTargetRange(area, pet, margin) {
    if (this.isSurfacePlatform(area)) {
      const xMargin = Math.min(margin, Math.max(0, (area.width - pet.size) / 2));
      const platformY = area.y + area.height / 2 - pet.size;
      return {
        minX: area.x + xMargin,
        maxX: area.x + area.width - pet.size - xMargin,
        minY: platformY,
        maxY: platformY,
      };
    }

    return {
      minX: area.x + margin,
      maxX: area.x + area.width - pet.size - margin,
      minY: area.y + margin,
      maxY: area.y + area.height - pet.size - margin,
    };
  }

  getReachableTargetRange(area, pet, margin) {
    const range = this.getTargetRange(area, pet, margin);
    if (!this.isSurfacePlatform(area)) return range;

    const reachableRanges = this.getWalkAreas()
      .map((walkArea) => ({
        minX: Math.max(range.minX, walkArea.x),
        maxX: Math.min(range.maxX, walkArea.x + walkArea.width - pet.size),
        minY: Math.max(range.minY, walkArea.y),
        maxY: Math.min(range.maxY, walkArea.y + walkArea.height - pet.size),
      }))
      .filter((candidate) => (
        candidate.minX <= candidate.maxX
        && candidate.minY <= candidate.maxY
      ))
      .sort((a, b) => (
        (b.maxX - b.minX) * (b.maxY - b.minY)
        - (a.maxX - a.minX) * (a.maxY - a.minY)
      ));

    return reachableRanges[0] || null;
  }

  getMovementAreasForPet(pet, margin = 0, options = {}) {
    return this.getMovementAreas(options).filter((area) => (
      this.getReachableTargetRange(area, pet, margin)
    ));
  }

  pickWalkArea(pet, margin, options = {}) {
    const weightedAreas = this.getMovementAreasForPet(pet, margin, options).map((area) => {
      const range = this.getReachableTargetRange(area, pet, margin);
      const width = Math.max(1, range.maxX - range.minX);
      const height = Math.max(1, range.maxY - range.minY);
      const platformWeight = area.source === 'taskbar-edge'
        ? (CONFIG.TASKBAR_PLATFORM_WEIGHT || 120)
        : height;
      return { area, weight: width * platformWeight };
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

  findMatchingWalkArea(area, pet = null) {
    if (!area) return null;
    if (this.isSurfacePlatform(area)) {
      const normalizedArea = this.normalizeWalkAreas([area])[0] || null;
      if (!normalizedArea) return null;
      if (pet && !this.getReachableTargetRange(normalizedArea, pet, 0)) return null;
      return normalizedArea;
    }
    return this.getMovementAreas().find((walkArea) => this.sameArea(walkArea, area)) || null;
  }

  findAreaContainingPoint(x, y) {
    return this.getMovementAreas().find((area) => (
      x >= area.x
      && x <= area.x + area.width
      && y >= area.y
      && y <= area.y + area.height
    )) || null;
  }

  findAreaContainingPet(pet, x = pet.x, y = pet.y) {
    return this.findAreaContainingPoint(x + pet.size / 2, y + pet.size / 2);
  }

  getScaleRatioForArea(area) {
    const scaleRatio = Number(area?.scaleRatio);
    return Number.isFinite(scaleRatio) && scaleRatio > 0 ? scaleRatio : 1;
  }

  getMovementScaleForPet(pet) {
    const centerX = pet.x + pet.size / 2;
    const centerY = pet.y + pet.size / 2;
    const walkArea = this.getWalkAreas().find((area) => (
      centerX >= area.x
      && centerX <= area.x + area.width
      && centerY >= area.y
      && centerY <= area.y + area.height
    ));

    return this.getScaleRatioForArea(walkArea);
  }

  clampTargetToArea(pet, area) {
    if (!area) return;
    const range = this.getReachableTargetRange(area, pet, 0) || this.getTargetRange(area, pet, 0);
    pet.targetX = this.clampToRange(pet.targetX, range.minX, range.maxX);
    pet.targetY = this.clampToRange(pet.targetY, range.minY, range.maxY);
  }

  findAreaContainingPetBounds(pet, x = pet.x, y = pet.y) {
    return this.getMovementAreas().find((area) => (
      x >= area.x
      && y >= area.y
      && x + pet.size <= area.x + area.width
      && y + pet.size <= area.y + area.height
    )) || null;
  }

  getNearestPositionInWalkAreas(pet, x = pet.x, y = pet.y) {
    let bestPosition = null;
    let bestDistance = Infinity;

    for (const area of this.getMovementAreasForPet(pet, 0)) {
      const range = this.getReachableTargetRange(area, pet, 0);
      const clampedX = this.clampToRange(x, range.minX, range.maxX);
      const clampedY = this.clampToRange(y, range.minY, range.maxY);
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
    const cachedArea = this.findMatchingWalkArea(pet.targetArea, pet);
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
    const activeRange = this.activePlatform
      ? this.getReachableTargetRange(this.activePlatform, pet, margin)
      : null;
    const activeWindowPlatformChance = Number.isFinite(CONFIG.WINDOW_AWARENESS_PLATFORM_CHANCE)
      ? CONFIG.WINDOW_AWARENESS_PLATFORM_CHANCE
      : 0.7;

    let area;
    const currentSurfaceArea = this.findCurrentSurfacePlatform(pet);
    const currentSurfaceChance = this.isActiveWindowPlatform(currentSurfaceArea)
      ? activeWindowPlatformChance
      : 0.7;

    if (currentSurfaceArea && Math.random() < currentSurfaceChance) {
      area = currentSurfaceArea;
    }
    // 有可用活动窗口平台时，70% 概率选择或留在该窗口上
    if (!area
      && activeRange
      && !this.isActiveWindowPlatform(currentSurfaceArea)
      && Math.random() < activeWindowPlatformChance) {
      area = this.activePlatform;
    } else if (!area) {
      area = this.pickWalkArea(pet, margin, { excludeActiveWindowPlatform: Boolean(activeRange) });
    }

    const range = this.getReachableTargetRange(area, pet, margin);
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

  separatePetsWithinWalkAreas(petA, petB, minXDistance) {
    if (!petA || !petB) return false;

    const distance = Number(minXDistance);
    if (!Number.isFinite(distance) || distance <= 0) return false;
    if (Math.abs(petA.x - petB.x) >= distance) return false;

    const areaA = this.findCurrentSurfacePlatform(petA)
      || this.findAreaContainingPetBounds(petA)
      || this.findAreaContainingPet(petA)
      || this.getNearestPositionInWalkAreas(petA)?.area;
    const areaB = this.findCurrentSurfacePlatform(petB)
      || this.findAreaContainingPetBounds(petB)
      || this.findAreaContainingPet(petB)
      || this.getNearestPositionInWalkAreas(petB)?.area;

    if (!areaA || !areaB || !this.sameArea(areaA, areaB)) return false;

    const petALeftFirst = petA.x <= petB.x;
    const leftPet = petALeftFirst ? petA : petB;
    const rightPet = petALeftFirst ? petB : petA;
    const leftRange = this.getReachableTargetRange(areaA, leftPet, 0);
    const rightRange = this.getReachableTargetRange(areaB, rightPet, 0);
    if (!leftRange || !rightRange) return false;

    const feasibleLeftMin = Math.max(leftRange.minX, rightRange.minX - distance);
    const feasibleLeftMax = Math.min(leftRange.maxX, rightRange.maxX - distance);
    if (feasibleLeftMin > feasibleLeftMax) return false;

    const preferredLeft = ((leftPet.x + rightPet.x) / 2) - distance / 2;
    const nextLeftX = this.clampToRange(preferredLeft, feasibleLeftMin, feasibleLeftMax);
    const nextRightX = nextLeftX + distance;

    leftPet.x = nextLeftX;
    rightPet.x = nextRightX;
    leftPet.y = this.clampToRange(leftPet.y, leftRange.minY, leftRange.maxY);
    rightPet.y = this.clampToRange(rightPet.y, rightRange.minY, rightRange.maxY);

    return true;
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
    const moveDist = pet.speed * timeScale * this.getMovementScaleForPet(pet);

    if (dist <= moveDist || dist === 0) {
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
          // 深夜时段：70% 概率不移动，继续睡觉（加长发呆时间）
          if (pet.timePhase === 'night' && Math.random() < 0.7) {
            pet.idleTimer = this.randomIdleDuration() * 2;
            break;
          }

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

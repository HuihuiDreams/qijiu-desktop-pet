/**
 * MovementSystem — 移动系统。处理随机行走、发呆等待以及屏幕边界检测。
 */
class MovementSystem {
  static SEAM_STRADDLE_AXES = [
    {
      coord: 'x',
      span: 'width',
      minKey: 'minX',
      maxKey: 'maxX',
      crossCoord: 'y',
      crossSpan: 'height',
      crossMinKey: 'minY',
      crossMaxKey: 'maxY',
    },
    {
      coord: 'y',
      span: 'height',
      minKey: 'minY',
      maxKey: 'maxY',
      crossCoord: 'x',
      crossSpan: 'width',
      crossMinKey: 'minX',
      crossMaxKey: 'maxX',
    },
  ];

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
    this._lastSurfacePlatformsInput = null;
    this._cachedWalkAreasRef = null;
    this._cachedWalkAreasLen = -1;
    this._cachedSurfacePlatformsRef = null;
    this._cachedSurfacePlatformsLen = -1;
    this._cachedScreenWidth = null;
    this._cachedScreenHeight = null;
    this._cachedTaskbarHeight = null;
    this._cachedEffectiveWalkAreas = null;
    this._cachedMovementAreasAll = null;
    this._cachedMovementAreasExcludingActive = null;
    this._cachedRawSurfaceArea = null;
    this._cachedNormalizedSurfaceArea = null;
    this._cachedSeamLayout = null;
    this._cachedSeamLayoutAreas = null;
    this._cachedSeamLayoutPetSize = null;
    this._navState = { kind: 'same', x: 0, y: 0, fromIdx: -1, destIdx: -1 };
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

  _ensureAreaCaches() {
    const taskbarHeight = typeof CONFIG !== 'undefined' ? (CONFIG.TASKBAR_HEIGHT || 0) : 0;
    if (
      this._cachedEffectiveWalkAreas
      && this._cachedWalkAreasRef === this.walkAreas
      && this._cachedWalkAreasLen === this.walkAreas.length
      && this._cachedSurfacePlatformsRef === this.surfacePlatforms
      && this._cachedSurfacePlatformsLen === this.surfacePlatforms.length
      && this._cachedScreenWidth === this.screenWidth
      && this._cachedScreenHeight === this.screenHeight
      && this._cachedTaskbarHeight === taskbarHeight
    ) {
      return;
    }

    this._cachedEffectiveWalkAreas = this.walkAreas.length > 0 ? this.walkAreas : [this.getFallbackWalkArea()];
    this._cachedMovementAreasAll = this.surfacePlatforms.length > 0
      ? [...this.surfacePlatforms, ...this._cachedEffectiveWalkAreas]
      : this._cachedEffectiveWalkAreas;
    this._cachedMovementAreasExcludingActive = this._cachedMovementAreasAll.filter(
      (area) => !this.isActiveWindowPlatform(area),
    );
    this._cachedWalkAreasRef = this.walkAreas;
    this._cachedWalkAreasLen = this.walkAreas.length;
    this._cachedSurfacePlatformsRef = this.surfacePlatforms;
    this._cachedSurfacePlatformsLen = this.surfacePlatforms.length;
    this._cachedScreenWidth = this.screenWidth;
    this._cachedScreenHeight = this.screenHeight;
    this._cachedTaskbarHeight = taskbarHeight;
    this._cachedSeamLayout = null;
  }

  getWalkAreas() {
    this._ensureAreaCaches();
    return this._cachedEffectiveWalkAreas;
  }

  setActivePlatform(platform) {
    this.setSurfacePlatforms(platform ? [platform] : []);
  }

  _areSurfacePlatformInputsEqual(nextPlatforms) {
    if (!Array.isArray(nextPlatforms) || !Array.isArray(this._lastSurfacePlatformsInput)) {
      return false;
    }
    if (nextPlatforms.length !== this._lastSurfacePlatformsInput.length) {
      return false;
    }
    for (let i = 0; i < nextPlatforms.length; i++) {
      const a = nextPlatforms[i];
      const b = this._lastSurfacePlatformsInput[i];
      if (
        !a || !b ||
        a.x !== b.x ||
        a.y !== b.y ||
        a.width !== b.width ||
        a.height !== b.height ||
        a.scaleRatio !== b.scaleRatio ||
        a.source !== b.source ||
        Boolean(a.isPrimary) !== Boolean(b.isPrimary)
      ) {
        return false;
      }
    }
    return true;
  }

  setSurfacePlatforms(platforms) {
    if (this._areSurfacePlatformInputsEqual(platforms)) {
      return;
    }
    this._lastSurfacePlatformsInput = Array.isArray(platforms)
      ? platforms.map((p) => (p && typeof p === 'object' ? { ...p } : p))
      : null;
    this.surfacePlatforms = this.normalizeWalkAreas(Array.isArray(platforms) ? platforms : []);
    this.activePlatform = this.surfacePlatforms.find((area) => this.isActiveWindowPlatform(area)) || null;
  }

  getMovementAreas(options = {}) {
    this._ensureAreaCaches();
    return options.excludeActiveWindowPlatform
      ? this._cachedMovementAreasExcludingActive
      : this._cachedMovementAreasAll;
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

  getTargetRange(area, pet, margin, visualScale = this.getScaleRatioForArea(area)) {
    const size = pet.size * visualScale;
    if (this.isSurfacePlatform(area)) {
      const xMargin = Math.min(margin, Math.max(0, (area.width - size) / 2));
      const platformY = area.y + area.height / 2 - size;
      return {
        minX: area.x + xMargin,
        maxX: area.x + area.width - size - xMargin,
        minY: platformY,
        maxY: platformY,
      };
    }

    return {
      minX: area.x + margin,
      maxX: area.x + area.width - size - margin,
      minY: area.y + margin,
      maxY: area.y + area.height - size - margin,
    };
  }

  getReachableTargetRange(area, pet, margin) {
    if (!this.isSurfacePlatform(area)) return this.getTargetRange(area, pet, margin);

    // 活动窗口平台不携带 DPI；平台与可行走区域必须使用同一屏幕的视觉尺寸。
    let bestRange = null;
    let bestArea = -1;
    for (const walkArea of this.getWalkAreas()) {
      const visualScale = this.getScaleRatioForArea(walkArea);
      const size = pet.size * visualScale;
      const range = this.getTargetRange(area, pet, margin, visualScale);
      const minX = Math.max(range.minX, walkArea.x);
      const maxX = Math.min(range.maxX, walkArea.x + walkArea.width - size);
      const minY = Math.max(range.minY, walkArea.y);
      const maxY = Math.min(range.maxY, walkArea.y + walkArea.height - size);
      if (minX <= maxX && minY <= maxY) {
        const candidateArea = (maxX - minX) * (maxY - minY);
        if (candidateArea > bestArea) {
          bestArea = candidateArea;
          bestRange = { minX, maxX, minY, maxY };
        }
      }
    }

    return bestRange;
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

  _normalizeSingleSurfaceArea(area) {
    const cached = this._cachedRawSurfaceArea;
    if (
      cached
      && cached.x === area.x
      && cached.y === area.y
      && cached.width === area.width
      && cached.height === area.height
      && cached.scaleRatio === area.scaleRatio
      && cached.source === area.source
      && cached.isPrimary === area.isPrimary
    ) {
      return this._cachedNormalizedSurfaceArea;
    }
    const normalized = this.normalizeWalkAreas([area])[0] || null;
    this._cachedRawSurfaceArea = {
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      scaleRatio: area.scaleRatio,
      source: area.source,
      isPrimary: area.isPrimary,
    };
    this._cachedNormalizedSurfaceArea = normalized;
    return normalized;
  }

  findMatchingWalkArea(area, pet = null) {
    if (!area) return null;
    if (this.isSurfacePlatform(area)) {
      const normalizedArea = this._normalizeSingleSurfaceArea(area);
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
    const { walkAreas, ranges, seams } = this._getSeamLayout(pet);
    // 小比例屏幕的逻辑中心可能越界；跨屏过渡时再沿用中心点判定。
    const boundsIdx = this._findBoundsRangeIndex(pet.x, pet.y, ranges);
    if (boundsIdx >= 0) {
      return this.getScaleRatioForArea(walkAreas[boundsIdx]);
    }

    const centerX = pet.x + pet.size / 2;
    const centerY = pet.y + pet.size / 2;
    let centerArea = null;
    for (let i = 0; i < walkAreas.length; i += 1) {
      const area = walkAreas[i];
      if (
        centerX >= area.x
        && centerX <= area.x + area.width
        && centerY >= area.y
        && centerY <= area.y + area.height
      ) {
        centerArea = area;
        break;
      }
    }

    const activeSeam = this._findSeamAt(pet.x, pet.y, seams);
    if (activeSeam) {
      const seamArea = (centerArea === activeSeam.firstArea || centerArea === activeSeam.secondArea)
        ? centerArea
        : (
          pet[activeSeam.coord] + (pet.size * activeSeam.minScale) / 2 <= activeSeam.seamMax
            ? activeSeam.firstArea
            : activeSeam.secondArea
        );
      const seamScale = this.getScaleRatioForArea(seamArea);
      if (
        pet[activeSeam.crossCoord] + pet.size * seamScale > activeSeam.commonMaxCrossEnd + 1e-7
        || pet[activeSeam.coord] + pet.size * seamScale > activeSeam.secondEnd + 1e-7
      ) {
        return activeSeam.minScale;
      }
      return seamScale;
    }

    return this.getScaleRatioForArea(centerArea);
  }

  clampTargetToArea(pet, area) {
    if (!area) return;
    const range = this.getReachableTargetRange(area, pet, 0) || this.getTargetRange(area, pet, 0);
    pet.targetX = this.clampToRange(pet.targetX, range.minX, range.maxX);
    pet.targetY = this.clampToRange(pet.targetY, range.minY, range.maxY);
  }

  findAreaContainingPetBounds(pet, x = pet.x, y = pet.y, areas = this.getMovementAreas()) {
    // 分数 DPI 的乘加误差不应让贴边宠物失去显示器归属。
    const epsilon = 1e-7;
    return areas.find((area) => {
      const size = pet.size * this.getScaleRatioForArea(area);
      return x >= area.x - epsilon
        && y >= area.y - epsilon
        && x + size <= area.x + area.width + epsilon
        && y + size <= area.y + area.height + epsilon;
    }) || null;
  }

  getNearestPositionInWalkAreas(pet, x = pet.x, y = pet.y) {
    let bestPosition = null;
    let bestDistance = Infinity;

    for (const area of this.getMovementAreas()) {
      const range = this.getReachableTargetRange(area, pet, 0);
      if (!range) continue;
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
    const range = this.getReachableTargetRange(targetArea, pet, 0);
    if (!range) return false;

    if (!currentArea || targetArea.x >= currentArea.x + currentArea.width) {
      pet.x = range.minX;
    } else if (targetArea.x + targetArea.width <= currentArea.x) {
      pet.x = range.maxX;
    } else {
      pet.x = this.clampToRange(pet.x, range.minX, range.maxX);
    }

    if (!currentArea || targetArea.y >= currentArea.y + currentArea.height) {
      pet.y = range.minY;
    } else if (targetArea.y + targetArea.height <= currentArea.y) {
      pet.y = range.maxY;
    } else {
      pet.y = this.clampToRange(pet.y, range.minY, range.maxY);
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

  _syncPetDirection(pet, deltaX) {
    if (deltaX > 1e-9) {
      pet.direction = 'right';
    } else if (deltaX < -1e-9) {
      pet.direction = 'left';
    }
  }

  _isPositionInRange(x, y, range, epsilon = 1e-7) {
    return Boolean(range)
      && range.minX <= range.maxX + epsilon
      && range.minY <= range.maxY + epsilon
      && x >= range.minX - epsilon
      && x <= range.maxX + epsilon
      && y >= range.minY - epsilon
      && y <= range.maxY + epsilon;
  }

  _getAxisSeamCorridor(areaA, rangeA, areaB, rangeB, minVisualSize, axis) {
    const epsilon = 1e-7;
    if (
      !areaA || !areaB || !rangeA || !rangeB
      || rangeA.minX > rangeA.maxX + epsilon
      || rangeA.minY > rangeA.maxY + epsilon
      || rangeB.minX > rangeB.maxX + epsilon
      || rangeB.minY > rangeB.maxY + epsilon
    ) {
      return null;
    }

    const {
      coord, span, minKey, maxKey, crossCoord, crossSpan, crossMinKey, crossMaxKey,
    } = axis;
    const aTouchesB = Math.abs((areaA[coord] + areaA[span]) - areaB[coord]) <= epsilon;
    if (!aTouchesB && Math.abs((areaB[coord] + areaB[span]) - areaA[coord]) > epsilon) {
      return null;
    }

    const firstArea = aTouchesB ? areaA : areaB;
    const firstRange = aTouchesB ? rangeA : rangeB;
    const secondArea = aTouchesB ? areaB : areaA;
    const secondRange = aTouchesB ? rangeB : rangeA;
    const commonMinCross = Math.max(firstArea[crossCoord], secondArea[crossCoord]);
    const commonMaxCrossEnd = Math.min(
      firstArea[crossCoord] + firstArea[crossSpan],
      secondArea[crossCoord] + secondArea[crossSpan],
    );
    const corridorMin = Math.max(firstRange[crossMinKey], secondRange[crossMinKey]);
    const corridorMax = Math.min(firstRange[crossMaxKey], secondRange[crossMaxKey]);
    if (
      commonMaxCrossEnd - commonMinCross < minVisualSize - epsilon
      || corridorMin > corridorMax + epsilon
    ) {
      return null;
    }

    return {
      coord,
      crossCoord,
      firstArea,
      secondArea,
      seamMin: firstRange[maxKey],
      seamMax: secondRange[minKey],
      corridorMin,
      corridorMax,
      commonMaxCrossEnd,
      secondEnd: secondArea[coord] + secondArea[span],
      minScale: Math.min(
        this.getScaleRatioForArea(firstArea),
        this.getScaleRatioForArea(secondArea),
      ),
    };
  }

  _isStraddlingAxisSeam(pet, areaA, rangeA, areaB, rangeB, minVisualSize, axis) {
    const epsilon = 1e-7;
    const seam = this._getAxisSeamCorridor(areaA, rangeA, areaB, rangeB, minVisualSize, axis);
    return Boolean(seam)
      && pet[seam.coord] >= seam.seamMin - epsilon
      && pet[seam.coord] <= seam.seamMax + epsilon
      && pet[seam.crossCoord] >= seam.corridorMin - epsilon
      && pet[seam.crossCoord] <= seam.corridorMax + epsilon;
  }

  _getSeamLayout(pet) {
    const walkAreas = this.getWalkAreas();
    const petSize = pet.size;
    if (
      this._cachedSeamLayout
      && this._cachedSeamLayoutAreas === walkAreas
      && this._cachedSeamLayoutPetSize === petSize
    ) {
      return this._cachedSeamLayout;
    }

    const count = walkAreas.length;
    const sizeProbe = { size: petSize };
    const ranges = walkAreas.map((area) => this.getReachableTargetRange(area, sizeProbe, 0));
    const seams = [];
    const distMatrix = Array.from({ length: count }, () => new Array(count).fill(Infinity));
    const nextHopMatrix = Array.from({ length: count }, () => new Array(count).fill(null));

    if (count >= 2) {
      const scales = walkAreas.map((area) => this.getScaleRatioForArea(area));
      const adjacency = Array.from({ length: count }, () => []);

      for (let i = 0; i < count; i += 1) {
        if (!ranges[i]) continue;
        for (let j = i + 1; j < count; j += 1) {
          if (!ranges[j]) continue;
          const minVisualSize = petSize * Math.min(scales[i], scales[j]);
          for (const axis of MovementSystem.SEAM_STRADDLE_AXES) {
            const seam = this._getAxisSeamCorridor(
              walkAreas[i],
              ranges[i],
              walkAreas[j],
              ranges[j],
              minVisualSize,
              axis,
            );
            if (!seam) continue;
            seam.firstIdx = seam.firstArea === walkAreas[i] ? i : j;
            seam.secondIdx = seam.firstIdx === i ? j : i;
            seams.push(seam);
            adjacency[seam.firstIdx].push({ neighborIdx: seam.secondIdx, seam, dir: 1 });
            adjacency[seam.secondIdx].push({ neighborIdx: seam.firstIdx, seam, dir: -1 });
          }
        }
      }

      for (let destIdx = 0; destIdx < count; destIdx += 1) {
        distMatrix[destIdx][destIdx] = 0;
        const queue = [destIdx];
        for (let head = 0; head < queue.length; head += 1) {
          const current = queue[head];
          for (const edge of adjacency[current]) {
            if (distMatrix[edge.neighborIdx][destIdx] === Infinity) {
              distMatrix[edge.neighborIdx][destIdx] = distMatrix[current][destIdx] + 1;
              nextHopMatrix[edge.neighborIdx][destIdx] = {
                toIdx: current,
                seam: edge.seam,
                dir: -edge.dir,
              };
              queue.push(edge.neighborIdx);
            }
          }
        }
      }
    }

    this._cachedSeamLayout = { walkAreas, ranges, seams, distMatrix, nextHopMatrix };
    this._cachedSeamLayoutAreas = walkAreas;
    this._cachedSeamLayoutPetSize = petSize;
    return this._cachedSeamLayout;
  }

  _findSeamAt(x, y, seams, tolerance = 1e-7) {
    for (let i = 0; i < seams.length; i += 1) {
      const seam = seams[i];
      const primary = seam.coord === 'x' ? x : y;
      const cross = seam.coord === 'x' ? y : x;
      if (
        primary >= seam.seamMin - tolerance
        && primary <= seam.seamMax + tolerance
        && cross >= seam.corridorMin - tolerance
        && cross <= seam.corridorMax + tolerance
      ) {
        return seam;
      }
    }
    return null;
  }

  /**
   * 混合 DPI 相邻屏幕接缝的物理过渡区间（前屏 maxX/maxY 到后屏 minX/minY）可能同时落在两个单屏合法范围之外；
   * 只要宠物正沿任意一对相连 walkAreas 的有效公共通道合法跨屏、未伸入不可见空洞，就不应在过渡中途被最近点裁剪弹回原屏。
   */
  canStraddleAdjacentWalkAreas(pet) {
    const layout = this._getSeamLayout(pet);
    return Boolean(this._findSeamAt(pet.x, pet.y, layout.seams));
  }

  _findBoundsRangeIndex(x, y, ranges) {
    for (let i = 0; i < ranges.length; i += 1) {
      if (this._isPositionInRange(x, y, ranges[i])) return i;
    }
    return -1;
  }

  _findWalkAreaIndexForPosition(pet, x, y, walkAreas, ranges) {
    const boundsIdx = this._findBoundsRangeIndex(x, y, ranges);
    if (boundsIdx >= 0) return boundsIdx;

    const centerX = x + pet.size / 2;
    const centerY = y + pet.size / 2;
    for (let i = 0; i < walkAreas.length; i += 1) {
      const area = walkAreas[i];
      if (
        centerX >= area.x && centerX <= area.x + area.width
        && centerY >= area.y && centerY <= area.y + area.height
      ) {
        return i;
      }
    }

    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < walkAreas.length; i += 1) {
      const range = ranges[i];
      if (!range) continue;
      const dx = this.clampToRange(x, range.minX, range.maxX) - x;
      const dy = this.clampToRange(y, range.minY, range.maxY) - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  _applySeamGate(seam, dir, petPrimary, petCross, gateCoord, checkOnGate, state) {
    const epsilon = 1e-7;
    let crossAtGate = null;
    if (checkOnGate && Math.abs(gateCoord - petPrimary) <= epsilon) {
      if (petCross < seam.corridorMin - epsilon || petCross > seam.corridorMax + epsilon) {
        crossAtGate = petCross;
      }
    } else if (dir * (gateCoord - petPrimary) > epsilon) {
      const denom = state.x - petPrimary;
      const t = dir * denom > epsilon ? this.clampToRange((gateCoord - petPrimary) / denom, 0, 1) : 1;
      const candidate = petCross + t * (state.y - petCross);
      if (candidate < seam.corridorMin || candidate > seam.corridorMax) {
        crossAtGate = candidate;
      }
    }
    if (crossAtGate !== null) {
      const bound = crossAtGate < seam.corridorMin ? seam.corridorMin : seam.corridorMax;
      state.x = dir > 0 ? Math.max(petPrimary, gateCoord) : Math.min(petPrimary, gateCoord);
      state.y = Math.abs(bound - petCross) <= epsilon ? petCross : bound;
    }
  }

  _resolveCrossDisplayStep(pet, layout) {
    const state = this._navState;
    const { walkAreas, ranges, seams, distMatrix, nextHopMatrix } = layout;
    const destIdx = this._findWalkAreaIndexForPosition(pet, pet.targetX, pet.targetY, walkAreas, ranges);
    if (destIdx < 0 || this._isPositionInRange(pet.x, pet.y, ranges[destIdx])) {
      state.kind = 'same';
      state.x = pet.targetX;
      state.y = pet.targetY;
      return state;
    }

    let toIdx = -1;
    let seam = null;
    let dir = 0;
    const boundsIdx = this._findBoundsRangeIndex(pet.x, pet.y, ranges);
    if (boundsIdx >= 0) {
      const hop = nextHopMatrix[boundsIdx][destIdx];
      if (!hop) {
        state.kind = 'gap';
        state.fromIdx = boundsIdx;
        state.destIdx = destIdx;
        return state;
      }
      toIdx = hop.toIdx;
      seam = hop.seam;
      dir = hop.dir;
    } else {
      for (let i = 0; i < seams.length; i += 1) {
        const s = seams[i];
        const primary = s.coord === 'x' ? pet.x : pet.y;
        const cross = s.coord === 'x' ? pet.y : pet.x;
        if (
          primary < s.seamMin - 1e-7 || primary > s.seamMax + 1e-7
          || cross < s.corridorMin - 1e-7 || cross > s.corridorMax + 1e-7
        ) {
          continue;
        }
        const d1 = distMatrix[s.firstIdx][destIdx];
        const d2 = distMatrix[s.secondIdx][destIdx];
        if (!Number.isFinite(d1) && !Number.isFinite(d2)) continue;
        let chooseSecond = d2 < d1;
        if (d2 === d1) {
          const r1 = ranges[s.firstIdx];
          const r2 = ranges[s.secondIdx];
          const dist1 = (this.clampToRange(pet.targetX, r1.minX, r1.maxX) - pet.targetX) ** 2
            + (this.clampToRange(pet.targetY, r1.minY, r1.maxY) - pet.targetY) ** 2;
          const dist2 = (this.clampToRange(pet.targetX, r2.minX, r2.maxX) - pet.targetX) ** 2
            + (this.clampToRange(pet.targetY, r2.minY, r2.maxY) - pet.targetY) ** 2;
          chooseSecond = dist2 <= dist1;
        }
        toIdx = chooseSecond ? s.secondIdx : s.firstIdx;
        seam = s;
        dir = chooseSecond ? 1 : -1;
        break;
      }

      if (!seam) {
        const fallbackIdx = this._findWalkAreaIndexForPosition(pet, pet.x, pet.y, walkAreas, ranges);
        if (fallbackIdx < 0 || fallbackIdx === destIdx) {
          state.kind = 'same';
          state.x = pet.targetX;
          state.y = pet.targetY;
          return state;
        }
        const hop = nextHopMatrix[fallbackIdx][destIdx];
        if (!hop) {
          state.kind = 'gap';
          state.fromIdx = fallbackIdx;
          state.destIdx = destIdx;
          return state;
        }
        toIdx = hop.toIdx;
        seam = hop.seam;
        dir = hop.dir;
      }
    }

    let goalX = pet.targetX;
    let goalY = pet.targetY;
    const following = toIdx !== destIdx ? nextHopMatrix[toIdx][destIdx] : null;
    if (following) {
      const fSeam = following.seam;
      const nextEntry = following.dir > 0 ? fSeam.seamMin : fSeam.seamMax;
      const nextCross = this.clampToRange(
        fSeam.coord === 'x' ? pet.targetY : pet.targetX,
        fSeam.corridorMin,
        fSeam.corridorMax,
      );
      const toRange = ranges[toIdx];
      goalX = this.clampToRange(fSeam.coord === 'x' ? nextEntry : nextCross, toRange.minX, toRange.maxX);
      goalY = this.clampToRange(fSeam.coord === 'x' ? nextCross : nextEntry, toRange.minY, toRange.maxY);
    }

    const isX = seam.coord === 'x';
    const petPrimary = isX ? pet.x : pet.y;
    const petCross = isX ? pet.y : pet.x;
    const entryCoord = dir > 0 ? seam.seamMin : seam.seamMax;
    const exitCoord = dir > 0 ? seam.seamMax : seam.seamMin;

    // 暂用 state.x / state.y 存放 (effPrimary, effCross)，避免热路径闭包和临时对象分配
    state.x = isX ? goalX : goalY;
    state.y = isX ? goalY : goalX;
    this._applySeamGate(seam, dir, petPrimary, petCross, exitCoord, false, state);
    this._applySeamGate(seam, dir, petPrimary, petCross, entryCoord, true, state);

    const effPrimary = state.x;
    const effCross = state.y;
    state.kind = 'seam';
    state.x = isX ? effPrimary : effCross;
    state.y = isX ? effCross : effPrimary;
    return state;
  }

  /**
   * 将宠物向目标位置移动。当到达时返回 true。
   */
  moveTowardTarget(pet, deltaMs) {
    const prevX = pet.x;
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
      this._syncPetDirection(pet, pet.x - prevX);
      return true;
    }

    const targetArea = this.resolveTargetArea(pet);
    const layout = this._getSeamLayout(pet);
    const { walkAreas, ranges, seams } = layout;
    const stepState = (walkAreas.length >= 2 && targetArea)
      ? this._resolveCrossDisplayStep(pet, layout)
      : null;

    if (stepState?.kind === 'seam') {
      let remaining = moveDist;
      for (let step = 0; step < 4 && remaining > 1e-9; step += 1) {
        const current = step === 0 ? stepState : this._resolveCrossDisplayStep(pet, layout);
        if (current.kind === 'gap') break;
        const wdx = current.x - pet.x;
        const wdy = current.y - pet.y;
        const wdist = Math.hypot(wdx, wdy);
        if (wdist <= 1e-9) break;
        if (wdist <= remaining) {
          pet.x = current.x;
          pet.y = current.y;
          remaining -= wdist;
          if (current.x === pet.targetX && current.y === pet.targetY) break;
        } else {
          pet.x += (wdx / wdist) * remaining;
          pet.y += (wdy / wdist) * remaining;
          remaining = 0;
        }
      }

      if (this._findBoundsRangeIndex(pet.x, pet.y, ranges) < 0) {
        const activeSeam = this._findSeamAt(pet.x, pet.y, seams, 1e-5);
        if (activeSeam) {
          pet[activeSeam.coord] = this.clampToRange(
            pet[activeSeam.coord],
            activeSeam.seamMin,
            activeSeam.seamMax,
          );
          pet[activeSeam.crossCoord] = this.clampToRange(
            pet[activeSeam.crossCoord],
            activeSeam.corridorMin,
            activeSeam.corridorMax,
          );
        } else {
          this.clampPetToWalkAreas(pet);
        }
      }

      this._syncPetDirection(pet, pet.x - prevX);
      return false;
    }

    const stepDx = pet.targetX - pet.x;
    const stepDy = pet.targetY - pet.y;
    const stepDist = Math.hypot(stepDx, stepDy);
    const actualStep = Math.min(moveDist, stepDist);
    const nextX = stepDist > 0 ? pet.x + (stepDx / stepDist) * actualStep : pet.x;
    const nextY = stepDist > 0 ? pet.y + (stepDy / stepDist) * actualStep : pet.y;

    if (stepState?.kind === 'gap') {
      const epsilon = 1e-7;
      const currentWalkArea = walkAreas[stepState.fromIdx];
      const currentRange = ranges[stepState.fromIdx];
      const destWalkArea = walkAreas[stepState.destIdx];
      const nextInBounds = this._findBoundsRangeIndex(nextX, nextY, ranges) >= 0;
      const nextInSeam = !nextInBounds && Boolean(this._findSeamAt(nextX, nextY, seams));
      const crossedFacingEdge = Boolean(currentWalkArea && currentRange && destWalkArea) && (
        (destWalkArea.x >= currentWalkArea.x + currentWalkArea.width - epsilon
          && nextX > currentRange.maxX + epsilon)
        || (destWalkArea.x + destWalkArea.width <= currentWalkArea.x + epsilon
          && nextX < currentRange.minX - epsilon)
        || (destWalkArea.y >= currentWalkArea.y + currentWalkArea.height - epsilon
          && nextY > currentRange.maxY + epsilon)
        || (destWalkArea.y + destWalkArea.height <= currentWalkArea.y + epsilon
          && nextY < currentRange.minY - epsilon)
      );

      if (
        currentWalkArea
        && !nextInBounds
        && !nextInSeam
        && (crossedFacingEdge || !this.findAreaContainingPet(pet, nextX, nextY))
      ) {
        this.bridgeToTargetArea(pet, currentWalkArea, targetArea);
        this.clampPetToWalkAreas(pet);
        this._syncPetDirection(pet, pet.x - prevX);
        return false;
      }
    }

    pet.x = nextX;
    pet.y = nextY;
    if (this._findBoundsRangeIndex(pet.x, pet.y, ranges) < 0 && !this.canStraddleAdjacentWalkAreas(pet)) {
      this.clampPetToWalkAreas(pet);
    }

    // 按实际水平位移更新朝向（纯垂直位移时保持原朝向）
    this._syncPetDirection(pet, pet.x - prevX);

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
          const layout = this._getSeamLayout(pet);
          const step = layout.walkAreas.length >= 2
            ? this._resolveCrossDisplayStep(pet, layout)
            : null;
          const initialDeltaX = (step?.kind === 'seam' && Math.abs(step.x - pet.x) > 1e-9)
            ? step.x - pet.x
            : pet.targetX - pet.x;
          this._syncPetDirection(pet, initialDeltaX);
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

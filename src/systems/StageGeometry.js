/**
 * StageGeometry — 持有渲染进程的屏幕/可行走区域几何状态（screenInfo），
 * 提供基于该状态的纯几何查询：可行走区域命中、视觉缩放比例、菜单定位边界、
 * 以及宠物越界修正（委托给注入的 MovementSystem）。
 *
 * 依赖通过构造函数注入（deps 对象），不直接引用外部闭包变量：
 *   - getMovementSystem(): 返回当前的 MovementSystem 实例（可能在构造时尚未创建，惰性访问）
 *   - getPets(): 返回当前宠物数组
 */
class StageGeometry {
  constructor(deps = {}) {
    this.getMovementSystem = typeof deps.getMovementSystem === 'function' ? deps.getMovementSystem : () => null;
    this.getPets = typeof deps.getPets === 'function' ? deps.getPets : () => [];

    const initialWidth = Number.isFinite(deps.initialWidth) ? deps.initialWidth : 0;
    const initialHeight = Number.isFinite(deps.initialHeight) ? deps.initialHeight : 0;

    /** @type {{width:number, height:number, walkAreas:Array, taskbarPlatforms:Array, windowScaleFactor:?number, displays:Array, adjacentDisplays:?object}} */
    this.screenInfo = {
      width: initialWidth,
      height: initialHeight,
      walkAreas: [],
      taskbarPlatforms: [],
      windowScaleFactor: null,
      displays: [],
      adjacentDisplays: null,
    };
  }

  get width() {
    return this.screenInfo.width;
  }

  get height() {
    return this.screenInfo.height;
  }

  /**
   * 应用主进程下发的屏幕信息：刷新 screenInfo、同步 MovementSystem 的屏幕尺寸，
   * 并把所有宠物重新收敛回可行走区域内。
   */
  applyScreenInfo(info) {
    const width = info.width;
    const height = info.height;
    this.screenInfo = {
      width,
      height,
      walkAreas: Array.isArray(info.walkAreas) ? info.walkAreas : [],
      taskbarPlatforms: Array.isArray(info.taskbarPlatforms) ? info.taskbarPlatforms : [],
      windowScaleFactor: info.windowScaleFactor,
      displays: Array.isArray(info.displays) ? info.displays : [],
      adjacentDisplays: info.adjacentDisplays || null,
    };

    const movementSystem = this.getMovementSystem();
    if (movementSystem) {
      movementSystem.setScreenSize(width, height, info.walkAreas);
    }
    this.getPets().forEach((pet) => this.keepPetReachable(pet));

    return this.screenInfo;
  }

  /**
   * 把宠物 clamp 回当前可行走区域内（越界修正）。
   */
  keepPetReachable(pet) {
    const movementSystem = this.getMovementSystem();
    if (movementSystem) {
      movementSystem.clampPetToWalkAreas(pet);
    }
  }

  /**
   * 返回当前全部可行走区域。优先读取 MovementSystem 的归一化结果，
   * 无 MovementSystem 时回退到 screenInfo.walkAreas 原始数组。
   */
  getWalkAreas() {
    const movementSystem = this.getMovementSystem();
    return movementSystem ? movementSystem.getWalkAreas() : this.screenInfo.walkAreas;
  }

  /**
   * 查找包含指定点的可行走区域。
   */
  getWalkAreaForPoint(x, y) {
    const areas = this.getWalkAreas();
    return areas.find((walkArea) => (
      x >= walkArea.x
      && x <= walkArea.x + walkArea.width
      && y >= walkArea.y
      && y <= walkArea.y + walkArea.height
    ));
  }

  /**
   * 指定点所在可行走区域的视觉缩放比例，缺省为 1。
   */
  getVisualScaleForPoint(x, y) {
    const area = this.getWalkAreaForPoint(x, y);
    const scaleRatio = Number(area?.scaleRatio);
    return Number.isFinite(scaleRatio) && scaleRatio > 0 ? scaleRatio : 1;
  }

  /**
   * 宠物中心点所在可行走区域的视觉缩放比例。
   */
  getVisualScaleForPet(pet) {
    return this.getVisualScaleForPoint(pet.x + pet.size / 2, pet.y + pet.size / 2);
  }

  /**
   * 主显示器（或第一个）可行走区域的缩放比例，供全局天气特效使用。
   */
  getWeatherEffectScale() {
    const primaryArea = this.screenInfo.walkAreas.find(area => area.isPrimary) || this.screenInfo.walkAreas[0];
    const scaleRatio = Number(primaryArea?.scaleRatio);
    return Number.isFinite(scaleRatio) && scaleRatio > 0 ? scaleRatio : 1;
  }

  /**
   * 右键菜单定位边界：宠物所在可行走区域，找不到时回退到整个窗口。
   */
  getMenuBoundsForPet(pet) {
    return this.getWalkAreaForPoint(pet.x + pet.size / 2, pet.y + pet.size / 2)
      || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { StageGeometry };
}

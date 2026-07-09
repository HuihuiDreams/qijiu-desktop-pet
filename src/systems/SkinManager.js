/**
 * SkinManager — 管理和切换桌宠皮肤的系统。
 *
 * 职责：
 * 1. 维护可用皮肤列表（由主进程扫描 assets 目录获得）
 * 2. 根据选中皮肤生成完整的路径映射 (SkinPaths)
 * 3. 将路径注入 Pet、SpriteView、PetRenderer
 * 4. 持久化用户的皮肤选择（委托给 TimeSystem）
 */
class SkinManager {
  /**
   * 皮肤中文显示名映射表。
   * 文件夹用英文/数字命名，托盘菜单显示中文名。
   * 若某个皮肤 ID 不在此表中，则直接显示文件夹名（兜底）。
   */
  static SKIN_NAMES = {
    'default': '默认皮肤·凉拌仓鼠',
    'birds': '鸟塑七九·凉拌仓鼠',
    'animal_ears': '猫兔七九·紫萤',
    'school_au': '校园七九·幕汤汤',
  };

  static SKIN_IMAGE_SCALES = {
    animal_ears: 1.08,
    school_au: 1.08,
  };

  constructor() {
    /** @type {string} 当前皮肤 ID */
    this.currentSkinId = 'default';
    /** @type {string[]} 可用皮肤 ID 列表 */
    this.availableSkins = ['default'];
  }

  /**
   * 设置可用皮肤列表（通常由主进程 IPC 提供）。
   * @param {string[]} skinIds
   */
  setAvailableSkins(skinIds) {
    this.availableSkins = skinIds;
  }

  /**
   * 返回可用皮肤列表，附带中文显示名。
   * @returns {{ id: string, displayName: string }[]}
   */
  getAvailableSkins() {
    return this.availableSkins.map(id => ({
      id,
      displayName: this.getDisplayName(id),
    }));
  }

  /**
   * 获取当前皮肤 ID。
   * @returns {string}
   */
  getCurrentSkin() {
    return this.currentSkinId;
  }

  /**
   * 获取皮肤的中文显示名（优先查 SKIN_NAMES，兜底用文件夹名）。
   * @param {string} skinId
   * @returns {string}
   */
  getDisplayName(skinId) {
    return SkinManager.SKIN_NAMES[skinId] || skinId;
  }

  /**
   * 切换皮肤：构建路径映射并注入到 Pet/SpriteView/PetRenderer。
   * 内部支持单文件缺失时 Fallback 到 default。
   *
   * @param {string} skinId - 目标皮肤 ID
   * @param {{ petA: Pet, petB: Pet, spriteView: SpriteView, renderer: PetRenderer }} targets
   * @returns {Promise<object>} 返回构建好的 SkinPaths
   */
  async applySkin(skinId, targets) {
    const paths = this.buildPaths(skinId);
    this.currentSkinId = skinId;

    const { petA, petB, spriteView, renderer } = targets;

    // 1. 更新 Pet 实例的 image 和 sprites
    if (petA) petA.updateSkin(paths.petA);
    if (petB) petB.updateSkin(paths.petB);

    // 2. 更新 SpriteView 的 imageMap
    if (spriteView) {
      spriteView.updateImageMap(paths.imageMap);
      // 3. 异步预加载新皮肤图片，等待完成后再渲染
      if (petA) await spriteView.reattach(petA);
      if (petB) await spriteView.reattach(petB);
    }

    // 4. 更新 PetRenderer 的叠加层路径前缀
    if (renderer) renderer.setSkinPrefix(paths.overlayPrefix);

    return paths;
  }

  /**
   * 基于 skinId 构建全套路径映射。
   * @param {string} skinId
   * @returns {object} SkinPaths
   */
  buildPaths(skinId) {
    const base = `pet-asset://skin/${skinId}`;
    const imageScale = SkinManager.SKIN_IMAGE_SCALES[skinId] || 1;

    return {
      petA: {
        image: `${base}/left.webp`,
        imageScale,
        sprites: {
          idle: { frames: [`${base}/left.webp`], fps: 1 },
          walkingLeft: {
            frames: [
              `${base}/yueqi/walk_left01.webp`,
              `${base}/yueqi/walk_left02.webp`,
              `${base}/yueqi/walk_left03.webp`,
              `${base}/yueqi/walk_left04.webp`,
            ],
            fps: 4,
          },
          walkingRight: {
            frames: [
              `${base}/yueqi/walk_right01.webp`,
              `${base}/yueqi/walk_right02.webp`,
              `${base}/yueqi/walk_right03.webp`,
              `${base}/yueqi/walk_right04.webp`,
            ],
            fps: 4,
          },
        },
      },
      petB: {
        image: `${base}/right.webp`,
        imageScale,
        sprites: {
          idle: { frames: [`${base}/right.webp`], fps: 1 },
          walkingLeft: {
            frames: [
              `${base}/shenjiu/walk_left01.webp`,
              `${base}/shenjiu/walk_left02.webp`,
              `${base}/shenjiu/walk_left03.webp`,
              `${base}/shenjiu/walk_left04.webp`,
            ],
            fps: 4,
          },
          walkingRight: {
            frames: [
              `${base}/shenjiu/walk_right01.webp`,
              `${base}/shenjiu/walk_right02.webp`,
              `${base}/shenjiu/walk_right03.webp`,
              `${base}/shenjiu/walk_right04.webp`,
            ],
            fps: 4,
          },
        },
      },
      imageMap: {
        shenjiu: {
          meditating: `${base}/right_cultivate.webp`,
          hungry: `${base}/right_hungry.webp`,
          sleeping: `${base}/right_sleep.webp`,
          eating: `${base}/right_eat.webp`,
          patted: `${base}/right_pat.webp`,
        },
        yueqi: {
          meditating: `${base}/left_cultivate.webp`,
          hungry: `${base}/left_hungry.webp`,
          sleeping: `${base}/left_sleep.webp`,
          eating: `${base}/left_eat.webp`,
          patted: `${base}/left_pat.webp`,
        },
      },
      overlayPrefix: `${base}/`,
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SkinManager };
}

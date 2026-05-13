/**
 * SpriteView - 宠物身体视觉管理器。
 * 负责在 `.pet-body` 内渲染图像、表情符号和多帧序列帧，
 * 同时将位置、交互和 CSS 状态的所有权留给其他系统。
 */
class SpriteView {
  /**
   * @param {Object} [options]
   * @param {Object} [options.imageMap] - 状态到图片的映射
   * @param {Object} [options.emojiMap] - 状态到 Emoji 的映射（兜底方案）
   */
  constructor(options = {}) {
    // 静态图片映射：当宠物处于特定状态时显示的单张图片
    this.imageMap = options.imageMap || {
      shenjiu: {
        meditating: 'assets/default/right_cultivate.png',
        hungry: 'assets/default/right_hungry.png',
        sleeping: 'assets/default/right_sleep.png',
        eating: 'assets/default/right_eat.png',
        patted: 'assets/default/right_pat.png',
      },
      yueqi: {
        meditating: 'assets/default/left_cultivate.png',
        hungry: 'assets/default/left_hungry.png',
        sleeping: 'assets/default/left_sleep.png',
        eating: 'assets/default/left_eat.png',
        patted: 'assets/default/left_pat.png',
      },
    };

    // Emoji 映射：作为兜底方案，当没有图片可用时显示
    this.emojiMap = options.emojiMap || {
      yueqi: {
        idle: '🗡️',
        walkingLeft: '🗡️',
        walkingRight: '🗡️',
        eating: '🍡',
        sleeping: '😴',
        meditating: '🧘',
        working: '🧵',
        hungry: '🥺',
      },
      shenjiu: {
        idle: '🪭',
        walkingLeft: '🪭',
        walkingRight: '🪭',
        eating: '🍖',
        sleeping: '😴',
        meditating: '🧘',
        working: '📜',
        hungry: '🥱',
      },
    };
  }

  /**
   * 将 SpriteView 的内部缓存附加到宠物实例上。
   * @param {Pet} pet
   */
  attach(pet) {
    pet._sv_lastResource = null;
    pet._sv_frameIndex = 0;
    pet._sv_frameTimer = 0;
    pet._sv_lastSpriteKey = null;
    this._preloadPetSprites(pet);
  }

  _preloadPetSprites(pet) {
    if (typeof Image === 'undefined') return;

    const resources = new Set();
    if (pet.image) resources.add(pet.image);

    Object.values(pet.sprites || {}).forEach((spriteConfig) => {
      (spriteConfig.frames || []).forEach((frame) => resources.add(frame));
    });

    Object.values(this.imageMap[pet.id] || {}).forEach((resource) => resources.add(resource));

    pet._sv_preloadedImages = Array.from(resources).map((resource) => {
      const image = new Image();
      image.src = resource;
      return image;
    });
  }

  /**
   * 更新宠物的视觉状态。
   * @param {Pet} pet
   * @param {number} deltaMs - 毫秒增量
   */
  update(pet, deltaMs) {
    if (!pet.element) return;

    const spriteConfig = this._getSpriteConfig(pet);
    const spriteKey = this._resolveSpriteKey(pet);

    // 如果状态改变，重置帧索引
    if (pet._sv_lastSpriteKey !== spriteKey) {
      pet._sv_frameIndex = 0;
      pet._sv_frameTimer = 0;
    }

    if (spriteConfig && spriteConfig.frames.length > 1) {
      // 处理多帧序列帧动画
      const fps = spriteConfig.fps || 4;
      const interval = 1000 / fps;

      pet._sv_frameTimer += deltaMs;
      if (pet._sv_frameTimer >= interval) {
        const frameAdvance = Math.floor(pet._sv_frameTimer / interval);
        pet._sv_frameTimer -= frameAdvance * interval;
        pet._sv_frameIndex = (pet._sv_frameIndex + frameAdvance) % spriteConfig.frames.length;
      }

      const resource = spriteConfig.frames[pet._sv_frameIndex];
      this._render(pet, resource, 'image');
    } else if (spriteConfig && spriteConfig.frames.length === 1) {
      // 处理单帧序列帧
      this._render(pet, spriteConfig.frames[0], 'image');
    } else {
      // 回退到静态图片或 Emoji
      const { src, type } = this._resolveResource(pet);
      this._render(pet, src, type);
    }

    pet._sv_lastSpriteKey = spriteKey;
  }

  /**
   * 解析当前视觉状态的序列帧配置。
   * @param {Pet} pet
   * @returns {{ frames: string[], fps: number } | null}
   */
  _getSpriteConfig(pet) {
    const sprites = pet.sprites;
    if (!sprites) return null;

    const key = this._resolveSpriteKey(pet);
    return sprites[key] || null;
  }

  /**
   * 解析序列帧/图片/Emoji 映射所使用的状态键。
   * @param {Pet} pet
   * @returns {string}
   */
  _resolveSpriteKey(pet) {
    if (pet.isHungry() && pet.state === 'idle') return 'hungry';
    
    // 如果是行走状态，根据朝向分别返回 walkingLeft 和 walkingRight
    if (pet.state === 'walking') {
      return pet.direction === 'left' ? 'walkingLeft' : 'walkingRight';
    }
    
    return pet.state || 'idle';
  }

  /**
   * 当没有序列帧配置可用时，解析兜底资源。
   * @param {Pet} pet
   * @returns {{ src: string, type: 'image'|'emoji' }}
   */
  _resolveResource(pet) {
    let stateKey = pet.state;
    if (pet.isHungry() && pet.state === 'idle') stateKey = 'hungry';

    // 如果是行走状态，需要区分左右
    if (pet.state === 'walking') {
      stateKey = pet.direction === 'left' ? 'walkingLeft' : 'walkingRight';
    }

    // 优先使用 imageMap 中的图片
    const stateImage = this.imageMap[pet.id]?.[stateKey] || null;
    if (stateImage) {
      return { src: stateImage, type: 'image' };
    }

    // 检查是否有特殊的动作 Emoji
    const emojiIdle = this.emojiMap[pet.id]?.idle;
    const emojiCurrent = this.emojiMap[pet.id]?.[stateKey];
    const isStateEmoji = emojiCurrent && emojiCurrent !== emojiIdle &&
      emojiCurrent !== this.emojiMap[pet.id]?.walkingLeft &&
      emojiCurrent !== this.emojiMap[pet.id]?.walkingRight;

    // 如果宠物有默认图片且当前不是特殊动作 Emoji，则使用默认图片
    if (pet.image && !isStateEmoji) {
      return { src: pet.image, type: 'image' };
    }

    // 最后使用 Emoji 兜底
    return { src: emojiCurrent || emojiIdle || '🙂', type: 'emoji' };
  }

  /**
   * 更新 `.pet-body` 内容，带有脏检查机制。
   * @param {Pet} pet
   * @param {string} resource
   * @param {'image'|'emoji'} type
   */
  _render(pet, resource, type) {
    if (pet._sv_lastResource === resource) return;
    const body = pet.element?.querySelector('.pet-body');
    if (!body) return;

    if (type === 'image') {
      let image = body.querySelector('.pet-image');
      if (!image) {
        body.textContent = '';
        image = document.createElement('img');
        image.className = 'pet-image';
        body.appendChild(image);
      }
      if (image.getAttribute('src') !== resource) {
        image.src = resource;
      }
      image.alt = pet.nickname || '';
    } else {
      body.textContent = resource;
    }

    pet._sv_lastResource = resource;
  }
  /**
   * 运行时更新 imageMap（由 SkinManager 调用）。
   * @param {Object} newMap - 新的 { shenjiu: {...}, yueqi: {...} } 映射
   */
  updateImageMap(newMap) {
    this.imageMap = newMap;
  }

  /**
   * 重新附加宠物并异步预加载所有新皮肤图片。
   * 返回一个 Promise，在所有图片 onload 后 resolve，防止切换时闪烁。
   * @param {Pet} pet
   * @returns {Promise<void>}
   */
  reattach(pet) {
    // 清除脏检查缓存，强制下一帧重新渲染
    pet._sv_lastResource = null;
    pet._sv_frameIndex = 0;
    pet._sv_frameTimer = 0;
    pet._sv_lastSpriteKey = null;

    return this._preloadPetSpritesAsync(pet);
  }

  /**
   * 异步预加载宠物的所有图片资源。
   * @param {Pet} pet
   * @returns {Promise<void>}
   */
  _preloadPetSpritesAsync(pet) {
    if (typeof Image === 'undefined') return Promise.resolve();

    const resources = new Set();
    if (pet.image) resources.add(pet.image);

    Object.values(pet.sprites || {}).forEach((spriteConfig) => {
      (spriteConfig.frames || []).forEach((frame) => resources.add(frame));
    });

    Object.values(this.imageMap[pet.id] || {}).forEach((resource) => resources.add(resource));

    const promises = Array.from(resources).map((resource) => {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = resolve; // 加载失败也 resolve，避免卡住
        image.src = resource;
      });
    });

    // 同时更新同步缓存供 _preloadPetSprites 使用
    pet._sv_preloadedImages = Array.from(resources).map((r) => {
      const img = new Image();
      img.src = r;
      return img;
    });

    return Promise.all(promises).then(() => {});
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SpriteView };
}

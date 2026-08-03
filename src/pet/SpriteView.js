/**
 * SpriteView owns the visual content inside each `.pet-body`.
 * Movement, interaction, and CSS state classes remain owned by other systems.
 */
class SpriteView {
  constructor(options = {}) {
    this.imageMap = options.imageMap || {
      shenjiu: {
        meditating: 'pet-asset://skin/default/right_cultivate.webp',
        hungry: 'pet-asset://skin/default/right_hungry.webp',
        sleeping: 'pet-asset://skin/default/right_sleep.webp',
        eating: 'pet-asset://skin/default/right_eat.webp',
        patted: 'pet-asset://skin/default/right_pat.webp',
      },
      yueqi: {
        meditating: 'pet-asset://skin/default/left_cultivate.webp',
        hungry: 'pet-asset://skin/default/left_hungry.webp',
        sleeping: 'pet-asset://skin/default/left_sleep.webp',
        eating: 'pet-asset://skin/default/left_eat.webp',
        patted: 'pet-asset://skin/default/left_pat.webp',
      },
    };

    this.emojiMap = options.emojiMap || {
      yueqi: {
        idle: '🗡️',
        walkingLeft: '🗡️',
        walkingRight: '🗡️',
        eating: '🍡',
        sleeping: '😴',
        meditating: '🧘🏻‍♂️',
        working: '🧵',
        hungry: '🥺',
      },
      shenjiu: {
        idle: '🪭',
        walkingLeft: '🪭',
        walkingRight: '🪭',
        eating: '🍖',
        sleeping: '😴',
        meditating: '🧘🏻‍♂️',
        working: '📜',
        hungry: '🥱',
      },
    };
  }

  attach(pet) {
    pet._sv_lastResource = null;
    pet._sv_frameIndex = 0;
    pet._sv_frameTimer = 0;
    pet._sv_lastSpriteKey = null;
    return this._preloadPetSpritesAsync(pet);
  }

  _collectPetResources(pet) {
    const resources = new Set();
    if (pet.image) resources.add(pet.image);

    Object.values(pet.sprites || {}).forEach((spriteConfig) => {
      (spriteConfig.frames || []).forEach((frame) => resources.add(frame));
    });

    Object.values(this.imageMap[pet.id] || {}).forEach((resource) => resources.add(resource));

    return Array.from(resources);
  }



  update(pet, deltaMs) {
    if (!pet.element) return;

    const spriteConfig = this._getSpriteConfig(pet);
    const spriteKey = this._resolveStateKey(pet);

    if (pet._sv_lastSpriteKey !== spriteKey) {
      pet._sv_frameIndex = 0;
      pet._sv_frameTimer = 0;
    }

    if (spriteConfig && spriteConfig.frames.length > 1) {
      const fps = spriteConfig.fps || 4;
      const interval = 1000 / fps;

      pet._sv_frameTimer += deltaMs;
      if (pet._sv_frameTimer >= interval) {
        const frameAdvance = Math.floor(pet._sv_frameTimer / interval);
        pet._sv_frameTimer -= frameAdvance * interval;
        pet._sv_frameIndex = (pet._sv_frameIndex + frameAdvance) % spriteConfig.frames.length;
      }

      this._render(pet, spriteConfig.frames[pet._sv_frameIndex], 'image');
    } else if (spriteConfig && spriteConfig.frames.length === 1) {
      this._render(pet, spriteConfig.frames[0], 'image');
    } else {
      const { src, type } = this._resolveResource(pet);
      this._render(pet, src, type);
    }

    pet._sv_lastSpriteKey = spriteKey;
  }

  _getSpriteConfig(pet) {
    const sprites = pet.sprites;
    if (!sprites) return null;

    return sprites[this._resolveStateKey(pet)] || null;
  }

  /**
   * 统一的状态 → 视觉 key 映射。
   * _resolveStateKey 和 _resolveResource 共用此方法，避免逻辑重复。
   */
  _resolveStateKey(pet) {
    if (pet.isHungry() && pet.state === 'idle') return 'hungry';
    if (pet.state === 'idle' && pet.timePhase === 'night') return 'sleeping';
    if (pet.state === 'walking') {
      return pet.direction === 'left' ? 'walkingLeft' : 'walkingRight';
    }
    if (pet.state === 'interacting') {
      return pet.direction === 'left' ? 'interactingLeft' : 'interactingRight';
    }
    return pet.state || 'idle';
  }

  _resolveResource(pet) {
    const stateKey = this._resolveStateKey(pet);

    const stateImage = this.imageMap[pet.id]?.[stateKey] || null;
    if (stateImage) {
      return { src: stateImage, type: 'image' };
    }

    if (pet.state === 'interacting') {
      const directionKey = pet.direction === 'left' ? 'walkingLeft' : 'walkingRight';
      const frames = pet.sprites?.[directionKey]?.frames || [];
      const directionFrame = frames[1] || frames[0];
      if (directionFrame) {
        return { src: directionFrame, type: 'image' };
      }
    }

    const emojiIdle = this.emojiMap[pet.id]?.idle;
    const emojiCurrent = this.emojiMap[pet.id]?.[stateKey];
    const isStateEmoji = emojiCurrent && emojiCurrent !== emojiIdle
      && emojiCurrent !== this.emojiMap[pet.id]?.walkingLeft
      && emojiCurrent !== this.emojiMap[pet.id]?.walkingRight;

    if (pet.image && !isStateEmoji) {
      return { src: pet.image, type: 'image' };
    }

    return { src: emojiCurrent || emojiIdle || '🙂', type: 'emoji' };
  }

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
        image.onerror = () => {
          image.remove();
          body.textContent = pet.emoji || '';
        };
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

  updateImageMap(newMap) {
    this.imageMap = newMap;
  }

  _preloadPetSpritesAsync(pet) {
    if (typeof Image === 'undefined') return Promise.resolve();

    if (Array.isArray(pet._sv_preloadedImages)) {
      pet._sv_preloadedImages.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    }

    const images = [];
    const promises = this._collectPetResources(pet).map((resource) => {
      return new Promise((resolve) => {
        const image = new Image();
        const done = () => {
          image.onload = null;
          image.onerror = null;
          resolve();
        };
        image.onload = done;
        image.onerror = done;
        image.src = resource;
        images.push(image);
      });
    });

    pet._sv_preloadedImages = images;

    return Promise.all(promises).then(() => {});
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SpriteView };
}

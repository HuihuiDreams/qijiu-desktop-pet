// 1x renderer-coordinate design tokens. Multi-display rendering multiplies these
// by the active walk area's scaleRatio before positioning visual overlay pieces.
const INTERACTION_OVERLAY_BASE_WIDTH = 176;
const INTERACTION_OVERLAY_TOP_OFFSET = 64;
const INTERACTION_OVERLAY_AURA_TOP_OFFSET = 82;
const INTERACTION_BUBBLE_TOP_GAP = 16;
const INTERACTION_BUBBLE_HEAD_X = {
  shenjiu: 0.1,
  yueqi: 0.9,
};

/**
 * PetRenderer — 为每个宠物创建和更新 DOM 元素。
 * 处理鼠标移入/移出事件以切换点击穿透行为。
 */
class PetRenderer {
  constructor(stage, keepPetReachable = null, getVisualScaleForPet = null) {
    this.stage = stage;
    this.keepPetReachable = typeof keepPetReachable === 'function' ? keepPetReachable : null;
    this.getVisualScaleForPet = typeof getVisualScaleForPet === 'function' ? getVisualScaleForPet : null;
    /** @type {string} 当前皮肤的路径前缀，用于叠加层图片 */
    this.skinPrefix = 'pet-asset://skin/default/';
    /** @type {number[]} 活跃的覆盖层气泡定时器 ID */
    this._overlayBubbleTimers = [];
  }

  /**
   * 设置皮肤路径前缀（由 SkinManager 调用）。
   * @param {string} prefix - 如 'pet-asset://skin/qban/'
   */
  setSkinPrefix(prefix) {
    if (this.skinPrefix !== prefix) {
      if (Array.isArray(this._preloadedOverlays)) {
        this._preloadedOverlays.forEach((img) => {
          img.onload = null;
          img.onerror = null;
        });
      }
      this.skinPrefix = prefix;
      if (typeof Image !== 'undefined') {
        this._preloadedOverlays = ['cultivate.webp', 'kiss.webp'].map((filename) => {
          const img = new Image();
          const done = () => {
            img.onload = null;
            img.onerror = null;
          };
          img.onload = done;
          img.onerror = done;
          img.src = `${prefix}${filename}`;
          return img;
        });
      }
    }
  }

  getPetVisualScale(pet) {
    const visualScale = this.getVisualScaleForPet ? this.getVisualScaleForPet(pet) : 1;
    return Number.isFinite(visualScale) && visualScale > 0 ? visualScale : 1;
  }

  getPetImageScale(pet) {
    const imageScale = Number(pet?.imageScale);
    return Number.isFinite(imageScale) && imageScale > 0 ? imageScale : 1;
  }

  getPetVisualCenter(pet) {
    const visualScale = this.getPetVisualScale(pet);
    return {
      x: pet.x + (pet.size * visualScale) / 2,
      y: pet.y + (pet.size * visualScale) / 2,
      scale: visualScale,
    };
  }

  spawnQiAuraAt(x, y, size = 112, tone = 'default', visualScale = 1) {
    const scale = Number.isFinite(visualScale) && visualScale > 0 ? visualScale : 1;
    const aura = document.createElement('div');
    aura.className = `qi-aura qi-aura--${tone}`;
    aura.style.left = `${x}px`;
    aura.style.top = `${y}px`;
    aura.style.width = `${size * scale}px`;
    aura.style.height = `${size * scale}px`;

    this.stage.appendChild(aura);
    aura.addEventListener('animationend', () => aura.remove(), { once: true });
  }

  spawnQiAura(pet, tone = 'default') {
    const { x, y, scale: visualScale } = this.getPetVisualCenter(pet);
    this.spawnQiAuraAt(x, y, Math.max(112, pet.size * 1.45), tone, visualScale);
  }

  spawnOverlayQiAura(overlayPos, tone = 'default', resolveVisualScale = null) {
    if (!overlayPos) return;
    const baseWidth = Number.isFinite(overlayPos.baseWidth) && overlayPos.baseWidth > 0
      ? overlayPos.baseWidth
      : INTERACTION_OVERLAY_BASE_WIDTH;
    const width = Number.isFinite(overlayPos.width) && overlayPos.width > 0
      ? overlayPos.width
      : baseWidth;
    const overlayScale = Number.isFinite(overlayPos.scale) && overlayPos.scale > 0 ? overlayPos.scale : 1;
    const combinedScale = width / baseWidth;
    const auraX = overlayPos.x + width / 2;
    const auraY = overlayPos.y + INTERACTION_OVERLAY_AURA_TOP_OFFSET * combinedScale;
    const resolvedScale = typeof resolveVisualScale === 'function' ? resolveVisualScale(auraX, auraY) : undefined;
    const scale = Number.isFinite(resolvedScale) && resolvedScale > 0 ? resolvedScale : overlayScale;
    const auraVisualScale = scale === overlayScale ? 1 : scale / overlayScale;
    this.spawnQiAuraAt(auraX, auraY, width * 1.2, tone, auraVisualScale);
  }

  /**
   * 为宠物创建 DOM 元素并附加到舞台（stage）上。
   */
  createPetElement(pet) {
    const el = document.createElement('div');
    el.id = `pet-${pet.id}`;
    el.className = `pet pet--${pet.id}`;

    const body = document.createElement('div');
    body.className = 'pet-body';
    if (pet.image) {
      const image = document.createElement('img');
      image.src = pet.image;
      image.alt = pet.nickname || '';
      image.className = 'pet-image';
      image.onerror = () => {
        image.remove();
        body.textContent = pet.emoji || '';
      };
      body.appendChild(image);
    } else {
      body.textContent = pet.emoji || '';
    }
    el.appendChild(body);

    // 初始基准点
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.transformOrigin = 'top left';
    // 初始位置，使用 transform 控制位置以启用 GPU 硬件加速并避免布局重排
    const visualScale = this.getPetVisualScale(pet);
    el.style.transform = `translate3d(${pet.x}px, ${pet.y}px, 0) scale(${visualScale})`;
    const imageScale = this.getPetImageScale(pet);
    el.style.setProperty('--pet-image-scale', imageScale);
    const petSize = Number.isFinite(pet.size) && pet.size > 0 ? pet.size : 96;
    el.style.setProperty('--pet-size', `${petSize}px`);
    pet._renderedSize = pet.size;
    pet._renderedX = pet.x;
    pet._renderedY = pet.y;
    pet._renderedVisualScale = visualScale;
    pet._renderedImageScale = imageScale;

    // 初始化状态缓存，避免每帧重复操作 classList
    pet._renderedState = null;
    pet._renderedDirection = null;
    pet._renderedHungry = null;
    pet._renderedLowMood = null;
    const setWeatherInteractionMuted = (muted) => {
      document.body?.classList?.toggle('weather-interaction-muted', muted);
    };

    // 鼠标事件：切换点击穿透 (防止遮挡后方窗口)
    el.addEventListener('mouseenter', () => {
      setWeatherInteractionMuted(true);
      window.electronAPI.setIgnoreMouseEvents(false);
    });

    el.addEventListener('mouseleave', () => {
      // 拖拽中，或有菜单打开时，不要恢复点击穿透
      const menuOpen = !document.getElementById('context-menu')?.classList?.contains('hidden');
      if (!pet.isDragging && !menuOpen) {
        setWeatherInteractionMuted(false);
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    // === 拖拽支持 ===
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragWatchdogTimer = null;
    const restoreMousePassthrough = () => {
      setWeatherInteractionMuted(false);
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    };
    const keepPetReachable = () => {
      if (this.keepPetReachable) {
        this.keepPetReachable(pet);
        return;
      }

      const minVisible = Math.min(32, pet.size);
      pet.x = Math.min(Math.max(pet.x, minVisible - pet.size), window.innerWidth - minVisible);
      pet.y = Math.min(Math.max(pet.y, 0), window.innerHeight - minVisible);
    };
    const clearDragWatchdog = () => {
      if (dragWatchdogTimer) {
        clearTimeout(dragWatchdogTimer);
        dragWatchdogTimer = null;
      }
    };
    const finishDrag = (restoreImmediately = false) => {
      if (!pet.isDragging) return;

      clearDragWatchdog();
      pet.isDragging = false;
      pet.idleTimer = 2000 + Math.random() * 3000;
      keepPetReachable();
      if (window.electronAPI.notifyDragEnded) window.electronAPI.notifyDragEnded();

      if (restoreImmediately) {
        restoreMousePassthrough();
        return;
      }

      setTimeout(() => {
        if (!pet.isDragging) {
          restoreMousePassthrough();
        }
      }, 100);
    };
    const refreshDragWatchdog = () => {
      clearDragWatchdog();
      dragWatchdogTimer = setTimeout(() => finishDrag(true), 1200);
    };

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 仅支持左键拖拽
      e.preventDefault();
      pet.isDragging = true;
      setWeatherInteractionMuted(true);
      pet.setState('idle');
      pet.idleTimer = 3000; // 拖拽放下后暂停行走一段时间
      dragOffsetX = e.clientX - pet.x;
      dragOffsetY = e.clientY - pet.y;
      window.electronAPI.setIgnoreMouseEvents(false, { leaseMs: 1000 });
      if (window.electronAPI.notifyDragStarted) window.electronAPI.notifyDragStarted();
      refreshDragWatchdog();
    });

    document.addEventListener('mousemove', (e) => {
      if (!pet.isDragging) return;
      pet.x = e.clientX - dragOffsetX;
      pet.y = e.clientY - dragOffsetY;
      window.electronAPI.setIgnoreMouseEvents(false, { leaseMs: 1000 });
      refreshDragWatchdog();
    });

    document.addEventListener('mouseup', (e) => {
      finishDrag();
      // 在短暂延迟后恢复点击穿透 (让 mouseleave 能够正常触发)
    });

    window.addEventListener('blur', () => finishDrag(true));

    this.stage.appendChild(el);
    pet.element = el;
    return el;
  }

  /**
   * 更新宠物在屏幕上的视觉位置和状态类（CSS Class）。
   */
  update(pet) {
    const el = pet.element;
    if (!el) return;

    // 优化：使用 transform 代替 left/top，极大地减少布局重排 (Layout Thrashing) 的性能开销
    const visualScale = this.getVisualScaleForPet ? this.getVisualScaleForPet(pet) : 1;
    if (pet._renderedX !== pet.x || pet._renderedY !== pet.y || pet._renderedVisualScale !== visualScale) {
      el.style.transform = `translate3d(${pet.x}px, ${pet.y}px, 0) scale(${visualScale})`;
      pet._renderedX = pet.x;
      pet._renderedY = pet.y;
      pet._renderedVisualScale = visualScale;
    }

    const imageScale = this.getPetImageScale(pet);
    if (pet._renderedImageScale !== imageScale) {
      el.style.setProperty('--pet-image-scale', imageScale);
      pet._renderedImageScale = imageScale;
    }
    if (pet._renderedSize !== pet.size) {
      const petSize = Number.isFinite(pet.size) && pet.size > 0 ? pet.size : 96;
      el.style.setProperty('--pet-size', `${petSize}px`);
      pet._renderedSize = pet.size;
    }

    // 优化：仅当状态真正发生改变时才操作 DOM classList，减少重绘与垃圾回收
    const stateChanged = pet._renderedState !== pet.state;
    if (stateChanged) {
      if (pet._renderedState) el.classList.remove(`pet--${pet._renderedState}`);
      if (pet.state !== 'idle') el.classList.add(`pet--${pet.state}`);
      pet._renderedState = pet.state;
    }

    // 优化：仅当朝向或状态改变时更新类
    if (pet._renderedDirection !== pet.direction || stateChanged) {
      pet._renderedDirection = pet.direction;
    }

    // 优化：仅当过低状态改变时更新类
    const isHungry = pet.isHungry();
    if (pet._renderedHungry !== isHungry) {
      if (isHungry) el.classList.add('pet--hungry');
      else el.classList.remove('pet--hungry');
      pet._renderedHungry = isHungry;
    }

    const isLowMood = pet.isLowMood();
    if (pet._renderedLowMood !== isLowMood) {
      if (isLowMood) el.classList.add('pet--low-mood');
      else el.classList.remove('pet--low-mood');
      pet._renderedLowMood = isLowMood;
    }
  }


  getOverlayPosition(petA, petB) {
    const centerA = this.getPetVisualCenter(petA);
    const centerB = this.getPetVisualCenter(petB);
    const visualScale = (centerA.scale + centerB.scale) / 2;

    const basePetSize = typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG?.PET_SIZE) && CONFIG.PET_SIZE > 0
      ? CONFIG.PET_SIZE
      : 96;
    const sizeA = Number.isFinite(petA.size) && petA.size > 0 ? petA.size : basePetSize;
    const sizeB = Number.isFinite(petB.size) && petB.size > 0 ? petB.size : basePetSize;
    const petScale = (sizeA + sizeB) / (2 * basePetSize);
    const combinedScale = visualScale * petScale;

    const overlayWidth = INTERACTION_OVERLAY_BASE_WIDTH * combinedScale;
    const cx = (centerA.x + centerB.x) / 2;
    const cy = (centerA.y + centerB.y) / 2;
    const overlayLeft = cx - overlayWidth / 2;
    const overlayTop = cy - INTERACTION_OVERLAY_TOP_OFFSET * combinedScale;

    return {
      x: overlayLeft,
      y: overlayTop,
      width: overlayWidth,
      baseWidth: INTERACTION_OVERLAY_BASE_WIDTH,
      scale: visualScale,
    };
  }

  /**
   * 在 petA 和 petB 的中心位置显示双人互动的叠加层图片。
   * 同时在显示期间隐藏两只宠物原本的身体图像。
   * 返回叠加层图片在 stage 上的 {x, y, width} 供气泡定位使用。
   */
  showOverlay(petA, petB, type) {
    if (petA.element) petA.element.querySelector('.pet-body').style.visibility = 'hidden';
    if (petB.element) petB.element.querySelector('.pet-body').style.visibility = 'hidden';
    const position = this.getOverlayPosition(petA, petB);

    const overlay = document.createElement('img');
    overlay.id = 'interaction-overlay';
    overlay.src = `${this.skinPrefix}${type}.webp`;
    overlay.alt = type;
    overlay.style.position = 'absolute';
    overlay.style.width = `${position.width}px`;
    overlay.style.height = 'auto';
    overlay.style.left = `${position.x}px`;
    overlay.style.top = `${position.y}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '100';
    overlay.style.opacity = '0';
    overlay.style.transform = 'scale(0.92)';
    overlay.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';

    this.stage.appendChild(overlay);

    // 渐显进入（带缩放弹性效果）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.style.transform = 'scale(1)';
      });
    });

    return position;
  }

  // 体型预览只更新几何，不重建节点或延长现有气泡的寿命。
  updateOverlay(petA, petB) {
    const overlay = document.getElementById('interaction-overlay');
    if (!overlay) return;
    const position = this.getOverlayPosition(petA, petB);
    overlay.style.width = `${position.width}px`;
    overlay.style.left = `${position.x}px`;
    overlay.style.top = `${position.y}px`;
    this.stage.querySelectorAll('.overlay-bubble').forEach((bubble) => {
      this.positionOverlayBubble(bubble, position, Number(bubble.dataset.headXRatio));
    });
    this.adjustOverlayBubblesOverlap(position);
  }

  positionOverlayBubble(el, overlayPos, headXRatio, stackOffset = 0) {
    const visualScale = Number.isFinite(overlayPos?.scale) && overlayPos.scale > 0 ? overlayPos.scale : 1;
    el.style.setProperty('--bubble-scale', visualScale);
    el.style.left = `${overlayPos.x + overlayPos.width * headXRatio}px`;
    const innerHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
    const offset = Number.isFinite(stackOffset) ? Math.ceil(stackOffset) : 0;
    el.style.bottom = `${innerHeight - overlayPos.y + INTERACTION_BUBBLE_TOP_GAP * visualScale + offset}px`;
    if (typeof el.style?.setProperty === 'function') {
      el.style.setProperty('--bubble-stack-offset', `${offset}px`);
    } else if (el.style) {
      el.style['--bubble-stack-offset'] = `${offset}px`;
    }
  }

  adjustOverlayBubblesOverlap(overlayPos) {
    const bubbles = Array.from(this.stage?.querySelectorAll?.('.overlay-bubble') || []);
    if (bubbles.length < 2) return;

    bubbles.sort((a, b) => Number(a.dataset.headXRatio) - Number(b.dataset.headXRatio));
    const [bubbleLeft, bubbleRight] = bubbles;

    const getElementWidth = (el, rect) => {
      if (Number.isFinite(el.offsetWidth) && el.offsetWidth > 0) return el.offsetWidth;
      if (rect && Number.isFinite(rect.width) && rect.width > 0) return rect.width;
      return 0;
    };

    const getElementHeight = (el, rect) => {
      if (Number.isFinite(el.offsetHeight) && el.offsetHeight > 0) return el.offsetHeight;
      if (rect && Number.isFinite(rect.height) && rect.height > 0) return rect.height;
      if (rect && Number.isFinite(rect.bottom) && Number.isFinite(rect.top)) return rect.bottom - rect.top;
      return 0;
    };

    const rectLeft = typeof bubbleLeft.getBoundingClientRect === 'function' ? bubbleLeft.getBoundingClientRect() : null;
    const rectRight = typeof bubbleRight.getBoundingClientRect === 'function' ? bubbleRight.getBoundingClientRect() : null;

    const widthLeft = getElementWidth(bubbleLeft, rectLeft);
    const widthRight = getElementWidth(bubbleRight, rectRight);
    const heightLeft = getElementHeight(bubbleLeft, rectLeft);

    if (widthLeft === 0 || widthRight === 0) return;

    const visualScale = Number.isFinite(overlayPos?.scale) && overlayPos.scale > 0 ? overlayPos.scale : 1;
    const gap = 8 * visualScale;

    const headXLeft = Number(bubbleLeft.dataset.headXRatio);
    const headXRight = Number(bubbleRight.dataset.headXRatio);
    const centerLeft = overlayPos.x + overlayPos.width * headXLeft;
    const centerRight = overlayPos.x + overlayPos.width * headXRight;
    const centerDistance = Math.abs(centerRight - centerLeft);

    const isCenterOverlapping = centerDistance < (widthLeft + widthRight) / 2 + gap;
    const isRectOverlapping = Boolean(
      rectLeft && rectRight &&
      Number.isFinite(rectLeft.left) && Number.isFinite(rectRight.right) &&
      rectLeft.left < rectRight.right + gap && rectLeft.right + gap > rectRight.left
    );

    const isOverlapping = isCenterOverlapping || isRectOverlapping;

    if (isOverlapping) {
      const lift = Math.ceil((heightLeft > 0 ? heightLeft : 32 * visualScale) + gap);
      const innerHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
      const heightRight = getElementHeight(bubbleRight, rectRight) || (32 * visualScale);
      const baseBottom = innerHeight - overlayPos.y + INTERACTION_BUBBLE_TOP_GAP * visualScale;
      const maxBottom = innerHeight - (heightRight + gap);

      if (baseBottom + lift <= maxBottom) {
        this.positionOverlayBubble(bubbleLeft, overlayPos, headXLeft, 0);
        this.positionOverlayBubble(bubbleRight, overlayPos, headXRight, lift);
        if (bubbleRight.style) bubbleRight.style.zIndex = '102';
      } else {
        this.positionOverlayBubble(bubbleLeft, overlayPos, headXLeft, -lift);
        this.positionOverlayBubble(bubbleRight, overlayPos, headXRight, 0);
        if (bubbleLeft.style) bubbleLeft.style.zIndex = '102';
      }
    } else {
      this.positionOverlayBubble(bubbleLeft, overlayPos, headXLeft, 0);
      this.positionOverlayBubble(bubbleRight, overlayPos, headXRight, 0);
      if (bubbleLeft.style) bubbleLeft.style.zIndex = '101';
      if (bubbleRight.style) bubbleRight.style.zIndex = '101';
    }
  }

  /**
   * 在覆盖层图片中两个人物头顶显示对话气泡。
   * 图片布局固定：沈九（绿）在左侧 ~28%，岳七（黑）在右侧 ~72%。
   * @param {string} shenjuText - 沈九的台词
   * @param {string} yueqiText  - 岳七的台词
   * @param {Object} overlayPos - showOverlay 返回的 {x, y, width}
   * @param {number} duration   - 气泡显示时长（毫秒）
   */
  showOverlayBubbles(shenjuText, yueqiText, overlayPos, duration) {
    this._clearOverlayBubbles();
    const makeOverlayBubble = (text, headXRatio) => {
      const el = document.createElement('div');
      el.className = 'dialog-bubble overlay-bubble';
      el.textContent = text;
      el.style.position = 'absolute';
      el.dataset.headXRatio = String(headXRatio);
      this.positionOverlayBubble(el, overlayPos, headXRatio);
      el.style.top = 'auto'; // 移除 top 定位
      el.style.zIndex = '101';
      el.style.pointerEvents = 'none';
      this.stage.appendChild(el);

      // 淡出动画（定时器被追踪，以便 hideOverlay 时清理；支持 getAnimations 协调与兜底定时器）
      const fadeDelay = Math.max(0, duration - 500);
      let removeTimer = null;

      const fadeTimer = setTimeout(() => {
        el.classList.add('dialog-bubble--fade-out');
        if (typeof el.getAnimations === 'function') {
          try {
            const animations = el.getAnimations();
            if (animations && animations.length > 0) {
              Promise.allSettled(animations.map((a) => Promise.resolve(a.finished))).then(() => {
                if (typeof el.remove === 'function') {
                  el.remove();
                }
                if (removeTimer !== null) {
                  clearTimeout(removeTimer);
                  const idx = this._overlayBubbleTimers.indexOf(removeTimer);
                  if (idx !== -1) {
                    this._overlayBubbleTimers.splice(idx, 1);
                  }
                }
              });
            }
          } catch (_) {}
        }
      }, fadeDelay);

      removeTimer = setTimeout(() => {
        if (typeof el.remove === 'function') {
          el.remove();
        }
        const idx = this._overlayBubbleTimers.indexOf(removeTimer);
        if (idx !== -1) {
          this._overlayBubbleTimers.splice(idx, 1);
        }
      }, duration);

      this._overlayBubbleTimers.push(fadeTimer, removeTimer);
    };

    if (shenjuText) makeOverlayBubble(shenjuText, INTERACTION_BUBBLE_HEAD_X.shenjiu);
    if (yueqiText) makeOverlayBubble(yueqiText, INTERACTION_BUBBLE_HEAD_X.yueqi);
    this.adjustOverlayBubblesOverlap(overlayPos);
  }

  /**
   * 隐藏互动叠加层图片并恢复两只宠物原本的身体。
   */
  hideOverlay(petA, petB) {
    this._clearOverlayBubbles();

    const overlay = document.getElementById('interaction-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transform = 'scale(0.92)';
      setTimeout(() => overlay.remove(), 400);
    }

    // 恢复宠物身体显示
    if (petA.element) petA.element.querySelector('.pet-body').style.visibility = '';
    if (petB.element) petB.element.querySelector('.pet-body').style.visibility = '';
  }

  /**
   * 清除所有活跃的覆盖层气泡及其定时器。
   */
  _clearOverlayBubbles() {
    this._overlayBubbleTimers.forEach((id) => clearTimeout(id));
    this._overlayBubbleTimers = [];
    if (this.stage && typeof this.stage.querySelectorAll === 'function') {
      this.stage.querySelectorAll('.overlay-bubble').forEach((el) => {
        if (typeof el.getAnimations === 'function') {
          try {
            el.getAnimations().forEach((a) => a.cancel?.());
          } catch (_) {}
        }
        if (typeof el.remove === 'function') {
          el.remove();
        }
      });
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { PetRenderer };
}

/**
 * PetRenderer — 为每个宠物创建和更新 DOM 元素。
 * 处理鼠标移入/移出事件以切换点击穿透行为。
 */
class PetRenderer {
  constructor(stage) {
    this.stage = stage;
  }

  spawnQiAuraAt(x, y, size = 112, tone = 'default') {
    const aura = document.createElement('div');
    aura.className = `qi-aura qi-aura--${tone}`;
    aura.style.left = `${x}px`;
    aura.style.top = `${y}px`;
    aura.style.width = `${size}px`;
    aura.style.height = `${size}px`;

    this.stage.appendChild(aura);
    aura.addEventListener('animationend', () => aura.remove(), { once: true });
  }

  spawnQiAura(pet, tone = 'default') {
    const x = pet.x + pet.size / 2;
    const y = pet.y + pet.size / 2;
    this.spawnQiAuraAt(x, y, Math.max(112, pet.size * 1.45), tone);
  }

  /**
   * 为宠物创建 DOM 元素并附加到舞台（stage）上。
   */
  createPetElement(pet) {
    const el = document.createElement('div');
    el.id = `pet-${pet.id}`;
    el.className = `pet pet--${pet.id}`;
    el.innerHTML = `
      <div class="pet-body">
        ${pet.image ? `<img src="${pet.image}" alt="${pet.nickname}" class="pet-image">` : pet.emoji}
      </div>
    `;

    // 初始基准点
    el.style.left = '0px';
    el.style.top = '0px';
    // 初始位置，使用 transform 控制位置以启用 GPU 硬件加速并避免布局重排
    el.style.transform = `translate3d(${pet.x}px, ${pet.y}px, 0)`;

    // 初始化状态缓存，避免每帧重复操作 classList
    pet._renderedState = null;
    pet._renderedDirection = null;
    pet._renderedHungry = null;
    pet._renderedLowMood = null;

    // 鼠标事件：切换点击穿透 (防止遮挡后方窗口)
    el.addEventListener('mouseenter', () => {
      window.electronAPI.setIgnoreMouseEvents(false, { leaseMs: 4000 });
    });

    el.addEventListener('mouseleave', () => {
      // 拖拽中，或有菜单/面板打开时，不要恢复点击穿透
      const menuOpen = !document.getElementById('context-menu').classList.contains('hidden');
      const panelOpen = !document.getElementById('status-panel').classList.contains('hidden');
      if (!pet.isDragging && !menuOpen && !panelOpen) {
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    // === 拖拽支持 ===
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragWatchdogTimer = null;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const restoreMousePassthrough = () => {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    };
    const keepPetReachable = () => {
      const minVisible = Math.min(32, pet.size);
      pet.x = clamp(pet.x, minVisible - pet.size, window.innerWidth - minVisible);
      pet.y = clamp(pet.y, 0, window.innerHeight - minVisible);
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
      pet.setState('idle');
      pet.idleTimer = 3000; // 拖拽放下后暂停行走一段时间
      dragOffsetX = e.clientX - pet.x;
      dragOffsetY = e.clientY - pet.y;
      window.electronAPI.setIgnoreMouseEvents(false, { leaseMs: 1000 });
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
    el.style.transform = `translate3d(${pet.x}px, ${pet.y}px, 0)`;

    // 优化：仅当状态真正发生改变时才操作 DOM classList，减少重绘与垃圾回收
    if (pet._renderedState !== pet.state) {
      if (pet._renderedState) el.classList.remove(`pet--${pet._renderedState}`);
      if (pet.state !== 'idle') el.classList.add(`pet--${pet.state}`);
      pet._renderedState = pet.state;
    }

    // 优化：仅当朝向或状态改变时更新类
    if (pet._renderedDirection !== pet.direction || pet._renderedState !== pet.state) {
      if (pet.direction !== pet.defaultDirection && pet.state !== 'walking') {
        el.classList.add('pet--flipped');
      } else {
        el.classList.remove('pet--flipped');
      }
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

  /**
   * 生成一组飘浮效果动画（爱心、闪烁星星等 emoji）。
   * 使用多个带随机偏移的粒子营造更丰富的视觉效果。
   */
  spawnEffect(pet, emoji) {
    const count = 3; // 粒子数量
    const baseX = pet.x + pet.size / 2;
    const baseY = pet.y - 20;

    for (let i = 0; i < count; i++) {
      const effect = document.createElement('div');
      effect.className = 'interaction-effect';
      effect.textContent = emoji;

      // 随机水平偏移，形成扇形扩散
      const offsetX = (Math.random() - 0.5) * 40;
      effect.style.left = `${baseX + offsetX}px`;
      effect.style.top = `${baseY}px`;

      // 交错延迟，让粒子依次出现
      effect.style.animationDelay = `${i * 0.15}s`;

      // 随机缩放，增加层次感
      const scale = 0.7 + Math.random() * 0.6;
      effect.style.fontSize = `${24 * scale}px`;

      this.stage.appendChild(effect);

      // 动画结束后将其移除
      effect.addEventListener('animationend', () => {
        effect.remove();
      });
    }
  }

  /**
   * 在 petA 和 petB 的中心位置显示双人互动的叠加层图片。
   * 同时在显示期间隐藏两只宠物原本的身体图像。
   * 返回叠加层图片在 stage 上的 {x, y, width} 供气泡定位使用。
   */
  showOverlay(petA, petB, type) {
    // 隐藏两只宠物原本的身体
    if (petA.element) petA.element.querySelector('.pet-body').style.visibility = 'hidden';
    if (petB.element) petB.element.querySelector('.pet-body').style.visibility = 'hidden';

    // 计算两只宠物之间的中心点位置
    const cx = (petA.x + petB.x) / 2 + petA.size / 2;
    const cy = (petA.y + petB.y) / 2 + petA.size / 2;

    const overlayWidth = 176;
    const overlayLeft = cx - overlayWidth / 2;
    const overlayTop = cy - 64;

    const overlay = document.createElement('img');
    overlay.id = 'interaction-overlay';
    overlay.src = `assets/${type}.png`;
    overlay.alt = type;
    overlay.style.position = 'absolute';
    overlay.style.width = `${overlayWidth}px`;
    overlay.style.height = 'auto';
    overlay.style.left = `${overlayLeft}px`;
    overlay.style.top = `${overlayTop}px`;
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

    // 返回覆盖层的位置信息，供气泡定位使用
    return { x: overlayLeft, y: overlayTop, width: overlayWidth };
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
    // 为了防止长台词气泡重叠，把气泡的挂载点大幅向两侧拉开
    const SHENJIU_HEAD_X = 0.1; // 偏左
    const YUEQI_HEAD_X = 0.9; // 偏右

    const makeOverlayBubble = (text, headXRatio) => {
      const el = document.createElement('div');
      el.className = 'dialog-bubble overlay-bubble';
      el.textContent = text;
      el.style.position = 'absolute';
      // 水平居中于角色头部
      const headX = overlayPos.x + overlayPos.width * headXRatio;
      el.style.left = `${headX}px`;
      el.style.transform = 'translateX(-50%)';
      // 纵向：放在图片顶部上方，不遮挡人物
      el.style.top = `${overlayPos.y - 48}px`;
      el.style.bottom = 'auto'; // 强制覆盖 .dialog-bubble 的 bottom，防止高度被拉伸
      el.style.zIndex = '101';
      el.style.pointerEvents = 'none';
      this.stage.appendChild(el);

      // 淡出动画
      setTimeout(() => el.classList.add('dialog-bubble--fade-out'), duration - 500);
      setTimeout(() => el.remove(), duration);
    };

    if (shenjuText) makeOverlayBubble(shenjuText, SHENJIU_HEAD_X);
    if (yueqiText) makeOverlayBubble(yueqiText, YUEQI_HEAD_X);
  }

  /**
   * 隐藏互动叠加层图片并恢复两只宠物原本的身体。
   */
  hideOverlay(petA, petB) {
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
}

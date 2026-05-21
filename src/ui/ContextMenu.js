/**
 * ContextMenu — 用于宠物互动的自定义右键菜单。
 * 所有动态字符串均通过 window.t() 获取以支持多语言。
 */
class ContextMenu {
  constructor(nurtureSystem, getVisualScaleForPoint = null) {
    this.nurtureSystem = nurtureSystem;
    this.getVisualScaleForPoint = typeof getVisualScaleForPoint === 'function' ? getVisualScaleForPoint : null;
    this.menuEl = document.getElementById('context-menu');
    this.headerEl = document.getElementById('menu-header');
    this.currentPet = null;
    this.onStatusClick = null; // 状态按钮点击回调

    this.setupEvents();

    // 当鼠标悬停在菜单上时，保持禁用点击穿透
    this.menuEl.addEventListener('mouseenter', () => {
      window.electronAPI.setIgnoreMouseEvents(false, { leaseMs: 10000 });
    });
    this.menuEl.addEventListener('mouseleave', () => {
      // 仅在菜单隐藏时才重新启用点击穿透
      if (this.menuEl.classList.contains('hidden')) {
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });
    this.menuEl.addEventListener('mousemove', () => {
      if (!this.menuEl.classList.contains('hidden')) {
        window.electronAPI.setIgnoreMouseEvents(false, { leaseMs: 10000 });
      }
    });
  }

  setupEvents() {
    // 点击菜单项（使用 pointerdown 提升数位笔和触摸的响应速度，避免微小抖动丢失事件）
    this.menuEl.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('pointerdown', (e) => {
        // 使用 e.currentTarget 确保无论点击到哪个子元素，都能正确获取 dataset
        const action = e.currentTarget.dataset.action;
        if (e.button === 0 || e.pointerType === 'pen' || e.pointerType === 'touch') {
          this.handleAction(action);
          this.hide();
        }
      });
    });

    // 点击其他地方时关闭菜单
    document.addEventListener('mousedown', (e) => {
      if (!this.menuEl.contains(e.target)) {
        this.hide();
      }
    });
  }

  /**
   * 在指定位置显示特定宠物的右键菜单。
   */
  show(pet, x, y) {
    this.currentPet = pet;
    const nameKey = 'name' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
    const nicknameKey = 'nickname' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
    const name = window.t && window.t(nameKey) !== nameKey ? window.t(nameKey) : pet.name;
    const nickname = window.t && window.t(nicknameKey) !== nicknameKey ? window.t(nicknameKey) : pet.nickname;
    const displayName = name && nickname ? `${name}（${nickname}）` : nickname || name || '';

    this.headerEl.textContent = '';

    if (pet.image) {
      const icon = document.createElement('img');
      icon.className = 'status-pet-icon';
      icon.alt = '';
      icon.src = pet.image;
      this.headerEl.appendChild(icon);
    } else {
      const icon = document.createElement('span');
      icon.textContent = pet.emoji || '';
      this.headerEl.appendChild(icon);
    }

    this.headerEl.appendChild(document.createTextNode(` ${displayName}`));

    // 动态更新抚摸/关怀动作的菜单文本（语言敏感）
    const petActionEl = this.menuEl.querySelector('.menu-item[data-action="pet"]');
    if (petActionEl) {
      const key = pet.id === 'shenjiu' ? 'petShenjiu' : 'petYueqi';
      petActionEl.textContent = window.t ? window.t(key) : (pet.id === 'shenjiu' ? '🤚 七哥关怀' : '🤚 小九撒娇');
    }

    // 刷新其他带 data-i18n 属性的菜单项
    this.menuEl.querySelectorAll('[data-i18n]').forEach(el => {
      if (window.t) el.textContent = window.t(el.dataset.i18n);
    });

    // 更新禁用状态
    this.menuEl.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('disabled');
    });

    if (pet.isBusy()) {
      // 宠物忙碌时禁用除了查看状态外的所有动作
      this.menuEl.querySelectorAll('.menu-item[data-action]').forEach(item => {
        if (item.dataset.action !== 'status') {
          item.classList.add('disabled');
        }
      });
    }

    // 调整菜单位置 (确保它不会超出屏幕边界)
    const visualScale = this.getVisualScaleForPoint ? this.getVisualScaleForPoint(x, y) : 1;
    const menuWidth = 170 * visualScale;
    const menuHeight = 220 * visualScale;
    let posX = Math.min(x, window.innerWidth - menuWidth - 10);
    let posY = Math.min(y, window.innerHeight - menuHeight - 10);
    posX = Math.max(10, posX);
    posY = Math.max(10, posY);

    this.menuEl.style.setProperty('--display-scale', visualScale);
    this.menuEl.style.left = `${posX}px`;
    this.menuEl.style.top = `${posY}px`;
    this.menuEl.classList.remove('hidden');
  }

  hide() {
    this.menuEl.classList.add('hidden');
    this.currentPet = null;

    // 菜单关闭后，检查是否有其他交互面板开着（如状态面板）
    // 如果状态面板是开着的，则不要重新启用点击穿透，否则状态面板会无法点击
    const panelOpen = !document.getElementById('status-panel').classList.contains('hidden');
    if (!panelOpen) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  handleAction(action) {
    if (!this.currentPet) return;
    const pet = this.currentPet;
    const t = (key, fallback) => (window.t ? window.t(key) : fallback);

    switch (action) {
      case 'feed':
        if (this.nurtureSystem.feed(pet)) {
          const feedBubble = pet.id === 'yueqi'
            ? t('bubbleFeedYueqi', '（享用中…）')
            : t('bubbleFeedShenjiu', '…还行吧。');
          if (pet._showBubble) pet._showBubble(feedBubble);
          if (pet._spawnEffect) pet._spawnEffect('🍎', 'feed');
        }
        break;
      case 'meditate':
        if (this.nurtureSystem.meditate(pet)) {
          const meditateBubble = pet.id === 'yueqi'
            ? t('bubbleMeditateYueqi', '入定…')
            : t('bubbleMeditateShenjiu', '（闭目凝神）');
          if (pet._showBubble) pet._showBubble(meditateBubble);
          if (pet._spawnEffect) pet._spawnEffect('✨', 'meditate');
        }
        break;
      case 'pet':
        if (this.nurtureSystem.headPat(pet)) {
          const patBubble = pet.id === 'yueqi'
            ? t('bubblePetYueqi', '（宠溺地笑）')
            : t('bubblePetShenjiu', '…谁要你管。');
          if (pet._showBubble) pet._showBubble(patBubble);
          if (pet._spawnEffect) pet._spawnEffect('💕', 'pet');
        }
        break;
      case 'rest':
        if (this.nurtureSystem.rest(pet)) {
          const restBubble = pet.id === 'yueqi'
            ? t('bubbleRestYueqi', '稍作休整。')
            : t('bubbleRestShenjiu', '（假寐）');
          if (pet._showBubble) pet._showBubble(restBubble);
          if (pet._spawnEffect) pet._spawnEffect('💤', 'rest');
        } else {
          if (pet._showBubble) pet._showBubble(t('bubbleRestTooHungry', '太饿了，无法休息…'));
        }
        break;
      case 'status':
        if (this.onStatusClick) this.onStatusClick();
        break;
    }
  }
}

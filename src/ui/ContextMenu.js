/**
 * ContextMenu — 用于宠物互动的自定义右键菜单。
 */
class ContextMenu {
  constructor(nurtureSystem) {
    this.nurtureSystem = nurtureSystem;
    this.menuEl = document.getElementById('context-menu');
    this.headerEl = document.getElementById('menu-header');
    this.currentPet = null;
    this.onStatusClick = null; // 状态按钮点击回调

    this.setupEvents();

    // 当鼠标悬停在菜单上时，保持禁用点击穿透
    this.menuEl.addEventListener('mouseenter', () => {
      window.electronAPI.setIgnoreMouseEvents(false);
    });
    this.menuEl.addEventListener('mouseleave', () => {
      // 仅在菜单隐藏时才重新启用点击穿透
      if (this.menuEl.classList.contains('hidden')) {
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });
  }

  setupEvents() {
    // 点击菜单项
    this.menuEl.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.handleAction(action);
        this.hide();
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
    const icon = pet.image ? `<img src="${pet.image}" class="status-pet-icon">` : pet.emoji;
    this.headerEl.innerHTML = `${icon} ${pet.nickname}`;

    // 动态更新抚摸/关怀动作的菜单文本
    const petActionEl = this.menuEl.querySelector('.menu-item[data-action="pet"]');
    if (petActionEl) {
      petActionEl.textContent = pet.id === 'shenjiu' ? '🤚 七哥关怀' : '🤚 小九撒娇';
    }

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
    const menuWidth = 170;
    const menuHeight = 220;
    let posX = Math.min(x, window.innerWidth - menuWidth - 10);
    let posY = Math.min(y, window.innerHeight - menuHeight - 10);
    posX = Math.max(10, posX);
    posY = Math.max(10, posY);

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

    switch (action) {
      case 'feed':
        if (this.nurtureSystem.feed(pet)) {
          if (pet._showBubble) pet._showBubble(pet.id === 'yueqi' ? '（享用中…）' : '…还行吧。');
          if (pet._spawnEffect) pet._spawnEffect('🍎');
        }
        break;
      case 'meditate':
        if (this.nurtureSystem.meditate(pet)) {
          if (pet._showBubble) pet._showBubble(pet.id === 'yueqi' ? '入定…' : '（闭目凝神）');
          if (pet._spawnEffect) pet._spawnEffect('✨');
        }
        break;
      case 'pet':
        if (this.nurtureSystem.headPat(pet)) {
          if (pet._showBubble) pet._showBubble(pet.id === 'yueqi' ? '（宠溺地笑）' : '…谁要你管。');
          if (pet._spawnEffect) pet._spawnEffect('💕');
        }
        break;
      case 'rest':
        if (this.nurtureSystem.rest(pet)) {
          if (pet._showBubble) pet._showBubble(pet.id === 'yueqi' ? '稍作休整。' : '（假寐）');
          if (pet._spawnEffect) pet._spawnEffect('💤');
        } else {
          if (pet._showBubble) pet._showBubble('太饿了，无法休息…');
        }
        break;
      case 'status':
        if (this.onStatusClick) this.onStatusClick();
        break;
    }
  }
}

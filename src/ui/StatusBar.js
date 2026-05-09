/**
 * StatusBar — 在悬浮面板中显示宠物的各项属性。
 */
class StatusBar {
  constructor() {
    this.panelEl = document.getElementById('status-panel');
    this.contentEl = document.getElementById('status-content');
    this.closeBtn = document.getElementById('status-close');
    this.initialized = false;
    this.isDragging = false;
    this.uiElements = {}; // 存储要更新的 DOM 节点的引用

    this.closeBtn.addEventListener('click', () => this.hide());

    // 当鼠标悬停在状态面板上时，保持禁用点击穿透
    this.panelEl.addEventListener('mouseenter', () => {
      window.electronAPI.setIgnoreMouseEvents(false);
    });

    // 鼠标离开时，如果不在拖拽中，则重新启用点击穿透
    this.panelEl.addEventListener('mouseleave', () => {
      if (!this.isDragging) {
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    this.setupDrag();
  }

  setupDrag() {
    const header = this.panelEl.querySelector('.status-panel-header');
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.style.cursor = 'grab';

    header.addEventListener('mousedown', (e) => {
      if (e.target === this.closeBtn) return;
      e.preventDefault();
      this.isDragging = true;
      header.style.cursor = 'grabbing';

      startX = e.clientX;
      startY = e.clientY;

      const style = window.getComputedStyle(this.panelEl);
      initialLeft = parseFloat(style.left);
      initialTop = parseFloat(style.top);

      this.panelEl.style.transition = 'none'; // 拖拽时禁用过渡动画
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.panelEl.style.left = `${initialLeft + dx}px`;
      this.panelEl.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        header.style.cursor = 'grab';
        this.panelEl.style.transition = ''; // 恢复过渡动画
      }
    });
  }

  /**
   * 初始化 DOM 结构，仅执行一次
   */
  initDOM(petA, petB) {
    if (this.initialized) return;
    this.contentEl.innerHTML = this.renderPetStatsDOM(petA) + this.renderPetStatsDOM(petB);
    this.initialized = true;

    // 缓存所有需要更新的节点
    ['affection', 'hunger', 'qi', 'mood'].forEach(key => {
      [petA.id, petB.id].forEach(petId => {
        this.uiElements[`${petId}-${key}-bar`] = this.contentEl.querySelector(`#bar-${petId}-${key}`);
        this.uiElements[`${petId}-${key}-val`] = this.contentEl.querySelector(`#val-${petId}-${key}`);
      });
    });
  }

  /**
   * 显示包含当前属性状态的状态面板。
   */
  show(petA, petB) {
    this.initDOM(petA, petB);
    this.updateValues(petA);
    this.updateValues(petB);
    this.panelEl.classList.remove('hidden');
    // 显示面板时直接禁用点击穿透，以防通过托盘菜单打开时鼠标不在面板上
    window.electronAPI.setIgnoreMouseEvents(false);
  }

  hide() {
    this.panelEl.classList.add('hidden');
    // 重新启用点击穿透
    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
  }

  toggle(petA, petB) {
    if (this.panelEl.classList.contains('hidden')) {
      this.show(petA, petB);
    } else {
      this.hide();
    }
  }

  /**
   * 如果面板当前处于可见状态，则仅更新变动的数据。
   */
  update(petA, petB) {
    if (this.panelEl.classList.contains('hidden')) return;
    this.updateValues(petA);
    this.updateValues(petB);
  }

  /**
   * 仅更新特定的 DOM 节点属性，避免 innerHTML 导致的重排和内存分配
   */
  updateValues(pet) {
    if (!this.initialized) return;
    ['affection', 'hunger', 'qi', 'mood'].forEach(key => {
      const v = Math.round(pet.stats[key]);
      const barEl = this.uiElements[`${pet.id}-${key}-bar`];
      const valEl = this.uiElements[`${pet.id}-${key}-val`];
      
      if (barEl && barEl.style.width !== `${v}%`) {
        barEl.style.width = `${v}%`;
      }
      if (valEl && valEl.textContent !== String(v)) {
        valEl.textContent = v;
      }
    });
  }

  renderPetStatsDOM(pet) {
    const icon = pet.image ? `<img src="${pet.image}" class="status-pet-icon">` : pet.emoji;
    return `
      <div class="pet-status-block">
        <div class="pet-status-name">${icon} ${pet.nickname}（${pet.name}）</div>
        ${this.renderBarDOM(pet.id, '❤️ 好感', 'affection')}
        ${this.renderBarDOM(pet.id, '🍖 饱腹', 'hunger')}
        ${this.renderBarDOM(pet.id, '✨ 灵力', 'qi')}
        ${this.renderBarDOM(pet.id, '🧘🏻‍♂️ 心境', 'mood')}
      </div>
    `;
  }

  renderBarDOM(petId, label, key) {
    return `
      <div class="stat-row">
        <span class="stat-label">${label}</span>
        <div class="stat-bar">
          <div id="bar-${petId}-${key}" class="stat-bar-fill stat-bar-fill--${key}" style="width: 0%"></div>
        </div>
        <span id="val-${petId}-${key}" class="stat-value">0</span>
      </div>
    `;
  }
}

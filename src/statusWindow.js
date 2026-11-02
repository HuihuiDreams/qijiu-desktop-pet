const contentEl = document.getElementById('status-content');
const closeBtn = document.getElementById('status-close');


let lastRenderData = null;


function renderPetStats(pet) {
  const nameKey = 'name' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
  const nicknameKey = 'nickname' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
  const name = t(nameKey) !== nameKey ? t(nameKey) : pet.name;
  const nickname = t(nicknameKey) !== nicknameKey ? t(nicknameKey) : pet.nickname;
  const displayName = name && nickname ? `${name}（${nickname}）` : nickname || name || '';

  const STAT_LABELS = {
    affection: '❤️ ' + t('statAffection'),
    hunger: '🍖 ' + t('statHunger'),
    qi: '🧘🏻‍♂️ ' + t('statQi'),
    mood: '✨ ' + t('statMood'),
  };

  const block = document.createElement('article');
  block.className = 'pet-status-block';
  block.classList.add(`pet-status-block--${pet.id}`);
  block.dataset.petId = pet.id;

  const nameEl = document.createElement('div');
  nameEl.className = 'pet-status-name';

  if (pet.image) {
    const icon = document.createElement('img');
    icon.className = 'status-pet-icon';
    icon.alt = '';
    icon.onerror = () => {
      icon.remove();
      const span = document.createElement('span');
      span.textContent = pet.emoji || '';
      nameEl.insertBefore(span, nameEl.firstChild);
    };
    icon.src = pet.image;
    nameEl.appendChild(icon);
  } else {
    const icon = document.createElement('span');
    icon.textContent = pet.emoji || '';
    nameEl.appendChild(icon);
  }

  const nameText = document.createElement('span');
  nameText.className = 'pet-status-name-text';
  nameText.textContent = ` ${displayName}`;
  nameEl.appendChild(nameText);

  const calligraphyEl = document.createElement('span');
  calligraphyEl.className = 'pet-status-calligraphy';
  if (typeof calligraphyEl.setAttribute === 'function') {
    calligraphyEl.setAttribute('aria-hidden', 'true');
  }
  nameEl.appendChild(calligraphyEl);

  block.appendChild(nameEl);

  Object.entries(STAT_LABELS).forEach(([key, label]) => {
    const value = Math.max(0, Math.min(100, Number(pet.stats?.[key]) || 0));
    const row = document.createElement('div');
    row.className = 'stat-row';

    const labelId = `stat-label-${pet.id}-${key}`;
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.id = labelId;
    if (typeof labelEl.setAttribute === 'function') {
      labelEl.setAttribute('id', labelId);
    }
    labelEl.textContent = label;

    const bar = document.createElement('div');
    bar.className = 'stat-bar';
    if (typeof bar.setAttribute === 'function') {
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', `${value}`);
      bar.setAttribute('aria-labelledby', `stat-label-${pet.id}-${key}`);
    }

    const fill = document.createElement('div');
    fill.className = `stat-bar-fill stat-bar-fill--${key}`;
    fill.style.width = `${value}%`;
    bar.appendChild(fill);

    const valueEl = document.createElement('span');
    valueEl.className = 'stat-value';
    valueEl.textContent = String(value);

    row.append(labelEl, bar, valueEl);
    block.appendChild(row);
  });

  return block;
}

// Body padding (10px each side).
const BODY_PADDING = 20;

function findByClass(root, className) {
  if (!root) return null;
  if (typeof root.querySelector === 'function') {
    const el = root.querySelector(`.${className}`);
    if (el) return el;
  }
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      if (child.className?.includes?.(className) || child.classList?.contains?.(className)) {
        return child;
      }
      const nested = findByClass(child, className);
      if (nested) return nested;
    }
  }
  return null;
}

function updatePetStatsBlock(block, pet) {
  const nameKey = 'name' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
  const nicknameKey = 'nickname' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
  const name = typeof t === 'function' && t(nameKey) !== nameKey ? t(nameKey) : pet.name;
  const nickname = typeof t === 'function' && t(nicknameKey) !== nicknameKey ? t(nicknameKey) : pet.nickname;
  const displayName = name && nickname ? `${name}（${nickname}）` : nickname || name || '';

  const nameText = findByClass(block, 'pet-status-name-text');
  if (nameText && nameText.textContent !== ` ${displayName}`) {
    nameText.textContent = ` ${displayName}`;
  }

  const STAT_KEYS = ['affection', 'hunger', 'qi', 'mood'];
  const rows = (block.children || []).filter((c) => c.className?.includes?.('stat-row'));

  STAT_KEYS.forEach((key) => {
    const value = Math.max(0, Math.min(100, Number(pet.stats?.[key]) || 0));
    const fill = findByClass(block, `stat-bar-fill--${key}`);
    if (fill) {
      const targetWidth = `${value}%`;
      if (fill.style?.width !== targetWidth) {
        if (fill.style) {
          fill.style.width = targetWidth;
        }
      }
    }
    const targetRow = rows.find((r) => findByClass(r, `stat-bar-fill--${key}`));
    if (targetRow) {
      const bar = findByClass(targetRow, 'stat-bar');
      if (bar && typeof bar.setAttribute === 'function') {
        bar.setAttribute('aria-valuenow', `${value}`);
      }
      const valueEl = findByClass(targetRow, 'stat-value');
      if (valueEl && valueEl.textContent !== String(value)) {
        valueEl.textContent = String(value);
      }
    }
  });
}

function renderStatus(data, options = {}) {
  const forceRebuild = options.forceRebuild === true;
  lastRenderData = data;
  const pets = Array.isArray(data?.pets) ? data.pets : [];

  const existingBlocks = Array.from(contentEl.children || []);
  const existingIds = existingBlocks.map((b) => b.dataset?.petId).filter(Boolean);
  const newIds = pets.map((p) => p.id);
  const structureMatches = !forceRebuild
    && existingBlocks.length === pets.length
    && existingIds.length === newIds.length
    && existingIds.every((id, idx) => id === newIds[idx]);

  if (structureMatches) {
    // 结构相同时进行轻量就地更新，避免 DOM 销毁重排与重复 resize 窗口
    pets.forEach((pet, idx) => {
      updatePetStatsBlock(existingBlocks[idx], pet);
    });
    return;
  }

  // 初始加载、宠物列表变动或语言切换时全量重建结构并重新测量尺寸
  contentEl.replaceChildren(...pets.map(renderPetStats));
  requestAnimationFrame(() => {
    const panel = document.querySelector ? document.querySelector('.status-panel') : null;
    if (!panel) return;

    // Use scrollWidth (content's intrinsic width) rather than
    // getBoundingClientRect().width (which is constrained by the parent).
    //
    // The panel has `width: max-content` in CSS, so its size is driven by
    // content, not by the Electron window. scrollWidth therefore stays
    // stable across setContentSize() calls — no feedback loop.
    //
    // getBoundingClientRect().width on a `width:100%` panel would grow with
    // the window on every resize tick, causing infinite drift on Windows.
    const panelWidth = panel.scrollWidth;
    const panelHeight = panel.scrollHeight;
    window.electronAPI?.resizeStatusWindow?.({
      width: panelWidth + BODY_PADDING,
      height: panelHeight + BODY_PADDING,
    });
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    window.electronAPI?.closeStatusWindow?.();
  });
}

if (typeof window?.addEventListener === 'function') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault?.();
      window.electronAPI?.closeStatusWindow?.();
    }
  });
}

window.electronAPI.onStatusWindowData(renderStatus);

WindowI18n.init(() => { if (lastRenderData) { renderStatus(lastRenderData, { forceRebuild: true }); } });

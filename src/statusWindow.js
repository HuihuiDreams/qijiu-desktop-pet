const contentEl = document.getElementById('status-content');
const closeBtn = document.getElementById('status-close');
const tooltipEl = document.getElementById('status-tooltip');


let lastRenderData = null;
let activeTooltipTarget = null;
let hideTooltipTimeout = null;
let tooltipVersion = 0;

function translate(key, fallback = key) {
  if (typeof t === 'function') {
    return t(key);
  }
  return fallback;
}

function setAttr(el, name, value) {
  if (typeof el?.setAttribute === 'function') {
    el.setAttribute(name, String(value));
  }
}

function removeAttr(el, name) {
  if (typeof el?.removeAttribute === 'function') {
    el.removeAttribute(name);
  } else if (el?.attributes) {
    delete el.attributes[name];
  }
}

function isPopoverOpen(el) {
  if (!el) return false;
  try {
    return typeof el.matches === 'function' ? el.matches(':popover-open') : false;
  } catch (_) {
    return false;
  }
}

function showTooltip(target) {
  if (!tooltipEl || !target) return;
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = null;
  }

  const tooltipText = target.dataset?.tooltip || target.getAttribute?.('data-tooltip');
  if (!tooltipText) return;

  tooltipVersion++;
  if (activeTooltipTarget && activeTooltipTarget !== target && activeTooltipTarget.style) {
    activeTooltipTarget.style.anchorName = '';
  }
  activeTooltipTarget = target;
  if (target.style) {
    target.style.anchorName = '--status-tooltip-anchor';
  }
  tooltipEl.textContent = tooltipText;

  if (typeof tooltipEl.showPopover === 'function') {
    try {
      if (!isPopoverOpen(tooltipEl)) {
        tooltipEl.showPopover();
      }
    } catch (_) {}
  }
}

function hideTooltip(target) {
  if (!tooltipEl) return;
  if (target && target !== activeTooltipTarget) return;
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
    hideTooltipTimeout = null;
  }

  const closingTarget = activeTooltipTarget;
  const closingVersion = ++tooltipVersion;

  if (typeof tooltipEl.hidePopover === 'function') {
    try {
      if (isPopoverOpen(tooltipEl)) {
        tooltipEl.hidePopover();
      }
    } catch (_) {}
  }

  const clearAnchor = () => {
    if (closingVersion !== tooltipVersion) return;
    if (closingTarget?.style) closingTarget.style.anchorName = '';
    activeTooltipTarget = null;
  };

  if (typeof tooltipEl.getAnimations === 'function') {
    try {
      const animations = tooltipEl.getAnimations();
      if (animations?.length) {
        Promise.allSettled(animations.map((animation) => Promise.resolve(animation.finished))).then(clearAnchor);
        return;
      }
    } catch (_) {}
  }
  clearAnchor();
}

function scheduleHideTooltip(target, delay = 100) {
  if (hideTooltipTimeout) {
    clearTimeout(hideTooltipTimeout);
  }
  hideTooltipTimeout = setTimeout(() => {
    hideTooltip(target);
  }, delay);
}

function bindTooltipTarget(target) {
  if (!target || typeof target.addEventListener !== 'function') return;
  target.addEventListener('mouseenter', () => {
    showTooltip(target);
  });
  target.addEventListener('mouseleave', () => {
    scheduleHideTooltip(target, 100);
  });
  target.addEventListener('focusin', () => {
    showTooltip(target);
  });
  target.addEventListener('focusout', () => {
    hideTooltip(target);
  });
}

if (tooltipEl && typeof tooltipEl.addEventListener === 'function') {
  tooltipEl.addEventListener('mouseenter', () => {
    if (hideTooltipTimeout) {
      clearTimeout(hideTooltipTimeout);
      hideTooltipTimeout = null;
    }
  });
  tooltipEl.addEventListener('mouseleave', () => {
    scheduleHideTooltip(activeTooltipTarget, 100);
  });
}

function getStatTooltipText(petId, statKey) {
  const isShenjiu = petId === 'shenjiu';
  switch (statKey) {
    case 'affection':
      return isShenjiu
        ? translate('statTipAffectionShenjiu', '右键「🤚 恶魔偏宠」或双人互动提升')
        : translate('statTipAffectionYueqi', '右键「🤚 天使关怀」或双人互动提升');
    case 'hunger':
      return translate('statTipHunger', '右键「🥐 投喂美食」恢复');
    case 'qi':
      return isShenjiu
        ? translate('statTipQiShenjiu', '右键「📖 静心研读」持续充能，或「💤 闭目小憩」小幅恢复')
        : translate('statTipQiYueqi', '右键「🪴 照料植物」持续充能，或「💤 闭目小憩」小幅恢复');
    case 'mood':
      return isShenjiu
        ? translate('statTipMoodShenjiu', '右键「💤 闭目小憩」「🥐 投喂美食」或「🤚 恶魔偏宠」提升')
        : translate('statTipMoodYueqi', '右键「💤 闭目小憩」「🥐 投喂美食」或「🤚 天使关怀」提升');
    default:
      return '';
  }
}

function isStatLow(statKey, value) {
  if (statKey === 'hunger') return value < 25;
  if (statKey === 'qi') return value < 20;
  if (statKey === 'mood') return value < 25;
  return false;
}

function getPetDisplayName(pet) {
  const nameKey = 'name' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
  const nicknameKey = 'nickname' + pet.id.charAt(0).toUpperCase() + pet.id.slice(1);
  const name = typeof t === 'function' && t(nameKey) !== nameKey ? t(nameKey) : pet.name;
  const nickname = typeof t === 'function' && t(nicknameKey) !== nicknameKey ? t(nicknameKey) : pet.nickname;
  return name || nickname || '';
}

function hasClass(el, className) {
  if (!el || !className) return false;
  if (typeof el.classList?.contains === 'function' && el.classList.contains(className)) {
    return true;
  }
  return String(el.className || '').split(/\s+/).includes(className);
}

function renderPetStats(pet) {
  const displayName = getPetDisplayName(pet);

  const STAT_LABELS = {
    affection: '❤️ ' + translate('statAffection'),
    hunger: '🍖 ' + translate('statHunger'),
    qi: '✨ ' + translate('statQi'),
    mood: '☕ ' + translate('statMood'),
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

  block.appendChild(nameEl);

  Object.entries(STAT_LABELS).forEach(([key, label]) => {
    const value = Math.max(0, Math.min(100, Number(pet.stats?.[key]) || 0));
    const row = document.createElement('div');
    row.className = 'stat-row';
    if (row.dataset) {
      row.dataset.stat = key;
      row.dataset.tooltip = getStatTooltipText(pet.id, key);
    }
    setAttr(row, 'tabindex', '0');
    if (isStatLow(key, value)) {
      setAttr(row, 'data-low', 'true');
    }

    const labelId = `stat-label-${pet.id}-${key}`;
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.id = labelId;
    setAttr(labelEl, 'id', labelId);
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
    bindTooltipTarget(row);
    block.appendChild(row);
  });

  return block;
}

// Body padding (10px each side).
const BODY_PADDING = 20;

function findByClass(root, className) {
  if (!root || !className) return null;
  if (typeof root.querySelector === 'function') {
    try {
      const el = root.querySelector(`.${className}`);
      if (el) return el;
    } catch {
      // Fall through to manual traversal if querySelector fails
    }
  }
  const children = Array.from(root.children || []);
  for (const child of children) {
    if (hasClass(child, className)) {
      return child;
    }
    const nested = findByClass(child, className);
    if (nested) return nested;
  }
  return null;
}

function updatePetStatsBlock(block, pet) {
  const displayName = getPetDisplayName(pet);

  const nameText = findByClass(block, 'pet-status-name-text');
  if (nameText && nameText.textContent !== ` ${displayName}`) {
    nameText.textContent = ` ${displayName}`;
  }

  const iconEl = findByClass(block, 'status-pet-icon');
  if (iconEl && pet.image && iconEl.src !== pet.image) {
    iconEl.src = pet.image;
  }

  const STAT_KEYS = ['affection', 'hunger', 'qi', 'mood'];
  const rows = Array.from(block.children || []).filter((c) => hasClass(c, 'stat-row'));

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
      const nextTip = getStatTooltipText(pet.id, key);
      if (targetRow.dataset) {
        targetRow.dataset.tooltip = nextTip;
      }
      if (activeTooltipTarget === targetRow && tooltipEl && isPopoverOpen(tooltipEl)) {
        tooltipEl.textContent = nextTip;
      }
      if (isStatLow(key, value)) {
        setAttr(targetRow, 'data-low', 'true');
      } else {
        removeAttr(targetRow, 'data-low');
      }

      const bar = findByClass(targetRow, 'stat-bar');
      setAttr(bar, 'aria-valuenow', `${value}`);
      const valueEl = findByClass(targetRow, 'stat-value');
      if (valueEl && valueEl.textContent !== String(value)) {
        valueEl.textContent = String(value);
      }
    }
  });
}

function scheduleStatusWindowResize() {
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
    && existingIds.every((id, idx) => id === newIds[idx])
    && pets.every((pet, idx) => Boolean(findByClass(existingBlocks[idx], 'status-pet-icon')) === Boolean(pet.image));

  if (structureMatches) {
    // 结构相同时进行轻量就地更新，避免 DOM 销毁重排与重复 resize 窗口
    pets.forEach((pet, idx) => {
      updatePetStatsBlock(existingBlocks[idx], pet);
    });
    return;
  }

  hideTooltip();

  // 初始加载、宠物列表变动或语言切换时全量重建结构并重新测量尺寸
  contentEl.replaceChildren(...pets.map(renderPetStats));
  scheduleStatusWindowResize();
}

if (closeBtn && typeof closeBtn.addEventListener === 'function') {
  closeBtn.addEventListener('click', () => {
    window.electronAPI?.closeStatusWindow?.();
  });
}

if (typeof window?.addEventListener === 'function') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault?.();
      if (isPopoverOpen(tooltipEl)) {
        hideTooltip();
        return;
      }
      window.electronAPI?.closeStatusWindow?.();
    }
  });
}

window.electronAPI?.onStatusWindowData?.(renderStatus);

WindowI18n.init(() => { if (lastRenderData) { renderStatus(lastRenderData, { forceRebuild: true }); } });

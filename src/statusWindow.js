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


function renderStatus(data) {
  lastRenderData = data;
  const pets = Array.isArray(data?.pets) ? data.pets : [];
  contentEl.replaceChildren(...pets.map(renderPetStats));
  requestAnimationFrame(() => {
    const panel = document.querySelector('.status-panel');
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
    window.electronAPI.resizeStatusWindow({
      width: panelWidth + BODY_PADDING,
      height: panelHeight + BODY_PADDING,
    });
  });
}

closeBtn.addEventListener('click', () => {
  window.electronAPI.closeStatusWindow();
});

window.electronAPI.onStatusWindowData(renderStatus);

WindowI18n.init(() => { if (lastRenderData) { renderStatus(lastRenderData); } });

const contentEl = document.getElementById('status-content');
const closeBtn = document.getElementById('status-close');

const STAT_LABELS = {
  affection: '❤️ 好感',
  hunger: '🍖 饱腹',
  qi: '🧘🏻‍♂️ 灵力',
  mood: '✨ 心境',
};

function renderPetStats(pet) {
  const displayName = pet.name && pet.nickname ? `${pet.name}（${pet.nickname}）` : pet.nickname || pet.name || '';
  const block = document.createElement('article');
  block.className = 'pet-status-block';

  const nameEl = document.createElement('div');
  nameEl.className = 'pet-status-name';

  if (pet.image) {
    const icon = document.createElement('img');
    icon.className = 'status-pet-icon';
    icon.alt = '';
    icon.src = pet.image;
    nameEl.appendChild(icon);
  } else {
    const icon = document.createElement('span');
    icon.textContent = pet.emoji || '';
    nameEl.appendChild(icon);
  }

  nameEl.appendChild(document.createTextNode(` ${displayName}`));
  block.appendChild(nameEl);

  Object.entries(STAT_LABELS).forEach(([key, label]) => {
    const value = Math.max(0, Math.min(100, Number(pet.stats?.[key]) || 0));
    const row = document.createElement('div');
    row.className = 'stat-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;

    const bar = document.createElement('div');
    bar.className = 'stat-bar';

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

function renderStatus(data) {
  const pets = Array.isArray(data?.pets) ? data.pets : [];
  contentEl.replaceChildren(...pets.map(renderPetStats));
  requestAnimationFrame(() => {
    const panel = document.querySelector('.status-panel');
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    window.electronAPI.resizeStatusWindow({
      width: Math.ceil(rect.width + 20),
      height: Math.ceil(rect.height + 20),
    });
  });
}

closeBtn.addEventListener('click', () => {
  window.electronAPI.closeStatusWindow();
});

window.electronAPI.onStatusWindowData(renderStatus);

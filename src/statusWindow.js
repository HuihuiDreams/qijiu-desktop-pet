const contentEl = document.getElementById('status-content');
const closeBtn = document.getElementById('status-close');

const STAT_LABELS = {
  affection: '❤️ 好感',
  hunger: '🍖 饱腹',
  qi: '🧘🏻‍♂️ 灵力',
  mood: '✨ 心境',
};

function renderPetStats(pet) {
  const icon = pet.image
    ? `<img src="${pet.image}" class="status-pet-icon" alt="">`
    : `<span>${pet.emoji || ''}</span>`;

  const rows = Object.entries(STAT_LABELS).map(([key, label]) => {
    const value = Math.max(0, Math.min(100, Number(pet.stats?.[key]) || 0));
    return `
      <div class="stat-row">
        <span class="stat-label">${label}</span>
        <div class="stat-bar">
          <div class="stat-bar-fill stat-bar-fill--${key}" style="width: ${value}%"></div>
        </div>
        <span class="stat-value">${value}</span>
      </div>
    `;
  }).join('');

  const displayName = pet.name && pet.nickname ? `${pet.name}（${pet.nickname}）` : pet.nickname || pet.name || '';
  return `
    <article class="pet-status-block">
      <div class="pet-status-name">${icon} ${displayName}</div>
      ${rows}
    </article>
  `;
}

function renderStatus(data) {
  const pets = Array.isArray(data?.pets) ? data.pets : [];
  contentEl.innerHTML = pets.map(renderPetStats).join('');
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

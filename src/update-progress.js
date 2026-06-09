const wrap = document.querySelector('.wrap');
const titleEl = document.getElementById('title');
const messageEl = document.getElementById('message');
const fillEl = document.getElementById('fill');
const barEl = document.querySelector('.bar');
const metaEl = document.getElementById('meta');

function normalizeMode(mode) {
  return mode === 'checking' ? 'checking' : 'downloading';
}

function renderProgress(payload) {
  const mode = normalizeMode(payload?.mode);
  const percent = Math.max(0, Math.min(100, Number(payload?.percent) || 0));

  wrap.className = `wrap ${mode}`;
  titleEl.textContent = payload?.title || '';
  messageEl.textContent = payload?.message || '';
  fillEl.style.width = mode === 'checking' ? '38%' : `${percent}%`;
  barEl.setAttribute('aria-valuenow', Math.round(percent));
  metaEl.textContent = `${Math.round(percent)}%`;
}

window.updateProgressAPI.onProgress(renderProgress);

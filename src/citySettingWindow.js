/**
 * citySettingWindow.js — 城市设置窗口渲染进程脚本
 */

const inputEl = document.getElementById('city-input');
const confirmBtn = document.getElementById('city-confirm');
const closeBtn = document.getElementById('city-close');
const currentValueEl = document.getElementById('city-current-value');
const statusEl = document.getElementById('city-status');




function setStatus(text, className) {
  statusEl.textContent = text;
  statusEl.className = 'city-status';
  if (className) {
    statusEl.classList.add(className);
  }
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = 'city-status';
}

let isLoading = false;

function setLoading(loading) {
  isLoading = loading;
  if (confirmBtn) confirmBtn.disabled = loading;
  if (inputEl) inputEl.disabled = loading;
}

async function loadCurrentCity() {
  try {
    const result = await window.electronAPI.getCitySettings();
    const city = result?.city;
    if (city) {
      currentValueEl.textContent = city;
      currentValueEl.removeAttribute('data-i18n');
    } else {
      currentValueEl.textContent = t('citySettingNone');
      currentValueEl.setAttribute('data-i18n', 'citySettingNone');
    }
  } catch (err) {
    console.error('Failed to load city settings:', err);
  }
}

async function handleConfirm() {
  const cityName = inputEl?.value?.trim() || '';
  if (!cityName) {
    if (typeof inputEl?.focus === 'function') inputEl.focus();
    return;
  }

  setLoading(true);
  inputEl?.setAttribute?.('aria-invalid', 'false');
  setStatus(t('citySettingSearching'), 'city-status--searching');

  try {
    const result = await window.electronAPI.setCityName(cityName);

    if (result?.success) {
      const displayCity = result.city || cityName;
      const successMsg = t('citySettingSuccess');
      const formatted = typeof successMsg === 'function'
        ? successMsg(displayCity)
        : successMsg.replace('{city}', displayCity);
      setStatus(formatted, 'city-status--success');

      currentValueEl.textContent = displayCity;
      currentValueEl.removeAttribute('data-i18n');
      if (inputEl) inputEl.value = '';

      // Auto-close after a short delay
      setTimeout(() => {
        window.electronAPI.closeCitySettingWindow();
      }, 1200);
    } else {
      inputEl?.setAttribute?.('aria-invalid', 'true');
      setStatus(t('citySettingError'), 'city-status--error');
      setLoading(false);
      if (typeof inputEl?.focus === 'function') inputEl.focus();
    }
  } catch (err) {
    console.error('Failed to set city:', err);
    inputEl?.setAttribute?.('aria-invalid', 'true');
    setStatus(t('citySettingError'), 'city-status--error');
    setLoading(false);
    if (typeof inputEl?.focus === 'function') inputEl.focus();
  }
}

// Event listeners
if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);

if (inputEl) {
  inputEl.addEventListener('input', () => {
    inputEl.setAttribute?.('aria-invalid', 'false');
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault?.();
      handleConfirm();
    }
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    window.electronAPI.closeCitySettingWindow();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isLoading) return;
    e.preventDefault?.();
    window.electronAPI.closeCitySettingWindow();
  }
});

// Init
if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(() => {
    if (typeof inputEl?.focus === 'function') inputEl.focus();
  });
} else if (typeof inputEl?.focus === 'function') {
  inputEl.focus();
}

if (typeof WindowI18n !== 'undefined' && WindowI18n.init) {
  WindowI18n.init(loadCurrentCity);
}

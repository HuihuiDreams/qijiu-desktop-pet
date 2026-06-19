/**
 * citySettingWindow.js — 城市设置窗口渲染进程脚本
 */

const inputEl = document.getElementById('city-input');
const confirmBtn = document.getElementById('city-confirm');
const closeBtn = document.getElementById('city-close');
const currentValueEl = document.getElementById('city-current-value');
const statusEl = document.getElementById('city-status');

let currentLocale = 'zh';

function t(key) {
  if (typeof I18N === 'undefined') return key;
  return (I18N[currentLocale]?.ui?.[key]) ?? (I18N.zh?.ui?.[key]) ?? key;
}

function updateI18nElements() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const translated = t(el.dataset.i18nTitle);
    el.title = translated;
    el.setAttribute('aria-label', translated);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

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

function setLoading(loading) {
  confirmBtn.disabled = loading;
  inputEl.disabled = loading;
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
  const cityName = inputEl.value.trim();
  if (!cityName) {
    inputEl.focus();
    return;
  }

  setLoading(true);
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
      inputEl.value = '';

      // Auto-close after a short delay
      setTimeout(() => {
        window.electronAPI.closeCitySettingWindow();
      }, 1200);
    } else {
      setStatus(t('citySettingError'), 'city-status--error');
      setLoading(false);
      inputEl.focus();
    }
  } catch (err) {
    console.error('Failed to set city:', err);
    setStatus(t('citySettingError'), 'city-status--error');
    setLoading(false);
    inputEl.focus();
  }
}

// Event listeners
confirmBtn.addEventListener('click', handleConfirm);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleConfirm();
  }
});

closeBtn.addEventListener('click', () => {
  window.electronAPI.closeCitySettingWindow();
});

window.electronAPI.onLocaleChange?.((locale) => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  updateI18nElements();
  loadCurrentCity();
});

// Init
window.electronAPI.getLocale().then(locale => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  updateI18nElements();
  loadCurrentCity();
  inputEl.focus();
});

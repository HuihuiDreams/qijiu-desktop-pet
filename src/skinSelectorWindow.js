const galleryEl = document.getElementById('skin-gallery');
const closeBtn = document.getElementById('skin-selector-close');
const statusEl = document.getElementById('skin-selector-status');

let currentLocale = 'zh';
let lastItems = [];
let selectionInFlight = false;

function t(key) {
  if (typeof I18N === 'undefined') return key;
  return (I18N[currentLocale]?.ui?.[key]) ?? (I18N.zh?.ui?.[key]) ?? key;
}

function updateI18nElements() {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const translated = t(element.dataset.i18nTitle);
    element.title = translated;
    element.setAttribute('aria-label', translated);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });
}

function setStatus(message = '') {
  statusEl.textContent = message;
}

function setLoading(loading) {
  selectionInFlight = loading;
  galleryEl.querySelectorAll('.skin-card').forEach((card) => {
    card.disabled = loading;
  });
}

async function selectSkin(skinId) {
  if (selectionInFlight) return;

  setLoading(true);
  setStatus('');
  try {
    const result = await window.skinSelectorAPI.selectSkin(skinId);
    if (!result?.success) {
      setStatus(t('skinSelectorError'));
      setLoading(false);
      return;
    }
    await window.skinSelectorAPI.close();
  } catch (error) {
    console.error('Failed to select skin:', error);
    setStatus(t('skinSelectorError'));
    setLoading(false);
  }
}

function renderGallery(items, { resetSelection = true } = {}) {
  if (resetSelection) selectionInFlight = false;
  lastItems = Array.isArray(items) ? items : [];
  galleryEl.replaceChildren();
  setStatus('');

  if (lastItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'skin-gallery-empty';
    empty.textContent = t('skinSelectorEmpty');
    galleryEl.appendChild(empty);
    return;
  }

  const cards = lastItems.map((item) => {
    const card = document.createElement('button');
    card.className = 'skin-card';
    card.type = 'button';
    card.dataset.skinId = item.id;
    card.setAttribute('aria-pressed', String(item.isCurrent));
    card.setAttribute('aria-label', item.isCurrent
      ? `${item.displayName} — ${t('skinSelectorCurrent')}`
      : item.displayName);

    const preview = document.createElement('img');
    preview.className = 'skin-card-preview';
    preview.alt = '';
    preview.src = item.previewUrl;

    const name = document.createElement('span');
    name.className = 'skin-card-name';
    name.textContent = item.displayName;
    card.append(preview, name);

    if (item.isCurrent) {
      const current = document.createElement('span');
      current.className = 'skin-card-current';
      current.textContent = t('skinSelectorCurrent');
      card.appendChild(current);
    }

    card.addEventListener('click', () => selectSkin(item.id));
    return card;
  });

  galleryEl.append(...cards);
}

closeBtn.addEventListener('click', () => {
  window.skinSelectorAPI.close();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !selectionInFlight) {
    window.skinSelectorAPI.close();
  }
});

window.skinSelectorAPI.onData(renderGallery);
window.skinSelectorAPI.onLocaleChange((locale) => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  updateI18nElements();
  renderGallery(lastItems, { resetSelection: false });
});

window.skinSelectorAPI.getLocale().then((locale) => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  updateI18nElements();
  return window.skinSelectorAPI.getSkinGalleryItems();
}).then(renderGallery).catch((error) => {
  console.error('Failed to load skin gallery:', error);
  setStatus(t('skinSelectorError'));
});

requestAnimationFrame(() => closeBtn.focus());

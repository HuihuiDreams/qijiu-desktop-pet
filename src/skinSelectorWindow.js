const galleryEl = document.getElementById('skin-gallery');
const closeBtn = document.getElementById('skin-selector-close');
const confirmBtn = document.getElementById('skin-selector-confirm');
const cancelBtn = document.getElementById('skin-selector-cancel');
const statusEl = document.getElementById('skin-selector-status');

let lastItems = [];
let previewedSkinId = null;
let previewInFlight = false;



function setStatus(message = '') {
  statusEl.textContent = message;
}

function setLoading(loading) {
  previewInFlight = loading;
  galleryEl.querySelectorAll('.skin-card').forEach((card) => {
    card.disabled = loading;
  });
}

function updateSelectedCard(skinId) {
  galleryEl.querySelectorAll('.skin-card').forEach((card) => {
    const isSelected = card.dataset.skinId === skinId;
    card.setAttribute('aria-pressed', String(isSelected));
  });
}

async function previewSkin(skinId) {
  if (previewInFlight) return;
  if (skinId === previewedSkinId) return;

  setLoading(true);
  setStatus('');
  try {
    const result = await window.skinSelectorAPI.previewSkin(skinId);
    if (!result?.success) {
      setStatus(t('skinSelectorError'));
      setLoading(false);
      return;
    }
    previewedSkinId = skinId;
    updateSelectedCard(skinId);
  } catch (error) {
    console.error('Failed to preview skin:', error);
    setStatus(t('skinSelectorError'));
  } finally {
    setLoading(false);
  }
}

async function confirmSelection() {
  if (previewInFlight) return;
  try {
    await window.skinSelectorAPI.confirmSkin();
  } catch (error) {
    console.error('Failed to confirm skin:', error);
  }
}

async function cancelSelection() {
  if (previewInFlight) return;
  try {
    await window.skinSelectorAPI.cancelSkin();
  } catch (error) {
    console.error('Failed to cancel skin:', error);
  }
}

function renderGallery(items, { resetSelection = true } = {}) {
  if (resetSelection) previewInFlight = false;
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

  // Track which skin is initially current
  if (resetSelection) {
    const currentItem = lastItems.find((item) => item.isCurrent);
    previewedSkinId = currentItem ? currentItem.id : null;
  }

  const cards = lastItems.map((item) => {
    const card = document.createElement('button');
    card.className = 'skin-card';
    card.type = 'button';
    card.dataset.skinId = item.id;
    const isSelected = item.id === previewedSkinId;
    card.setAttribute('aria-pressed', String(isSelected));
    card.setAttribute('aria-label', item.isCurrent
      ? `${item.skinLabel} — ${t('skinSelectorCurrent')}`
      : item.skinLabel);

    const preview = document.createElement('img');
    preview.className = 'skin-card-preview';
    preview.alt = '';
    preview.src = item.previewUrl;

    const name = document.createElement('span');
    name.className = 'skin-card-name';
    name.textContent = item.skinLabel;
    card.append(preview, name);

    if (item.artistName) {
      const artist = document.createElement('span');
      artist.className = 'skin-card-artist';
      artist.textContent = `🎨 ${item.artistName}`;
      card.appendChild(artist);
    }

    if (item.isCurrent) {
      const current = document.createElement('span');
      current.className = 'skin-card-current';
      current.textContent = t('skinSelectorCurrent');
      card.appendChild(current);
    }

    card.addEventListener('click', () => previewSkin(item.id));
    return card;
  });

  galleryEl.append(...cards);
}

confirmBtn.addEventListener('click', confirmSelection);
cancelBtn.addEventListener('click', cancelSelection);

closeBtn.addEventListener('click', cancelSelection);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !previewInFlight) {
    cancelSelection();
  }
});

window.skinSelectorAPI.onData((items, options) => renderGallery(items, options));
window.skinSelectorAPI.onLocaleChange((locale) => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  document.documentElement.setAttribute("data-locale", locale);
  updateI18nElements();
  renderGallery(lastItems, { resetSelection: false });
});

window.skinSelectorAPI.getLocale().then((locale) => {
  currentLocale = locale;
  document.documentElement.lang = locale;
  document.documentElement.setAttribute("data-locale", locale);
  updateI18nElements();
  return window.skinSelectorAPI.getSkinGalleryItems();
}).then(renderGallery).catch((error) => {
  console.error('Failed to load skin gallery:', error);
  setStatus(t('skinSelectorError'));
});

requestAnimationFrame(() => closeBtn.focus());

WindowI18n.init((locale) => { renderGallery(lastItems, { resetSelection: false }) });

const galleryEl = document.getElementById('skin-gallery');
const closeBtn = document.getElementById('skin-selector-close');
const confirmBtn = document.getElementById('skin-selector-confirm');
const cancelBtn = document.getElementById('skin-selector-cancel');
const statusEl = document.getElementById('skin-selector-status');

let lastItems = [];
let previewedSkinId = null;
let previewInFlight = false;
let isFirstDataReceived = true;

function setStatus(message = '') {
  statusEl.textContent = message;
}

function setLoading(loading, targetSkinId = null) {
  previewInFlight = loading;
  if (confirmBtn) confirmBtn.disabled = loading;

  const targetCard = targetSkinId
    ? galleryEl.querySelector(`.skin-card[data-skin-id="${targetSkinId}"]`)
    : null;

  galleryEl.querySelectorAll('.skin-card').forEach((card) => {
    card.disabled = loading;
    if (loading && targetCard && card === targetCard) {
      card.classList?.add('skin-card--loading');
    } else if (!loading) {
      card.classList?.remove('skin-card--loading');
    }
  });

  if (!loading && targetCard) {
    if (typeof targetCard.focus === 'function') {
      targetCard.focus();
    }
  }
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

  setLoading(true, skinId);
  setStatus('');
  try {
    const result = await window.skinSelectorAPI.previewSkin(skinId);
    if (!result?.success) {
      setStatus(t('skinSelectorError'));
      return;
    }
    previewedSkinId = skinId;
    updateSelectedCard(skinId);
  } catch (error) {
    console.error('Failed to preview skin:', error);
    setStatus(t('skinSelectorError'));
  } finally {
    setLoading(false, skinId);
  }
}

async function confirmSelection() {
  if (previewInFlight) return;
  try {
    const result = await window.skinSelectorAPI.confirmSkin();
    if (!result?.success) setStatus(t('skinSelectorError'));
  } catch (error) {
    console.error('Failed to confirm skin:', error);
    setStatus(t('skinSelectorError'));
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

  let focusedSkinId = null;
  if (typeof document !== 'undefined') {
    const activeCard = document.activeElement?.closest?.('.skin-card');
    focusedSkinId = activeCard?.dataset?.skinId || null;
  }

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

  if (isFirstDataReceived) {
    isFirstDataReceived = false;
    const pressedCard = galleryEl.querySelector('.skin-card[aria-pressed="true"]');
    if (typeof pressedCard?.focus === 'function') {
      pressedCard.focus();
    }
  } else if (focusedSkinId) {
    const restoredCard = galleryEl.querySelector(`.skin-card[data-skin-id="${focusedSkinId}"]`);
    if (typeof restoredCard?.focus === 'function') {
      restoredCard.focus();
    }
  }
}

confirmBtn.addEventListener('click', confirmSelection);
cancelBtn.addEventListener('click', cancelSelection);

closeBtn.addEventListener('click', cancelSelection);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !previewInFlight) {
    cancelSelection();
    return;
  }

  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    const currentCard = document.activeElement?.closest?.('.skin-card');
    if (!currentCard) return;

    const cards = Array.from(galleryEl.querySelectorAll('.skin-card'));
    const currentIndex = cards.indexOf(currentCard);
    if (currentIndex === -1 || cards.length === 0) return;

    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    if (event.key === 'ArrowLeft') {
      const nextIndex = (currentIndex - 1 + cards.length) % cards.length;
      if (typeof cards[nextIndex]?.focus === 'function') cards[nextIndex].focus();
    } else if (event.key === 'ArrowRight') {
      const nextIndex = (currentIndex + 1) % cards.length;
      if (typeof cards[nextIndex]?.focus === 'function') cards[nextIndex].focus();
    } else if (event.key === 'Home') {
      if (typeof cards[0]?.focus === 'function') cards[0].focus();
    } else if (event.key === 'End') {
      if (typeof cards[cards.length - 1]?.focus === 'function') cards[cards.length - 1].focus();
    }
  }
});

window.skinSelectorAPI.onData((items, options) => renderGallery(items, options));

requestAnimationFrame(() => closeBtn.focus());

WindowI18n.init((locale) => { renderGallery(lastItems, { resetSelection: false }); });

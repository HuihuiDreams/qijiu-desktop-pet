(() => {
  const sliderEl = document.getElementById('scale-slider');
  const valueEl = document.getElementById('scale-current-value');
  const resetBtn = document.getElementById('scale-reset');
  const closeBtn = document.getElementById('scale-close');
  const cancelBtn = document.getElementById('scale-cancel');
  const confirmBtn = document.getElementById('scale-confirm');

  let defaultPercent = 100;

  function updateDisplay(percent) {
    if (valueEl) valueEl.textContent = `${percent}%`;
    if (sliderEl) {
      sliderEl.value = percent;
      sliderEl.setAttribute?.('aria-valuetext', `${percent}%`);
    }
  }

  async function loadSettings() {
    if (!window.electronAPI?.getPetScaleSettings) return;
    try {
      const settings = await window.electronAPI.getPetScaleSettings();
      if (!settings) return;
      if (Number.isFinite(settings.defaultPercent)) {
        defaultPercent = settings.defaultPercent;
      }
      if (sliderEl) {
        sliderEl.min = String(settings.minPercent);
        sliderEl.max = String(settings.maxPercent);
        sliderEl.step = String(settings.stepPercent);
      }
      updateDisplay(settings.currentPercent);
    } catch (err) {
      console.error('Failed to load pet scale settings:', err);
    }
  }

  function handlePreview(percent) {
    if (valueEl) valueEl.textContent = `${percent}%`;
    sliderEl?.setAttribute?.('aria-valuetext', `${percent}%`);
    window.electronAPI?.previewPetScale?.(percent);
  }

  function handleConfirm() {
    window.electronAPI?.confirmPetScale?.();
  }

  function handleCancel() {
    window.electronAPI?.cancelPetScale?.();
  }

  function handleReset() {
    updateDisplay(defaultPercent);
    window.electronAPI?.previewPetScale?.(defaultPercent);
  }

  if (sliderEl) {
    sliderEl.addEventListener('input', (e) => {
      handlePreview(Number(e.target.value));
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', handleReset);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', handleCancel);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirm);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault?.();
      handleCancel();
    } else if (e.key === 'Enter' && !e.target?.closest?.('button')) {
      e.preventDefault?.();
      handleConfirm();
    }
  });

  if (typeof WindowI18n !== 'undefined' && WindowI18n.init) {
    WindowI18n.init();
  }

  loadSettings();

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (typeof sliderEl?.focus === 'function') {
        sliderEl.focus();
      }
    });
  } else if (typeof sliderEl?.focus === 'function') {
    sliderEl.focus();
  }
})();

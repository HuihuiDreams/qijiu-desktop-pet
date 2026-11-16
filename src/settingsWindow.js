(() => {
  const TAB_ORDER = ['appearance', 'companion', 'system'];

  const closeBtn = document.getElementById('settings-close');
  const tabButtons = {
    appearance: document.getElementById('tab-appearance'),
    companion: document.getElementById('tab-companion'),
    system: document.getElementById('tab-system'),
  };
  const tabPanels = {
    appearance: document.getElementById('panel-appearance'),
    companion: document.getElementById('panel-companion'),
    system: document.getElementById('panel-system'),
  };
  const tabListEl = document.getElementById('settings-tablist');

  // Tab 1: Appearance & Interaction
  const scaleSliderEl = document.getElementById('scale-slider');
  const scaleValueEl = document.getElementById('scale-current-value');
  const scaleResetBtn = document.getElementById('scale-reset');
  const skinNameEl = document.getElementById('settings-current-skin-name');
  const openSkinBtn = document.getElementById('settings-open-skin-button');
  const windowAwarenessSwitch = document.getElementById('window-awareness-switch');
  const windowAwarenessHintEl = document.getElementById('window-awareness-hint');

  // Tab 2: Companion & Guard
  const weatherSwitch = document.getElementById('weather-sync-switch');
  const cityCurrentValueEl = document.getElementById('city-current-value');
  const cityInputEl = document.getElementById('city-input');
  const cityConfirmBtn = document.getElementById('city-confirm');
  const cityStatusEl = document.getElementById('city-status');
  const breakReminderSwitch = document.getElementById('break-reminder-switch');
  const breakIntervalsGroupEl = document.getElementById('break-reminder-intervals-group');
  const breakIntervalsContainer = document.getElementById('break-reminder-intervals');
  const screensaverSwitch = document.getElementById('screensaver-switch');
  const screensaverThresholdsGroupEl = document.getElementById('screensaver-thresholds-group');
  const screensaverThresholdsContainer = document.getElementById('screensaver-thresholds');

  // Tab 3: System Preferences
  const localeButtonsContainer = document.getElementById('locale-buttons');
  const autoLaunchSwitch = document.getElementById('auto-launch-switch');
  const autoLaunchStatusEl = document.getElementById('auto-launch-status');

  let activeTab = 'appearance';
  let latestSnapshot = null;
  let isCityLoading = false;
  let cityStatusState = null; // { key, city, className }
  let autoLaunchStatusState = null; // { key, className }
  let hasScheduledInitialFocus = false;

  function translate(key) {
    if (typeof window.t === 'function') {
      return window.t(key);
    }
    if (typeof t === 'function') {
      return t(key);
    }
    return key;
  }

  function getChildrenArray(container) {
    if (!container) return [];
    if (typeof container.querySelectorAll === 'function') {
      return Array.from(container.querySelectorAll('button'));
    }
    return Array.isArray(container.children) ? container.children : [];
  }

  function setSwitchState(switchEl, checked, disabled = false) {
    if (!switchEl) return;
    switchEl.setAttribute?.('aria-checked', String(Boolean(checked)));
    switchEl.disabled = Boolean(disabled);
  }

  function renderCityStatus() {
    if (!cityStatusEl) return;
    if (!cityStatusState) {
      cityStatusEl.textContent = '';
      cityStatusEl.className = 'city-status';
      return;
    }
    let text = translate(cityStatusState.key);
    if (cityStatusState.city) {
      text = text.replace('{city}', cityStatusState.city);
    }
    cityStatusEl.textContent = text;
    cityStatusEl.className = 'city-status';
    if (cityStatusState.className) {
      cityStatusEl.classList?.add?.(cityStatusState.className);
    }
  }

  function setCityStatus(key, className, city = null) {
    cityStatusState = key ? { key, className, city } : null;
    renderCityStatus();
  }

  function renderAutoLaunchStatus() {
    if (!autoLaunchStatusEl) return;
    if (!autoLaunchStatusState) {
      autoLaunchStatusEl.textContent = '';
      autoLaunchStatusEl.className = 'settings-inline-status';
      return;
    }
    autoLaunchStatusEl.textContent = translate(autoLaunchStatusState.key);
    autoLaunchStatusEl.className = 'settings-inline-status';
    if (autoLaunchStatusState.className) {
      autoLaunchStatusEl.classList?.add?.(autoLaunchStatusState.className);
    }
  }

  function setAutoLaunchStatus(key, className) {
    autoLaunchStatusState = key ? { key, className } : null;
    renderAutoLaunchStatus();
  }

  function setCityLoading(loading) {
    isCityLoading = Boolean(loading);
    if (cityConfirmBtn) cityConfirmBtn.disabled = isCityLoading;
    if (cityInputEl) cityInputEl.disabled = isCityLoading;
  }

  function activateTab(tabId, { focusTab = false } = {}) {
    activeTab = TAB_ORDER.includes(tabId) ? tabId : 'appearance';
    for (const key of TAB_ORDER) {
      const isSelected = key === activeTab;
      const btn = tabButtons[key];
      const panel = tabPanels[key];
      if (btn) {
        btn.setAttribute?.('aria-selected', String(isSelected));
        btn.setAttribute?.('tabindex', isSelected ? '0' : '-1');
        if (btn.classList?.toggle) {
          btn.classList.toggle('is-active', isSelected);
        }
      }
      if (panel) {
        panel.hidden = !isSelected;
        if (isSelected) {
          panel.removeAttribute?.('hidden');
        } else {
          panel.setAttribute?.('hidden', '');
        }
      }
    }
    if (focusTab && typeof tabButtons[activeTab]?.focus === 'function') {
      tabButtons[activeTab].focus();
    }
  }

  function updateScaleDisplay(percent) {
    if (scaleValueEl) {
      scaleValueEl.textContent = `${percent}%`;
    }
    if (scaleSliderEl) {
      scaleSliderEl.value = String(percent);
      scaleSliderEl.setAttribute?.('aria-valuetext', `${percent}%`);
    }
  }

  function applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    latestSnapshot = snapshot;

    // Appearance: Pet Scale
    if (snapshot.petScale) {
      if (scaleSliderEl) {
        scaleSliderEl.min = String(snapshot.petScale.minPercent);
        scaleSliderEl.max = String(snapshot.petScale.maxPercent);
        scaleSliderEl.step = String(snapshot.petScale.stepPercent);
      }
      updateScaleDisplay(snapshot.petScale.currentPercent);
    }

    // Appearance: Skin card
    if (skinNameEl && snapshot.skin) {
      skinNameEl.textContent = snapshot.skin.displayName || snapshot.skin.id || '';
    }

    // Appearance: Window Awareness
    if (snapshot.windowAwareness) {
      const supported = snapshot.windowAwareness.supported !== false;
      setSwitchState(windowAwarenessSwitch, snapshot.windowAwareness.enabled, !supported);
      if (windowAwarenessHintEl) {
        const hintKey = supported ? 'settingsWindowAwarenessHint' : 'settingsWindowAwarenessUnavailable';
        windowAwarenessHintEl.setAttribute?.('data-i18n', hintKey);
        windowAwarenessHintEl.textContent = translate(hintKey);
      }
    }

    // Companion: Weather Sync + City
    if (snapshot.weather) {
      setSwitchState(weatherSwitch, snapshot.weather.enabled, false);
      if (cityCurrentValueEl) {
        if (snapshot.weather.city) {
          cityCurrentValueEl.textContent = snapshot.weather.city;
          cityCurrentValueEl.removeAttribute?.('data-i18n');
        } else {
          cityCurrentValueEl.textContent = translate('citySettingNone');
          cityCurrentValueEl.setAttribute?.('data-i18n', 'citySettingNone');
        }
      }
    }

    // Companion: Break Reminder
    if (snapshot.breakReminder) {
      const enabled = Boolean(snapshot.breakReminder.enabled);
      setSwitchState(breakReminderSwitch, enabled, false);
      breakIntervalsGroupEl?.setAttribute?.('aria-disabled', String(!enabled));
      for (const btn of getChildrenArray(breakIntervalsContainer)) {
        btn.disabled = !enabled;
        const selected = Number(btn.dataset?.interval) === Number(snapshot.breakReminder.intervalMinutes);
        btn.setAttribute?.('aria-pressed', String(selected));
      }
    }

    // Companion: Sweet Screensaver
    if (snapshot.screensaver) {
      const enabled = Boolean(snapshot.screensaver.enabled);
      setSwitchState(screensaverSwitch, enabled, false);
      screensaverThresholdsGroupEl?.setAttribute?.('aria-disabled', String(!enabled));
      for (const btn of getChildrenArray(screensaverThresholdsContainer)) {
        btn.disabled = !enabled;
        const selected = Number(btn.dataset?.threshold) === Number(snapshot.screensaver.idleThresholdMinutes);
        btn.setAttribute?.('aria-pressed', String(selected));
      }
    }

    // System: Language
    for (const btn of getChildrenArray(localeButtonsContainer)) {
      const selected = btn.dataset?.locale === snapshot.locale;
      btn.setAttribute?.('aria-pressed', String(selected));
    }

    // System: Auto Launch
    if (snapshot.autoLaunch) {
      setSwitchState(autoLaunchSwitch, snapshot.autoLaunch.enabled, false);
      const pendingApproval = Boolean(
        snapshot.autoLaunchPendingApproval || snapshot.autoLaunch.pendingApproval,
      );
      if (pendingApproval) {
        setAutoLaunchStatus('settingsAutoLaunchPendingApproval', 'settings-inline-status--warning');
      } else if (autoLaunchStatusState?.key === 'settingsAutoLaunchPendingApproval') {
        setAutoLaunchStatus(null, null);
      }
    }
  }

  async function loadSnapshot() {
    if (!window.electronAPI?.getSnapshot) return;
    try {
      const snapshot = await window.electronAPI.getSnapshot();
      if (snapshot) {
        applySnapshot(snapshot);
      }
    } catch (err) {
      console.error('Failed to load settings snapshot:', err);
    }
  }

  function handleTabKeydown(event) {
    const key = event?.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault?.();
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    let nextIndex = currentIndex;
    if (key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    } else if (key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (key === 'Home') {
      nextIndex = 0;
    } else if (key === 'End') {
      nextIndex = TAB_ORDER.length - 1;
    }
    activateTab(TAB_ORDER[nextIndex], { focusTab: true });
  }

  async function handleCityConfirm() {
    const cityName = cityInputEl?.value?.trim() || '';
    if (!cityName) {
      cityInputEl?.focus?.();
      return;
    }

    setCityLoading(true);
    cityInputEl?.setAttribute?.('aria-invalid', 'false');
    setCityStatus('citySettingSearching', 'city-status--searching');

    try {
      const res = await window.electronAPI?.setCityName?.(cityName);
      if (res?.success) {
        const displayCity = res.data?.city || cityName;
        if (res.data?.snapshot) {
          applySnapshot(res.data.snapshot);
        } else if (cityCurrentValueEl) {
          cityCurrentValueEl.textContent = displayCity;
          cityCurrentValueEl.removeAttribute?.('data-i18n');
        }
        if (cityInputEl) cityInputEl.value = '';
        setCityStatus('citySettingSuccess', 'city-status--success', displayCity);
      } else {
        if (res?.snapshot) {
          applySnapshot(res.snapshot);
        }
        cityInputEl?.setAttribute?.('aria-invalid', 'true');
        setCityStatus('citySettingError', 'city-status--error');
        cityInputEl?.focus?.();
      }
    } catch (err) {
      console.error('Failed to set city:', err);
      cityInputEl?.setAttribute?.('aria-invalid', 'true');
      setCityStatus('citySettingError', 'city-status--error');
      cityInputEl?.focus?.();
    } finally {
      setCityLoading(false);
    }
  }

  // Tab bar clicks and keyboard roving tabindex
  for (const tabId of TAB_ORDER) {
    const btn = tabButtons[tabId];
    if (!btn) continue;
    btn.addEventListener('click', () => activateTab(tabId, { focusTab: true }));
    btn.addEventListener('keydown', handleTabKeydown);
  }
  if (tabListEl && !tabButtons.appearance) {
    tabListEl.addEventListener('keydown', handleTabKeydown);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.electronAPI?.closeSettingsWindow?.();
    });
  }

  // Pet Scale events: input -> live preview, change -> immediate commit
  if (scaleSliderEl) {
    scaleSliderEl.addEventListener('input', (event) => {
      const percent = Number(event.target.value);
      updateScaleDisplay(percent);
      window.electronAPI?.previewPetScale?.(percent);
    });
    scaleSliderEl.addEventListener('change', async (event) => {
      const percent = Number(event.target.value);
      updateScaleDisplay(percent);
      const res = await window.electronAPI?.commitPetScale?.(percent);
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      }
    });
  }

  if (scaleResetBtn) {
    scaleResetBtn.addEventListener('click', async () => {
      const defaultPercent = latestSnapshot?.petScale?.defaultPercent ?? 100;
      updateScaleDisplay(defaultPercent);
      const res = await window.electronAPI?.resetPetScale?.();
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      }
    });
  }

  if (openSkinBtn) {
    openSkinBtn.addEventListener('click', () => {
      window.electronAPI?.openSkinSelector?.();
    });
  }

  if (windowAwarenessSwitch) {
    windowAwarenessSwitch.addEventListener('click', async () => {
      if (windowAwarenessSwitch.disabled) return;
      const nextEnabled = windowAwarenessSwitch.getAttribute?.('aria-checked') !== 'true';
      const res = await window.electronAPI?.setWindowAwareness?.(nextEnabled);
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      } else if (res?.snapshot) {
        applySnapshot(res.snapshot);
      }
    });
  }

  if (weatherSwitch) {
    weatherSwitch.addEventListener('click', async () => {
      const nextEnabled = weatherSwitch.getAttribute?.('aria-checked') !== 'true';
      const res = await window.electronAPI?.setWeatherEnabled?.(nextEnabled);
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      } else if (res?.snapshot) {
        applySnapshot(res.snapshot);
      }
      if (res?.success && res.data?.needsCityPrompt) {
        setCityStatus('settingsWeatherCityPrompt', 'city-status--prompt');
        cityInputEl?.focus?.();
      } else if (!nextEnabled && cityStatusState?.key === 'settingsWeatherCityPrompt') {
        setCityStatus(null, null);
      }
    });
  }

  if (cityConfirmBtn) {
    cityConfirmBtn.addEventListener('click', handleCityConfirm);
  }

  if (cityInputEl) {
    cityInputEl.addEventListener('input', () => {
      cityInputEl.setAttribute?.('aria-invalid', 'false');
      if (cityStatusState?.key !== 'settingsWeatherCityPrompt') {
        setCityStatus(null, null);
      }
    });
    cityInputEl.addEventListener('keydown', (event) => {
      if (event?.isComposing || event?.keyCode === 229) return;
      if (event?.key === 'Enter') {
        event.preventDefault?.();
        handleCityConfirm();
      }
    });
  }

  if (breakReminderSwitch) {
    breakReminderSwitch.addEventListener('click', async () => {
      const nextEnabled = breakReminderSwitch.getAttribute?.('aria-checked') !== 'true';
      const res = await window.electronAPI?.setBreakReminder?.({ enabled: nextEnabled });
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      } else if (res?.snapshot) {
        applySnapshot(res.snapshot);
      }
    });
  }

  for (const btn of getChildrenArray(breakIntervalsContainer)) {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const intervalMinutes = Number(btn.dataset?.interval);
      const res = await window.electronAPI?.setBreakReminder?.({ intervalMinutes });
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      } else if (res?.snapshot) {
        applySnapshot(res.snapshot);
      }
    });
  }

  if (screensaverSwitch) {
    screensaverSwitch.addEventListener('click', async () => {
      const nextEnabled = screensaverSwitch.getAttribute?.('aria-checked') !== 'true';
      const res = await window.electronAPI?.setScreensaver?.({ enabled: nextEnabled });
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      } else if (res?.snapshot) {
        applySnapshot(res.snapshot);
      }
    });
  }

  for (const btn of getChildrenArray(screensaverThresholdsContainer)) {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const idleThresholdMinutes = Number(btn.dataset?.threshold);
      const res = await window.electronAPI?.setScreensaver?.({ idleThresholdMinutes });
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      } else if (res?.snapshot) {
        applySnapshot(res.snapshot);
      }
    });
  }

  for (const btn of getChildrenArray(localeButtonsContainer)) {
    btn.addEventListener('click', async () => {
      const lang = btn.dataset?.locale;
      if (!lang) return;
      const res = await window.electronAPI?.changeSettingsLocale?.(lang);
      if (res?.data?.snapshot) {
        applySnapshot(res.data.snapshot);
      } else if (res?.snapshot) {
        applySnapshot(res.snapshot);
      }
    });
  }

  if (autoLaunchSwitch) {
    autoLaunchSwitch.addEventListener('click', async () => {
      const nextEnabled = autoLaunchSwitch.getAttribute?.('aria-checked') !== 'true';
      setAutoLaunchStatus(null, null);
      const res = await window.electronAPI?.changeAutoLaunch?.(nextEnabled);
      if (res?.success) {
        if (res.data?.snapshot) {
          applySnapshot(res.data.snapshot);
        }
        if (res.data?.pendingApproval || res.data?.snapshot?.autoLaunchPendingApproval) {
          setAutoLaunchStatus('settingsAutoLaunchPendingApproval', 'settings-inline-status--warning');
        }
      } else {
        if (res?.snapshot) {
          applySnapshot(res.snapshot);
        } else if (latestSnapshot) {
          applySnapshot(latestSnapshot);
        }
        setAutoLaunchStatus('settingsAutoLaunchError', 'settings-inline-status--error');
      }
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event?.isComposing || event?.keyCode === 229) return;
    if (event?.key === 'Escape') {
      if (isCityLoading) return;
      event.preventDefault?.();
      window.electronAPI?.closeSettingsWindow?.();
    }
  });

  // Main-process push subscriptions
  window.electronAPI?.onSettingsUpdated?.((snapshot) => {
    if (snapshot) {
      applySnapshot(snapshot);
    }
  });

  window.electronAPI?.onSwitchTab?.((tabId) => {
    hasScheduledInitialFocus = true;
    activateTab(tabId, { focusTab: true });
  });

  window.electronAPI?.onRestoreSkinFocus?.(() => {
    hasScheduledInitialFocus = true;
    activateTab('appearance');
    openSkinBtn?.focus?.();
  });

  if (typeof WindowI18n !== 'undefined' && WindowI18n.init) {
    WindowI18n.init(() => {
      if (latestSnapshot) {
        applySnapshot(latestSnapshot);
      }
      renderCityStatus();
      renderAutoLaunchStatus();
      loadSnapshot();
    });
  }

  activateTab(activeTab);
  loadSnapshot();

  const focusInitialTab = () => {
    if (!hasScheduledInitialFocus) {
      hasScheduledInitialFocus = true;
      tabButtons[activeTab]?.focus?.();
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(focusInitialTab);
  } else {
    focusInitialTab();
  }
})();

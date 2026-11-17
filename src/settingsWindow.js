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
  let isScaleDragging = false;
  const settingQueues = new Map();

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

  function bindSegmentClickHandler(btn, dataKey, onSelect) {
    if (!btn || btn._settingsSegmentBound) return;
    btn._settingsSegmentBound = true;
    btn.addEventListener?.('click', async () => {
      if (btn.disabled) return;
      const value = Number(btn.dataset?.[dataKey]);
      if (!Number.isFinite(value)) return;
      await onSelect(value);
    });
  }

  function createMinuteSegmentButton(value, dataKey) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-segment-button';
    btn.dataset[dataKey] = String(value);
    btn.setAttribute?.('aria-pressed', 'false');

    const unitSpan = document.createElement('span');
    unitSpan.setAttribute?.('data-i18n', 'trayMinuteUnit');
    unitSpan.textContent = translate('trayMinuteUnit');

    if (typeof btn.append === 'function') {
      btn.append(`${value} `, unitSpan);
    } else {
      btn.textContent = `${value} ${unitSpan.textContent}`;
    }
    return btn;
  }

  function syncMinuteSegmentOptions(container, allowedValues, dataKey, onSelect) {
    if (!container) return;
    const currentButtons = getChildrenArray(container);
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
      for (const btn of currentButtons) {
        bindSegmentClickHandler(btn, dataKey, onSelect);
      }
      return;
    }

    const normalizedValues = allowedValues.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (normalizedValues.length === 0) return;

    const currentValues = currentButtons.map((btn) => Number(btn.dataset?.[dataKey]));
    const matchesDom = normalizedValues.length === currentValues.length
      && normalizedValues.every((value, idx) => value === currentValues[idx]);

    if (!matchesDom && typeof document?.createElement === 'function' && typeof container.replaceChildren === 'function') {
      const rebuilt = normalizedValues.map((value) => {
        const btn = createMinuteSegmentButton(value, dataKey);
        bindSegmentClickHandler(btn, dataKey, onSelect);
        return btn;
      });
      container.replaceChildren(...rebuilt);
      return;
    }

    for (const btn of currentButtons) {
      bindSegmentClickHandler(btn, dataKey, onSelect);
    }
  }

  function applyMinuteSegmentGroup({
    switchEl,
    groupEl,
    container,
    enabled,
    selectedValue,
    allowedValues,
    dataKey,
    onSelect,
  }) {
    const isEnabled = Boolean(enabled);
    setSwitchState(switchEl, isEnabled, false);
    groupEl?.setAttribute?.('aria-disabled', String(!isEnabled));
    syncMinuteSegmentOptions(container, allowedValues, dataKey, onSelect);
    for (const btn of getChildrenArray(container)) {
      btn.disabled = !isEnabled;
      const selected = Number(btn.dataset?.[dataKey]) === Number(selectedValue);
      btn.setAttribute?.('aria-pressed', String(selected));
    }
  }

  const selectBreakInterval = (intervalMinutes) => (
    runSetting('break-reminder', () => window.electronAPI?.setBreakReminder?.({ intervalMinutes }))
  );

  const selectScreensaverThreshold = (idleThresholdMinutes) => (
    runSetting('screensaver', () => window.electronAPI?.setScreensaver?.({ idleThresholdMinutes }))
  );

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
      // 拖动期间不接受快照回写，避免并发/乱序推送把滑块拉回旧值
      if (!isScaleDragging) {
        updateScaleDisplay(snapshot.petScale.currentPercent);
      }
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
      applyMinuteSegmentGroup({
        switchEl: breakReminderSwitch,
        groupEl: breakIntervalsGroupEl,
        container: breakIntervalsContainer,
        enabled: snapshot.breakReminder.enabled,
        selectedValue: snapshot.breakReminder.intervalMinutes,
        allowedValues: snapshot.breakReminder.allowedIntervals,
        dataKey: 'interval',
        onSelect: selectBreakInterval,
      });
    }

    // Companion: Sweet Screensaver
    if (snapshot.screensaver) {
      applyMinuteSegmentGroup({
        switchEl: screensaverSwitch,
        groupEl: screensaverThresholdsGroupEl,
        container: screensaverThresholdsContainer,
        enabled: snapshot.screensaver.enabled,
        selectedValue: snapshot.screensaver.idleThresholdMinutes,
        allowedValues: snapshot.screensaver.allowedThresholds,
        dataKey: 'threshold',
        onSelect: selectScreensaverThreshold,
      });
    }

    // System: Language
    for (const btn of getChildrenArray(localeButtonsContainer)) {
      const selected = btn.dataset?.locale === snapshot.locale;
      btn.setAttribute?.('aria-pressed', String(selected));
    }

    // System: Auto Launch
    if (snapshot.autoLaunch) {
      const pendingApproval = Boolean(snapshot.autoLaunch.pendingApproval);
      // macOS requires-approval keeps enabled=false while preference=true; keep switch on so user can revoke it.
      setSwitchState(autoLaunchSwitch, Boolean(snapshot.autoLaunch.enabled || pendingApproval), false);
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

  function applyResultSnapshot(res) {
    const snapshot = res?.data?.snapshot || res?.snapshot;
    if (snapshot) {
      applySnapshot(snapshot);
    }
    return Boolean(snapshot);
  }

  // 同一控件的请求按点击顺序串行执行（开关状态在执行时才读取，连点等价于依次切换）。
  // IPC 抛错或失败且无快照时回读主进程快照，避免界面停在未生效的乐观状态。
  function runSetting(key, task) {
    const run = async () => {
      try {
        const res = await task();
        const hasSnapshot = applyResultSnapshot(res);
        if (res && res.success === false && !hasSnapshot) {
          await loadSnapshot();
        }
        return res;
      } catch (err) {
        console.error(`Failed to update setting ${key}:`, err);
        await loadSnapshot();
        return { success: false };
      }
    };
    const next = (settingQueues.get(key) || Promise.resolve()).then(run);
    settingQueues.set(key, next);
    return next;
  }

  function isSwitchOn(switchEl) {
    return switchEl.getAttribute?.('aria-checked') === 'true';
  }

  function endScaleDrag() {
    isScaleDragging = false;
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

    let shouldFocusInput = false;
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
        shouldFocusInput = true;
      }
    } catch (err) {
      console.error('Failed to set city:', err);
      cityInputEl?.setAttribute?.('aria-invalid', 'true');
      setCityStatus('citySettingError', 'city-status--error');
      shouldFocusInput = true;
    } finally {
      setCityLoading(false);
      // 须先解除 disabled 再恢复焦点，否则浏览器会忽略对禁用输入框的 focus() 调用
      if (shouldFocusInput) {
        cityInputEl?.focus?.();
      }
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
    scaleSliderEl.addEventListener('pointerdown', () => {
      isScaleDragging = true;
    });
    // 拖走再拖回原值松手时浏览器可能不触发 change，需靠指针结束/失焦清除拖动标记
    scaleSliderEl.addEventListener('blur', endScaleDrag);
    window.addEventListener('pointerup', endScaleDrag);
    window.addEventListener('pointercancel', endScaleDrag);
    scaleSliderEl.addEventListener('input', (event) => {
      const percent = Number(event.target.value);
      updateScaleDisplay(percent);
      Promise.resolve(window.electronAPI?.previewPetScale?.(percent)).catch((err) => {
        console.error('Failed to preview pet scale:', err);
      });
    });
    scaleSliderEl.addEventListener('change', async (event) => {
      const percent = Number(event.target.value);
      endScaleDrag();
      updateScaleDisplay(percent);
      await runSetting('scale', () => window.electronAPI?.commitPetScale?.(percent));
    });
  }

  if (scaleResetBtn) {
    scaleResetBtn.addEventListener('click', async () => {
      const defaultPercent = latestSnapshot?.petScale?.defaultPercent ?? 100;
      updateScaleDisplay(defaultPercent);
      await runSetting('scale', () => window.electronAPI?.resetPetScale?.());
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
      await runSetting('window-awareness', () => (
        window.electronAPI?.setWindowAwareness?.(!isSwitchOn(windowAwarenessSwitch))
      ));
    });
  }

  if (weatherSwitch) {
    weatherSwitch.addEventListener('click', async () => {
      let nextEnabled = false;
      const res = await runSetting('weather', () => {
        nextEnabled = !isSwitchOn(weatherSwitch);
        return window.electronAPI?.setWeatherEnabled?.(nextEnabled);
      });
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
      await runSetting('break-reminder', () => (
        window.electronAPI?.setBreakReminder?.({ enabled: !isSwitchOn(breakReminderSwitch) })
      ));
    });
  }

  syncMinuteSegmentOptions(breakIntervalsContainer, null, 'interval', selectBreakInterval);

  if (screensaverSwitch) {
    screensaverSwitch.addEventListener('click', async () => {
      await runSetting('screensaver', () => (
        window.electronAPI?.setScreensaver?.({ enabled: !isSwitchOn(screensaverSwitch) })
      ));
    });
  }

  syncMinuteSegmentOptions(screensaverThresholdsContainer, null, 'threshold', selectScreensaverThreshold);

  for (const btn of getChildrenArray(localeButtonsContainer)) {
    btn.addEventListener('click', async () => {
      const lang = btn.dataset?.locale;
      if (!lang) return;
      await runSetting('locale', () => window.electronAPI?.changeSettingsLocale?.(lang));
    });
  }

  if (autoLaunchSwitch) {
    autoLaunchSwitch.addEventListener('click', async () => {
      const res = await runSetting('auto-launch', () => {
        setAutoLaunchStatus(null, null);
        return window.electronAPI?.changeAutoLaunch?.(!isSwitchOn(autoLaunchSwitch));
      });
      if (res?.success) {
        if (res.data?.pendingApproval || res.data?.snapshot?.autoLaunch?.pendingApproval) {
          setAutoLaunchStatus('settingsAutoLaunchPendingApproval', 'settings-inline-status--warning');
        } else {
          setAutoLaunchStatus(null, null);
        }
      } else {
        if (latestSnapshot) {
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

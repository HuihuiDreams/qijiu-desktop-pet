/**
 * app.js — 岳七 & 沈九 桌面宠物的主游戏循环。
 * 初始化所有系统，并通过 requestAnimationFrame 运行游戏主循环。
 */

(async function main() {
  // === 初始化 i18n （必须在其他系统之前）===
  const locale = await window.electronAPI.getLocale();
  window.__currentLocale = locale;

  // 设置平台类以便在 CSS 中进行平台特定的样式调整
  const platform = window.electronAPI.platform || 'win32';
  document.body.classList.add(`platform-${platform}`);

  // 建立 window.t() 翻译函数
  window.t = (key) => I18nHelpers.translateUi(key);

  // 建立 window.I18N_UI （气泡等需要函数类型字符串的入口）
  const updateI18nRefs = () => {
    window.I18N_UI = I18nHelpers.getI18nUi();
    if (typeof initDialogues === 'function') {
      initDialogues(window.__currentLocale);
    }
    I18nHelpers.applyI18n();
  };
  
  updateI18nRefs();

  window.electronAPI.onLocaleChange?.((newLocale) => {
    window.__currentLocale = newLocale;
    updateI18nRefs();
  });

  // 等待主进程的屏幕信息
  let pets = [];
  const stageGeometry = new StageGeometry({
    getMovementSystem: () => movementSystem,
    getPets: () => pets,
    initialWidth: window.innerWidth,
    initialHeight: window.innerHeight,
  });
  const keepPetReachable = (pet) => stageGeometry.keepPetReachable(pet);
  const getWalkAreaForPoint = (x, y) => stageGeometry.getWalkAreaForPoint(x, y);
  const getVisualScaleForPoint = (x, y) => stageGeometry.getVisualScaleForPoint(x, y);
  const getVisualScaleForPet = (pet) => stageGeometry.getVisualScaleForPet(pet);
  const getWeatherEffectScale = () => stageGeometry.getWeatherEffectScale();
  const getMenuBoundsForPet = (pet) => stageGeometry.getMenuBoundsForPet(pet);

  // === 初始化系统 ===
  const stage = document.getElementById('pet-stage');
  const renderer = new PetRenderer(stage, keepPetReachable, getVisualScaleForPet);
  const spriteView = new SpriteView();
  const movementSystem = new MovementSystem(stageGeometry.width, stageGeometry.height);
  const windowAwarenessSystem = new WindowAwarenessSystem(window.electronAPI, {
    enabled: CONFIG.WINDOW_AWARENESS_ENABLED !== false,
    ttlMs: CONFIG.WINDOW_AWARENESS_PLATFORM_TTL_MS,
  });
  const weatherAwarenessSystem = new WeatherAwarenessSystem(CONFIG);
  const nurtureSystemA = new NurtureSystem();
  const nurtureSystemB = new NurtureSystem();
  const interactionSystem = new InteractionSystem();
  const timeSystem = new TimeSystem();
  const skinManager = new SkinManager();
  window.__DEBUG_VISIBILITY = {
    visible: true,
    reason: 'visible',
    sources: { manual: false, meeting: false, pomodoro: false },
  };

  const setDebugVisibility = (visible, state = null) => {
    window.__DEBUG_VISIBILITY = state || {
      visible: Boolean(visible),
      reason: visible ? 'visible' : 'unknown',
      sources: { manual: false, meeting: false, pomodoro: false },
    };
  };

  window.electronAPI.getPetVisibilityState()
    .then((state) => setDebugVisibility(state?.visible, state))
    .catch(() => {});

  // 监听主进程的屏幕信息更新事件
  window.electronAPI.onScreenInfo((info) => {
    stageGeometry.applyScreenInfo(info);
  });
  windowAwarenessSystem.start();

  window.electronAPI.onWeatherUpdate?.((payload) => {
    weatherAwarenessSystem.setWeatherPayload(payload);
  });

  // macOS: 窗口迁移到新显示器后，调整所有宠物坐标
  window.electronAPI.onWindowMigrated?.((data) => {
    const { offset } = data;
    pets.forEach((pet) => {
      pet.x += offset.x;
      pet.y += offset.y;
      pet.targetX += offset.x;
      pet.targetY += offset.y;
      pet.setState('idle');
      pet.idleTimer = 1000 + Math.random() * 2000;
    });
    // keepPetReachable 会在后续的 screen-info 事件中触发
  });

  const getSurfacePlatforms = (now) => {
    if (!windowAwarenessSystem.isSurfaceAwarenessEnabled()) return [];
    const activePlatform = windowAwarenessSystem.getCurrentPlatform(now);
    return activePlatform
      ? [activePlatform, ...stageGeometry.screenInfo.taskbarPlatforms]
      : stageGeometry.screenInfo.taskbarPlatforms;
  };

  // === 创建宠物 ===
  const yueqi = new Pet(CONFIG.PET_A);
  const shenjiu = new Pet(CONFIG.PET_B);
  pets = [yueqi, shenjiu];

  // 初始化时将它们分开一定距离
  yueqi.x = stageGeometry.width * 0.3;
  yueqi.y = stageGeometry.height * 0.5;
  shenjiu.x = stageGeometry.width * 0.7;
  shenjiu.y = stageGeometry.height * 0.5;

  // 设置初始的发呆计时器
  yueqi.idleTimer = movementSystem.randomIdleDuration();
  shenjiu.idleTimer = movementSystem.randomIdleDuration();

  // === 初始化 UI ===
  const contextMenu = new ContextMenu(null, getVisualScaleForPoint); // 我们将在后续为每个宠物设置养成系统
  contextMenu.getMenuBoundsForPet = getMenuBoundsForPet;
  const statusBar = new StatusBar();
  const dialogBubble = new DialogBubble();
  const weatherParticleLayer = new WeatherParticleLayer(document.body, CONFIG);

  // === 暴露全局调试方法 ===
  window.debugTriggerWeather = (petId = 'yueqi') => {
    const target = petId === 'shenjiu' ? shenjiu : yueqi;
    if (!target.weatherKind || target.weatherKind === 'unknown') {
      console.warn(`[Debug] ${target.name} 当前没有有效的天气状态 (weatherKind: ${target.weatherKind})`);
      return;
    }
    const weatherKey = `weather_${target.weatherKind}`;
    const pool = DIALOGUES[weatherKey]?.[target.id];
    if (pool && pool.length > 0) {
      const text = pool[Math.floor(Math.random() * pool.length)];
      dialogBubble.show(target, text, 5000);
      console.log(`[Debug] 强制触发天气台词: ${text}`);
    } else {
      console.warn(`[Debug] 找不到 ${target.name} 在 ${weatherKey} 天气下的台词。`);
    }
  };

  const skinTargets = {
    petA: yueqi,
    petB: shenjiu,
    spriteView,
    renderer,
  };

  const offlineReturnSystem = new OfflineReturnSystem({
    getPets: () => pets,
    nurtureSystemA,
    nurtureSystemB,
    timeSystem,
    skinManager,
    dialogBubble,
    getI18nUi: () => window.I18N_UI,
    CONFIG,
  });

  // 清除当前互动覆盖层：皮肤切换与久坐提醒触发前都需要先清掉正在显示的覆盖层。
  // 定义为具名函数声明（整体提升），供下方多处按引用共享，不必关心声明书写顺序。
  function clearInteractionOverlay() {
    if (interactionOverlayActive) {
      interactionOverlayActive = false;
      renderer.hideOverlay(yueqi, shenjiu);
    }
  }

  const skinSwitchController = new SkinSwitchController({
    skinManager,
    skinTargets,
    electronAPI: window.electronAPI,
    saveCurrentState: () => offlineReturnSystem.saveCurrentState(),
    clearInteractionOverlay,
  });

  // === 环境闲聊 / 深夜梦话 / 久坐提醒展示 ===
  const ambientDialogueSystem = new AmbientDialogueSystem({
    getPets: () => pets,
    dialogBubble,
    t: (key) => window.t(key),
    getDialogues: () => DIALOGUES,
  });

  const breakReminderPresenter = new BreakReminderPresenter({
    getPets: () => pets,
    dialogBubble,
    renderer,
    spriteView,
    stageGeometry,
    getIsPaused: () => isPaused,
    clearInteractionOverlay,
    electronAPI: window.electronAPI,
    CONFIG,
    getDialogues: () => DIALOGUES,
  });

  const screensaverSystem = new ScreensaverSystem({
    electronAPI: window.electronAPI,
    stageGeometry,
    renderer,
    spriteView,
    getPets: () => pets,
    interactionSystem,
    dialogBubble,
    clearInteractionOverlay,
    skinManager,
  });
  screensaverSystem.init();

  // === 创建 DOM 元素 ===
  renderer.createPetElement(yueqi);
  renderer.createPetElement(shenjiu);
  spriteView.attach(yueqi);
  spriteView.attach(shenjiu);

  // === 将 UI 辅助方法附加到宠物实例上 ===
  yueqi._showBubble = (text) => dialogBubble.show(yueqi, text);
  shenjiu._showBubble = (text) => dialogBubble.show(shenjiu, text);
  yueqi._spawnEffect = (_emoji, tone) => renderer.spawnQiAura(yueqi, tone);
  shenjiu._spawnEffect = (_emoji, tone) => renderer.spawnQiAura(shenjiu, tone);

  // === 右键菜单处理 ===
  [yueqi, shenjiu].forEach(pet => {
    pet.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 为当前宠物设置正确的养成系统
      const ns = pet.id === 'yueqi' ? nurtureSystemA : nurtureSystemB;
      contextMenu.nurtureSystem = ns;
      contextMenu.show(pet, e.clientX, e.clientY);
    });

    // 左键点击 = 随机对话 / 久坐提醒点击消失
    pet.element.addEventListener('click', (e) => {
      e.stopPropagation();
      if (breakReminderPresenter.isActive()) {
        breakReminderPresenter.dismiss();
        return;
      }
      if (!pet.isBusy() && !dialogBubble.activeBubbles.has(pet.id)) {
        if (pet.timePhase === 'night' && pet.state === 'idle') {
          ambientDialogueSystem.showNightDream(pet);
        } else {
          dialogBubble.showIdleChatter(pet);
        }
      }
    });
  });

  // === 状态面板回调 ===
  contextMenu.onStatusClick = () => {
    statusBar.toggle(yueqi, shenjiu);
  };

  // === IPC 监听器 (监听来自主进程的消息) ===
  window.electronAPI.onToggleStatusPanel(() => {
    statusBar.toggle(yueqi, shenjiu);
  });

  let isPaused = false;
  let interactionOverlayActive = false; // 记录是否当前正在显示互动覆盖层

  window.electronAPI.onTogglePause((paused) => {
    isPaused = paused;
  });

  window.electronAPI.onResetPositions(() => {
    const yueqiPosition = stageGeometry.getResetPosition(0.3);
    const shenjiuPosition = stageGeometry.getResetPosition(0.7);
    yueqi.x = yueqiPosition.x;
    yueqi.y = yueqiPosition.y;
    shenjiu.x = shenjiuPosition.x;
    shenjiu.y = shenjiuPosition.y;
    pets.forEach(keepPetReachable);
    yueqi.setState('idle');
    shenjiu.setState('idle');
    yueqi.idleTimer = 2000;
    shenjiu.idleTimer = 2000;
  });

  // 隐藏/显示桌宠（来自系统托盘菜单）
  window.electronAPI.onTogglePetVisibility((visible, state) => {
    setDebugVisibility(visible, state);
    const petStage = document.getElementById('pet-stage');
    petStage.style.display = visible ? '' : 'none';
    isPaused = !visible;
    if (!visible) {
      weatherParticleLayer.clear();
    }
  });

  window.electronAPI.onSwitchSkin((skinId) => {
    skinSwitchController.applySkinById(skinId);
  });

  // === 久坐提醒处理 ===
  // 实际展示/消失逻辑已下沉到 BreakReminderPresenter（见上方实例化），此处只保留 IPC 订阅。
  window.electronAPI.onBreakReminder((payload) => breakReminderPresenter.handleTriggered(payload));


  // === 离线回归结算 / 系统睡眠唤醒 / 存档持久化 ===
  // 实际逻辑已下沉到 OfflineReturnSystem（见上方实例化），此处只保留一行 IPC 订阅委托。
  window.electronAPI.onSystemSuspend?.(() => offlineReturnSystem.handleSystemSuspend());
  window.electronAPI.onSystemResume?.((data) => offlineReturnSystem.handleSystemResume(data));

  // === 加载保存的状态 ===
  await skinSwitchController.refreshAvailableSkins();
  const savedState = await timeSystem.load();
  offlineReturnSystem.applyLoadedState(savedState);
  if (savedState) {
    pets.forEach(keepPetReachable);
  }
  await skinSwitchController.applySkinById(savedState?.skinId || 'default', { persist: false });

  let migrationCooldown = 0; // macOS: 跨屏迁移冷却时间

  // === 游戏主循环 ===
  let lastTime = performance.now();
  let statusUpdateTimer = 0;

  function gameLoop(currentTime) {
    let deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    try {
      const isScreensaverActive = screensaverSystem.isActive();

      if (!isPaused && !breakReminderPresenter.isActive()) {
        if (deltaMs > 60000) {
          offlineReturnSystem.handleOfflineReturn(deltaMs);
          deltaMs = 16;
        } else if (deltaMs <= 0 || Number.isNaN(deltaMs)) {
          deltaMs = 16;
        }

        // Shared updates: Nurture stat decay
        nurtureSystemA.update(yueqi, deltaMs);
        nurtureSystemB.update(shenjiu, deltaMs);

        // Shared updates: Time & Auto-save
        if (timeSystem.update(deltaMs)) {
          offlineReturnSystem.saveCurrentState();
        }

        if (isScreensaverActive) {
          // === SCREENSAVER MODE GATE ===
          weatherParticleLayer.clear();
          screensaverSystem.update(deltaMs);
        } else {
          // === NORMAL MODE GATE ===
          weatherAwarenessSystem.updateLocalTimePhase(Date.now());
          const weatherState = weatherAwarenessSystem.getCurrentState();
          yueqi.timePhase = weatherState.timePhase;
          shenjiu.timePhase = weatherState.timePhase;
          yueqi.weatherKind = weatherState.weatherKind;
          shenjiu.weatherKind = weatherState.weatherKind;

          if (document.body.dataset.weather !== weatherState.weatherKind) {
            document.body.dataset.weather = weatherState.weatherKind;
          }
          if (document.body.dataset.timePhase !== weatherState.timePhase) {
            document.body.dataset.timePhase = weatherState.timePhase;
          }

          movementSystem.setSurfacePlatforms(getSurfacePlatforms(Date.now()));
          movementSystem.update(yueqi, deltaMs);
          movementSystem.update(shenjiu, deltaMs);

          if (migrationCooldown > 0) migrationCooldown -= deltaMs;
          if (window.electronAPI.requestWindowMigration && stageGeometry.screenInfo.adjacentDisplays && migrationCooldown <= 0) {
            for (const pet of pets) {
              const migrationDirection = MovementSystem.getEdgeMigrationDirection(
                pet,
                stageGeometry.width,
                stageGeometry.height,
                stageGeometry.screenInfo.adjacentDisplays,
              );
              if (migrationDirection) {
                window.electronAPI.requestWindowMigration(migrationDirection);
                migrationCooldown = 2000;
                break;
              }
            }
          }

          const interaction = interactionSystem.update(yueqi, shenjiu, deltaMs);
          if (interaction) {
            movementSystem.clampPetToWalkAreas(yueqi);
            movementSystem.clampPetToWalkAreas(shenjiu);
            movementSystem.separatePetsWithinWalkAreas(
              yueqi,
              shenjiu,
              InteractionSystem.getMinimumInteractionXDistance(yueqi, shenjiu),
            );
            if (yueqi.x < shenjiu.x) {
              yueqi.direction = 'right';
              shenjiu.direction = 'left';
            } else {
              yueqi.direction = 'left';
              shenjiu.direction = 'right';
            }

            const overlayKey = interaction.overlayKey || interaction.key;
            const isOverlay = ['kiss', 'hug', 'cultivate', 'shareFood', 'throwup'].includes(overlayKey);
            dialogBubble.removeForPets([yueqi, shenjiu]);

            if (isOverlay) {
              interactionOverlayActive = true;
              const overlayPos = renderer.showOverlay(yueqi, shenjiu, overlayKey);
              renderer.spawnQiAuraAt(
                overlayPos.x + overlayPos.width / 2,
                overlayPos.y + 82,
                (overlayPos.baseWidth || overlayPos.width) * 1.2,
                overlayKey,
                getVisualScaleForPoint(overlayPos.x + overlayPos.width / 2, overlayPos.y + 82)
              );

              const pool = DIALOGUES[interaction.key];
              const shenjuText = interaction.dialogue?.shenjiu || (pool?.shenjiu?.length
                ? pool.shenjiu[Math.floor(Math.random() * pool.shenjiu.length)]
                : null);
              const yueqiText = interaction.dialogue?.yueqi || (pool?.yueqi?.length
                ? pool.yueqi[Math.floor(Math.random() * pool.yueqi.length)]
                : null);
              renderer.showOverlayBubbles(shenjuText, yueqiText, overlayPos, CONFIG.INTERACTION_DURATION - 500);
            } else {
              dialogBubble.showInteraction(yueqi, shenjiu, interaction.key);
              renderer.spawnQiAura(yueqi, interaction.key);
              renderer.spawnQiAura(shenjiu, interaction.key);
            }
          }

          if (interactionOverlayActive && !interactionSystem.isInteracting) {
            interactionOverlayActive = false;
            renderer.hideOverlay(yueqi, shenjiu);
          }

          weatherParticleLayer.sync(weatherState, {
            visible: !isPaused,
            scaleRatio: getWeatherEffectScale(),
            pets,
            interactionOverlayActive,
            isInteracting: interactionSystem.isInteracting,
          });

          [ { pet: yueqi, ns: nurtureSystemA }, { pet: shenjiu, ns: nurtureSystemB } ].forEach(({ pet, ns }) => {
            if (pet.state === 'idle' && pet.queuedAction) {
              const action = pet.queuedAction;
              pet.queuedAction = null;
              contextMenu.nurtureSystem = ns;
              contextMenu.handleAction(action, pet);
            }
          });

          ambientDialogueSystem.update(deltaMs);
        }
      }

      // 更新渲染 (始终执行，即使暂停也一样，以保持视觉正确)
      renderer.update(yueqi);
      renderer.update(shenjiu);
      spriteView.update(yueqi, deltaMs);
      spriteView.update(shenjiu, deltaMs);

      // 每秒更新一次状态面板
      statusUpdateTimer += deltaMs;
      if (statusUpdateTimer > 1000) {
        statusUpdateTimer = 0;
        statusBar.update(yueqi, shenjiu);
      }
    } catch (err) {
      console.error('游戏循环发生错误:', err);
    }

    requestAnimationFrame(gameLoop);
  }

  // 启动循环
  requestAnimationFrame(gameLoop);

  // 关闭时保存
  window.electronAPI.onSaveBeforeQuit(() => offlineReturnSystem.saveCurrentState());

  // 暴露给 window 以供 debug.js 使用
  window.__DEBUG_PETS = { yueqi, shenjiu };
  window.__DEBUG_SCREENSAVER = screensaverSystem;
  window.__DEBUG_SCREEN = () => ({
    ...stageGeometry.screenInfo,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    movementWalkAreas: movementSystem.getWalkAreas(),
    windowAwareness: windowAwarenessSystem.getDebugInfo(),
  });
  window.__DEBUG_DIALOG = dialogBubble;
  window.__DEBUG_RENDERER = renderer;
  window.__DEBUG_SPRITE_VIEW = spriteView;
  window.__DEBUG_SKIN_MANAGER = skinManager;
  window.__DEBUG_MOVEMENT = movementSystem;
  window.__DEBUG_WINDOW_AWARENESS = windowAwarenessSystem;
  window.__DEBUG_WEATHER = {
    set(payload = {}) {
      const now = Date.now();
      weatherAwarenessSystem.setWeatherPayload({
        active: true,
        source: 'debug-console',
        stale: false,
        sampledAt: now,
        expiresAt: now + 10 * 60 * 1000,
        ...payload,
      });
      const state = weatherAwarenessSystem.getCurrentState();
      document.body.dataset.weather = state.weatherKind;
      document.body.dataset.timePhase = state.timePhase;
      yueqi.timePhase = state.timePhase;
      shenjiu.timePhase = state.timePhase;
      yueqi.weatherKind = state.weatherKind;
      shenjiu.weatherKind = state.weatherKind;
      weatherParticleLayer.sync(state, {
        visible: !isPaused,
        scaleRatio: getWeatherEffectScale(),
        pets,
        interactionOverlayActive,
        isInteracting: interactionSystem.isInteracting,
      });
      return state;
    },
    force(weatherKind = 'unknown', options = {}) {
      return this.set({
        weatherKind,
        intensity: options.intensity || (weatherKind === 'unknown' ? 'none' : 'normal'),
        windIntensity: options.windIntensity,
        windSpeed: options.windSpeed,
        windGusts: options.windGusts,
        timePhase: options.timePhase || 'day',
        isDay: options.isDay !== false,
      });
    },
    clear() {
      weatherAwarenessSystem.setWeatherPayload({ active: false });
      const state = weatherAwarenessSystem.getCurrentState();
      document.body.dataset.weather = state.weatherKind;
      document.body.dataset.timePhase = state.timePhase;
      yueqi.weatherKind = state.weatherKind;
      shenjiu.weatherKind = state.weatherKind;
      weatherParticleLayer.clear();
      return state;
    },
    getState() {
      return weatherAwarenessSystem.getCurrentState();
    },
  };
  window.__DEBUG_BREAK_REMINDER = {
    trigger: () => {
      breakReminderPresenter.handleTriggered({ triggeredAt: Date.now(), intervalMinutes: 60 });
    },
  };

  console.log('🗡️🪭 岳七 & 沈九 桌面宠物已启动！');
})();

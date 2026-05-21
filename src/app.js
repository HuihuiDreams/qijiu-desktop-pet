/**
 * app.js — 岳七 & 沈九 桌面宠物的主游戏循环。
 * 初始化所有系统，并通过 requestAnimationFrame 运行游戏主循环。
 */

/**
 * applyI18n() — 遍历所有 [data-i18n] 元素，更新 textContent。
 * 对于 data-i18n-pet 属性，由 ContextMenu.show() 单独处理。
 */
function getI18nDictionaries() {
  return typeof I18N !== 'undefined' ? I18N : null;
}

function translateUi(key, locale = window.__currentLocale) {
  const dictionaries = getI18nDictionaries();
  return dictionaries?.[locale]?.ui?.[key] ?? dictionaries?.zh?.ui?.[key] ?? key;
}

function getI18nUi(locale = window.__currentLocale) {
  const dictionaries = getI18nDictionaries();
  return dictionaries?.[locale]?.ui ?? dictionaries?.zh?.ui ?? {};
}

function applyI18n() {
  if (!window.t) return;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = window.t(el.dataset.i18n);
  });
  // 更新 <html lang> 属性
  const locale = window.__currentLocale || 'zh';
  document.documentElement.lang = locale;
}

(async function main() {
  // === 初始化 i18n （必须在其他系统之前）===
  const locale = await window.electronAPI.getLocale();
  window.__currentLocale = locale;

  // 建立 window.t() 翻译函数
  window.t = (key) => translateUi(key);

  // 建立 window.I18N_UI （气泡等需要函数类型字符串的入口）
  const updateI18nRefs = () => {
    window.I18N_UI = getI18nUi();
    if (typeof initDialogues === 'function') {
      initDialogues(window.__currentLocale);
    }
    applyI18n();
  };
  
  updateI18nRefs();

  window.electronAPI.onLocaleChange?.((newLocale) => {
    window.__currentLocale = newLocale;
    updateI18nRefs();
  });

  // 等待主进程的屏幕信息
  let screenWidth = window.innerWidth;
  let screenHeight = window.innerHeight;
  let screenInfo = {
    width: screenWidth,
    height: screenHeight,
    walkAreas: [],
    windowScaleFactor: null,
    displays: [],
  };
  let pets = [];
  const keepPetReachable = (pet) => {
    if (movementSystem) {
      movementSystem.clampPetToWalkAreas(pet);
    }
  };
  const getVisualScaleForPoint = (x, y) => {
    const areas = movementSystem ? movementSystem.getWalkAreas() : screenInfo.walkAreas;
    const area = areas.find((walkArea) => (
      x >= walkArea.x
      && x <= walkArea.x + walkArea.width
      && y >= walkArea.y
      && y <= walkArea.y + walkArea.height
    ));
    const scaleRatio = Number(area?.scaleRatio);
    return Number.isFinite(scaleRatio) && scaleRatio > 0 ? scaleRatio : 1;
  };
  const getVisualScaleForPet = (pet) => (
    getVisualScaleForPoint(pet.x + pet.size / 2, pet.y + pet.size / 2)
  );

  // === 初始化系统 ===
  const stage = document.getElementById('pet-stage');
  const renderer = new PetRenderer(stage, keepPetReachable, getVisualScaleForPet);
  const spriteView = new SpriteView();
  const movementSystem = new MovementSystem(screenWidth, screenHeight);
  const nurtureSystemA = new NurtureSystem();
  const nurtureSystemB = new NurtureSystem();
  const interactionSystem = new InteractionSystem();
  const timeSystem = new TimeSystem();
  const skinManager = new SkinManager();

  // 监听主进程的屏幕信息更新事件
  window.electronAPI.onScreenInfo((info) => {
    screenWidth = info.width;
    screenHeight = info.height;
    screenInfo = {
      width: screenWidth,
      height: screenHeight,
      walkAreas: Array.isArray(info.walkAreas) ? info.walkAreas : [],
      windowScaleFactor: info.windowScaleFactor,
      displays: Array.isArray(info.displays) ? info.displays : [],
    };
    if (movementSystem) {
      movementSystem.setScreenSize(screenWidth, screenHeight, info.walkAreas);
    }
    pets.forEach(keepPetReachable);
  });

  // === 创建宠物 ===
  const yueqi = new Pet(CONFIG.PET_A);
  const shenjiu = new Pet(CONFIG.PET_B);
  pets = [yueqi, shenjiu];

  // 初始化时将它们分开一定距离
  yueqi.x = screenWidth * 0.3;
  yueqi.y = screenHeight * 0.5;
  shenjiu.x = screenWidth * 0.7;
  shenjiu.y = screenHeight * 0.5;

  // 设置初始的发呆计时器
  yueqi.idleTimer = 2000 + Math.random() * 3000;
  shenjiu.idleTimer = 3000 + Math.random() * 3000;

  // === 初始化 UI ===
  const contextMenu = new ContextMenu(null, getVisualScaleForPoint); // 我们将在后续为每个宠物设置养成系统
  const statusBar = new StatusBar();
  const dialogBubble = new DialogBubble();
  const skinTargets = {
    petA: yueqi,
    petB: shenjiu,
    spriteView,
    renderer,
  };
  let skinSwitchInProgress = false;

  async function refreshAvailableSkins() {
    try {
      const skinIds = await window.electronAPI.getAvailableSkins();
      if (Array.isArray(skinIds) && skinIds.length > 0) {
        skinManager.setAvailableSkins(skinIds);
      }
    } catch (err) {
      console.warn('读取可用皮肤列表失败，回退到 default:', err);
    }
  }

  function saveCurrentState() {
    return timeSystem.save(yueqi, shenjiu, skinManager.getCurrentSkin());
  }

  async function applySkinById(skinId, options = {}) {
    if (skinSwitchInProgress) return;
    skinSwitchInProgress = true;
    const shouldPersist = options.persist !== false;

    try {
      const availableSkinIds = skinManager.getAvailableSkins().map(skin => skin.id);
      const nextSkinId = availableSkinIds.includes(skinId) ? skinId : 'default';

      if (interactionOverlayActive) {
        interactionOverlayActive = false;
        renderer.hideOverlay(yueqi, shenjiu);
      }

      await skinManager.applySkin(nextSkinId, skinTargets);
      window.electronAPI.setCurrentSkin(nextSkinId);
      if (shouldPersist) {
        await saveCurrentState();
      }
    } catch (err) {
      console.error('切换皮肤失败:', err);
    } finally {
      skinSwitchInProgress = false;
    }
  }

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

    // 左键点击 = 随机对话
    pet.element.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pet.isBusy() && !dialogBubble.activeBubbles.has(pet.id)) {
        dialogBubble.showIdleChatter(pet);
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
    yueqi.x = screenWidth * 0.3;
    yueqi.y = screenHeight * 0.5;
    shenjiu.x = screenWidth * 0.7;
    shenjiu.y = screenHeight * 0.5;
    pets.forEach(keepPetReachable);
    yueqi.setState('idle');
    shenjiu.setState('idle');
    yueqi.idleTimer = 2000;
    shenjiu.idleTimer = 2000;
  });

  // 隐藏/显示桌宠（来自系统托盘菜单）
  window.electronAPI.onTogglePetVisibility((visible) => {
    const petStage = document.getElementById('pet-stage');
    petStage.style.display = visible ? '' : 'none';
    isPaused = !visible;
  });

  window.electronAPI.onSwitchSkin((skinId) => {
    applySkinById(skinId);
  });

  // === 语言热切换监听 ===
  window.electronAPI.onLocaleChange((newLocale) => {
    window.__currentLocale = newLocale;
    window.t = (key) => translateUi(key, newLocale);
    window.I18N_UI = getI18nUi(newLocale);
    if (typeof initDialogues === 'function') initDialogues(newLocale);
    applyI18n();
  });

  // === 加载保存的状态 ===
  await refreshAvailableSkins();
  const savedState = await timeSystem.load();
  if (savedState) {
    timeSystem.deserializePet(yueqi, savedState.petAData);
    timeSystem.deserializePet(shenjiu, savedState.petBData);

    // 应用离线衰减计算
    if (savedState.offlineMs > CONFIG.DECAY_INTERVAL) {
      nurtureSystemA.applyOfflineDecay(yueqi, savedState.offlineMs);
      nurtureSystemB.applyOfflineDecay(shenjiu, savedState.offlineMs);

      // 显示回归欢迎对话气泡
      const shichensAway = Math.round(savedState.offlineMs / 7200000); // 7200000ms = 2小时 = 1时辰
      if (shichensAway >= 1) {
        const returnMsgYueqi = window.I18N_UI?.returnYueqi
          ? (typeof window.I18N_UI.returnYueqi === 'function'
            ? window.I18N_UI.returnYueqi(shichensAway)
            : window.I18N_UI.returnYueqi)
          : `你走了${shichensAway}个时辰…`;
        const returnMsgShenjiu = window.I18N_UI?.returnShenjiu ?? '…哼，终于回来了。';
        setTimeout(() => {
          dialogBubble.show(yueqi, returnMsgYueqi, 4000);
        }, 1500);
        setTimeout(() => {
          dialogBubble.show(shenjiu, returnMsgShenjiu, 4000);
        }, 3000);
      }
    }
    pets.forEach(keepPetReachable);
  }
  await applySkinById(savedState?.skinId || 'default', { persist: false });

  // === 闲聊计时器 ===
  let chatterTimer = 15000 + Math.random() * 30000;
  // 状态警告专属计时器（比普通闲聊更频繁，确保低状态能触发对话）
  let statWarningTimer = 8000 + Math.random() * 5000;

  // === 游戏主循环 ===
  let lastTime = performance.now();
  let statusUpdateTimer = 0;

  function gameLoop(currentTime) {
    let deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    try {
      if (!isPaused) {
        // --- 修复: 电脑睡眠模式 / 后台挂机的时间跳跃处理 ---
        // 在桌面应用中，如果电脑进入休眠，requestAnimationFrame 会被完全挂起。
        // 当重新唤醒时，这里的 deltaMs（两帧时间差）会变得极其巨大（甚至长达几个小时）。
        // 如果两帧之间间隔过大（例如超过 60 秒），说明刚刚经历了系统休眠或被系统挂起。
        if (deltaMs > 60000) {
          const offlineMs = deltaMs;
          
          // 1. 将这段“跳跃的空白时间”视作离线，一次性结算属性的自然衰减
          nurtureSystemA.applyOfflineDecay(yueqi, offlineMs);
          nurtureSystemB.applyOfflineDecay(shenjiu, offlineMs);

          // 2. 根据跳跃的时间计算出走掉的“时辰”，触发回归特有的欢迎对白
          const shichensAway = Math.floor(offlineMs / 7200000); // 7200000ms = 2小时 = 1时辰
          if (shichensAway >= 1) {
            const returnMsgYueqi = window.I18N_UI?.returnYueqi
              ? (typeof window.I18N_UI.returnYueqi === 'function'
                ? window.I18N_UI.returnYueqi(shichensAway)
                : window.I18N_UI.returnYueqi)
              : `你走了${shichensAway}个时辰…`;
            const returnMsgShenjiu = window.I18N_UI?.returnShenjiu ?? '…哼，终于回来了。';
            setTimeout(() => {
              dialogBubble.show(yueqi, returnMsgYueqi, 4000);
            }, 1500);
            setTimeout(() => {
              dialogBubble.show(shenjiu, returnMsgShenjiu, 4000);
            }, 3000);
          }
          
          // 3. 将本帧的 deltaMs 强行限制在 16ms（约1帧）的正常范围，
          // 防止后续系统的物理移动、动画计时器因为接收到巨大的 deltaMs 发生瞬间暴走（如小人飞出屏幕等 bug）。
          deltaMs = 16;
          
          // 4. 唤醒并结算完毕后，立刻存一次档，保护当前已被衰减的数值状态。
          saveCurrentState();
        }

        // 更新移动
        movementSystem.update(yueqi, deltaMs);
        movementSystem.update(shenjiu, deltaMs);

        // 更新养成状态 (属性衰减)
        nurtureSystemA.update(yueqi, deltaMs);
        nurtureSystemB.update(shenjiu, deltaMs);

        // 检查 CP (组合) 互动
        const interaction = interactionSystem.update(yueqi, shenjiu, deltaMs);
        if (interaction) {
          const overlayKey = interaction.overlayKey || interaction.key;
          const isOverlay = ['kiss', 'hug', 'cultivate', 'shareFood', 'throwup'].includes(overlayKey);
          dialogBubble.removeForPets([yueqi, shenjiu]);

          if (isOverlay) {
            // 显示图片覆盖层，并将气泡锁定到图片中角色头顶
            interactionOverlayActive = true;
            const overlayPos = renderer.showOverlay(yueqi, shenjiu, overlayKey);
            renderer.spawnQiAuraAt(
              overlayPos.x + overlayPos.width / 2,
              overlayPos.y + 82,
              (overlayPos.baseWidth || overlayPos.width) * 1.2,
              overlayKey,
              getVisualScaleForPoint(overlayPos.x + overlayPos.width / 2, overlayPos.y + 82)
            );

            // 从对话库中取台词：沈九在左，岳七在右
            const pool = DIALOGUES[interaction.key];
            const shenjuText = interaction.dialogue?.shenjiu || (pool?.shenjiu?.length
              ? pool.shenjiu[Math.floor(Math.random() * pool.shenjiu.length)]
              : null);
            const yueqiText = interaction.dialogue?.yueqi || (pool?.yueqi?.length
              ? pool.yueqi[Math.floor(Math.random() * pool.yueqi.length)]
              : null);
            renderer.showOverlayBubbles(shenjuText, yueqiText, overlayPos, CONFIG.INTERACTION_DURATION - 500);
          } else {
            // 非图片叠加层的互动：正常气泡 + 漂浮特效
            dialogBubble.showInteraction(yueqi, shenjiu, interaction.key);
            renderer.spawnQiAura(yueqi, interaction.key);
            renderer.spawnQiAura(shenjiu, interaction.key);
          }
        }

        // 互动结束时隐藏覆盖层
        if (interactionOverlayActive && !interactionSystem.isInteracting) {
          interactionOverlayActive = false;
          renderer.hideOverlay(yueqi, shenjiu);
        }

        // 状态警告计时器：优先处理低状态的宠物
        statWarningTimer -= deltaMs;
        if (statWarningTimer <= 0) {
          statWarningTimer = 10000 + Math.random() * 8000;
          // 收集所有处于低状态的宠物
          const warnCandidates = [yueqi, shenjiu].filter(
            pet => !pet.isBusy() && !dialogBubble.activeBubbles.has(pet.id)
                && (pet.isHungry() || pet.isLowQi() || pet.isLowMood())
          );
          if (warnCandidates.length > 0) {
            // 随机挑一个低状态的宠物发言
            const pet = warnCandidates[Math.floor(Math.random() * warnCandidates.length)];
            dialogBubble.showStatWarning(pet);
          }
        }

        // 随机闲聊（仅在状态正常时触发）
        chatterTimer -= deltaMs;
        if (chatterTimer <= 0) {
          chatterTimer = 20000 + Math.random() * 40000;
          const pet = Math.random() > 0.5 ? yueqi : shenjiu;
          if (!pet.isBusy() && !dialogBubble.activeBubbles.has(pet.id)
              && !pet.isHungry() && !pet.isLowQi() && !pet.isLowMood()) {
            dialogBubble.showIdleChatter(pet);
          }
        }

        // 自动保存
        if (timeSystem.update(deltaMs)) {
          saveCurrentState();
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
  window.electronAPI.onSaveBeforeQuit(saveCurrentState);

  // 暴露给 window 以供 debug.js 使用
  window.__DEBUG_PETS = { yueqi, shenjiu };
  window.__DEBUG_SCREEN = () => ({
    ...screenInfo,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    movementWalkAreas: movementSystem.getWalkAreas(),
  });
  window.__DEBUG_DIALOG = dialogBubble;
  window.__DEBUG_RENDERER = renderer;
  window.__DEBUG_SKIN_MANAGER = skinManager;

  console.log('🗡️🪭 岳七 & 沈九 桌面宠物已启动！');
})();

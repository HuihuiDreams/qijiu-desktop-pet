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

  // 设置平台类以便在 CSS 中进行平台特定的样式调整
  const platform = window.electronAPI.platform || 'win32';
  document.body.classList.add(`platform-${platform}`);

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
    taskbarPlatforms: [],
    windowScaleFactor: null,
    displays: [],
    adjacentDisplays: null,
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
  const windowAwarenessSystem = new WindowAwarenessSystem(window.electronAPI, {
    enabled: CONFIG.WINDOW_AWARENESS_ENABLED !== false,
    ttlMs: CONFIG.WINDOW_AWARENESS_PLATFORM_TTL_MS,
  });
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
      taskbarPlatforms: Array.isArray(info.taskbarPlatforms) ? info.taskbarPlatforms : [],
      windowScaleFactor: info.windowScaleFactor,
      displays: Array.isArray(info.displays) ? info.displays : [],
      adjacentDisplays: info.adjacentDisplays || null,
    };
    if (movementSystem) {
      movementSystem.setScreenSize(screenWidth, screenHeight, info.walkAreas);
    }
    pets.forEach(keepPetReachable);
  });
  windowAwarenessSystem.start();

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
      ? [activePlatform, ...screenInfo.taskbarPlatforms]
      : screenInfo.taskbarPlatforms;
  };

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
  yueqi.idleTimer = movementSystem.randomIdleDuration();
  shenjiu.idleTimer = movementSystem.randomIdleDuration();

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

    // 左键点击 = 随机对话 / 久坐提醒点击消失
    pet.element.addEventListener('click', (e) => {
      e.stopPropagation();
      if (breakReminderActive) {
        dismissBreakReminder();
        return;
      }
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
  let breakReminderActive = false;      // 久坐提醒展示中
  let breakReminderDismissTimer = null; // 20秒自动消失计时器

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

  // === 久坐提醒处理 ===
  function dismissBreakReminder() {
    if (!breakReminderActive) return;
    breakReminderActive = false;
    if (breakReminderDismissTimer) {
      clearTimeout(breakReminderDismissTimer);
      breakReminderDismissTimer = null;
    }
    // 清除气泡
    dialogBubble.removeForPets([yueqi, shenjiu]);
    // 恢复状态
    yueqi.setState('idle');
    shenjiu.setState('idle');
    yueqi.idleTimer = 2000;
    shenjiu.idleTimer = 2000;
    // 通知主进程
    window.electronAPI.dismissBreakReminder();
  }

  function handleBreakReminderTriggered(_payload) {
    // 桌宠隐藏或暂停时不展示
    if (isPaused) {
      window.electronAPI.dismissBreakReminder();
      return;
    }
    // 如果已经在展示提醒，忽略
    if (breakReminderActive) return;

    breakReminderActive = true;

    // 清除现有互动覆盖层
    if (interactionOverlayActive) {
      interactionOverlayActive = false;
      renderer.hideOverlay(yueqi, shenjiu);
    }
    // 清除现有气泡
    dialogBubble.removeForPets([yueqi, shenjiu]);

    // 找到主显示器对应的 walkArea 中心
    // walkAreas 是相对于窗口坐标的；主进程会标记 isPrimary。
    const walkAreas = movementSystem ? movementSystem.getWalkAreas() : screenInfo.walkAreas;
    const area = walkAreas.find((wa) => wa.isPrimary)
      || walkAreas[0]
      || { x: 0, y: 0, width: screenWidth, height: screenHeight };

    const petSize = yueqi.size || CONFIG.PET_SIZE;
    const centerX = area.x + area.width / 2;
    const centerY = area.y + area.height / 2;
    const spacing = petSize * 1.5;

    // 瞬移到主显示器中心附近
    yueqi.x = Math.max(area.x, centerX - spacing - petSize / 2);
    yueqi.y = Math.max(area.y, centerY - petSize / 2);
    shenjiu.x = Math.min(area.x + area.width - petSize, centerX + spacing - petSize / 2);
    shenjiu.y = Math.max(area.y, centerY - petSize / 2);

    // 面对面
    yueqi.direction = 'right';
    shenjiu.direction = 'left';

    // 暂停移动
    yueqi.setState('interacting');
    shenjiu.setState('interacting');

    // 立即更新渲染位置
    renderer.update(yueqi);
    renderer.update(shenjiu);
    spriteView.update(yueqi, 0);
    spriteView.update(shenjiu, 0);

    // 从文案池随机选取
    const pool = (typeof DIALOGUES !== 'undefined') ? DIALOGUES.breakReminder : null;
    const yueqiTexts = pool?.yueqi;
    const shenjiuTexts = pool?.shenjiu;
    const yueqiText = Array.isArray(yueqiTexts) && yueqiTexts.length > 0
      ? yueqiTexts[Math.floor(Math.random() * yueqiTexts.length)]
      : '起来活动一下吧！';
    const shenjiuText = Array.isArray(shenjiuTexts) && shenjiuTexts.length > 0
      ? shenjiuTexts[Math.floor(Math.random() * shenjiuTexts.length)]
      : '…别坐太久了。';

    // 显示气泡
    setTimeout(() => {
      if (!breakReminderActive) return;
      dialogBubble.show(yueqi, yueqiText, 18000);
    }, 300);
    setTimeout(() => {
      if (!breakReminderActive) return;
      dialogBubble.show(shenjiu, shenjiuText, 17500);
    }, 800);

    // 20秒后自动消失
    breakReminderDismissTimer = setTimeout(dismissBreakReminder, 20000);
  }

  window.electronAPI.onBreakReminder(handleBreakReminderTriggered);

  // === 语言热切换监听 ===
  window.electronAPI.onLocaleChange((newLocale) => {
    window.__currentLocale = newLocale;
    window.t = (key) => translateUi(key, newLocale);
    window.I18N_UI = getI18nUi(newLocale);
    if (typeof initDialogues === 'function') initDialogues(newLocale);
    applyI18n();
  });

  // === 离线回归结算（统一入口）===
  // 系统唤醒、保存恢复、游戏循环时间跳跃均复用此函数。
  // 负责：属性衰减 → 时辰计算 → 回归气泡 → 即时存档。
  function handleOfflineReturn(offlineMs) {
    nurtureSystemA.applyOfflineDecay(yueqi, offlineMs);
    nurtureSystemB.applyOfflineDecay(shenjiu, offlineMs);

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

    saveCurrentState();
  }

    // === 系统睡眠/唤醒处理 (macOS 专用路径) ===
  // macOS 下 performance.now() 在睡眠期间冻结，导致 rAF 的 deltaMs 不会跳跃，
  // 所以游戏循环内的 deltaMs > 60000 检测永远不会触发。
  // 改用 Electron powerMonitor 事件 + Date.now() 墙钟差值来结算离线衰减。
  window.electronAPI.onSystemSuspend?.(() => {
    saveCurrentState(); // 睡前即时存档，锁定新鲜 timestamp
  });

  window.electronAPI.onSystemResume?.((data) => {
    const offlineMs = data?.offlineMs ?? 0;
    if (offlineMs > CONFIG.DECAY_INTERVAL) {
      handleOfflineReturn(offlineMs);
    }
  });

  // === 加载保存的状态 ===
  await refreshAvailableSkins();
  const savedState = await timeSystem.load();
  if (savedState) {
    timeSystem.deserializePet(yueqi, savedState.petAData);
    timeSystem.deserializePet(shenjiu, savedState.petBData);

    // 应用离线衰减计算
    if (savedState.offlineMs > CONFIG.DECAY_INTERVAL) {
      handleOfflineReturn(savedState.offlineMs);
    }
    pets.forEach(keepPetReachable);
  }
  await applySkinById(savedState?.skinId || 'default', { persist: false });

  // === 闲聊计时器 ===
  let chatterTimer = 15000 + Math.random() * 30000;
  // 状态警告专属计时器（比普通闲聊更频繁，确保低状态能触发对话）
  let statWarningTimer = 8000 + Math.random() * 5000;
  let migrationCooldown = 0; // macOS: 跨屏迁移冷却时间

  // === 游戏主循环 ===
  let lastTime = performance.now();
  let statusUpdateTimer = 0;

  function gameLoop(currentTime) {
    let deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    try {
      if (!isPaused && !breakReminderActive) {
        // --- 修复: 电脑睡眠模式 / 后台挂机的时间跳跃处理 ---
        // 在桌面应用中，如果电脑进入休眠，requestAnimationFrame 会被完全挂起。
        // 当重新唤醒时，这里的 deltaMs（两帧时间差）会变得极其巨大（甚至长达几个小时）。
        // 如果两帧之间间隔过大（例如超过 60 秒），说明刚刚经历了系统休眠或被系统挂起。
        if (deltaMs > 60000) {
          // 时间跳跃（系统休眠等），一次性结算离线衰减 + 回归气泡 + 存档
          handleOfflineReturn(deltaMs);
          
          // 将本帧的 deltaMs 强行限制在 16ms（约1帧）的正常范围，
          // 防止后续系统的物理移动、动画计时器因为接收到巨大的 deltaMs 发生瞬间暴走（如小人飞出屏幕等 bug）。
          deltaMs = 16;
        } else if (deltaMs <= 0 || Number.isNaN(deltaMs)) {
          // 防止休眠唤醒后高精度计时器出现负数、0 或 NaN 导致的物理计算异常（如除以0变成NaN从而隐身）
          deltaMs = 16;
        }

        // 更新移动
        movementSystem.setSurfacePlatforms(getSurfacePlatforms(Date.now()));
        movementSystem.update(yueqi, deltaMs);
        movementSystem.update(shenjiu, deltaMs);

        // 更新养成状态 (属性衰减)
        nurtureSystemA.update(yueqi, deltaMs);
        nurtureSystemB.update(shenjiu, deltaMs);

        // macOS: 检测宠物是否走到屏幕边缘，触发跨屏迁移
        if (migrationCooldown > 0) migrationCooldown -= deltaMs;
        if (window.electronAPI.requestWindowMigration && screenInfo.adjacentDisplays && migrationCooldown <= 0) {
          for (const pet of pets) {
            const migrationDirection = MovementSystem.getEdgeMigrationDirection(
              pet,
              screenWidth,
              screenHeight,
              screenInfo.adjacentDisplays,
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
          // 防交叠移位后，确保宠物仍在可行走区域内
          movementSystem.clampPetToWalkAreas(yueqi);
          movementSystem.clampPetToWalkAreas(shenjiu);
          // 确保他们仍然面对面 (因为 clamp 可能改变相对 x 坐标)
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
    windowAwareness: windowAwarenessSystem.getDebugInfo(),
  });
  window.__DEBUG_DIALOG = dialogBubble;
  window.__DEBUG_RENDERER = renderer;
  window.__DEBUG_SPRITE_VIEW = spriteView;
  window.__DEBUG_SKIN_MANAGER = skinManager;
  window.__DEBUG_MOVEMENT = movementSystem;
  window.__DEBUG_WINDOW_AWARENESS = windowAwarenessSystem;
  window.__DEBUG_BREAK_REMINDER = {
    trigger: () => {
      handleBreakReminderTriggered({ triggeredAt: Date.now(), intervalMinutes: 60 });
    },
  };

  console.log('🗡️🪭 岳七 & 沈九 桌面宠物已启动！');
})();

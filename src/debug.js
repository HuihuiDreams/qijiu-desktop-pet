/**
 * debug.js — 开发调试工具
 * 仅在开发阶段使用。提供全局 testKiss() 等辅助函数，可在 DevTools Console 调用。
 *
 * 用法：在 DevTools Console 输入 testKiss() 并回车。
 */

if (!window.location.href.includes('app.asar')) {

window.testInteraction = function (type = 'kiss') {
  const forceShareFood = arguments[1] === true;
  if (!window.__DEBUG_PETS || !window.__DEBUG_RENDERER) {
    console.warn('[debug] 调试变量未就绪，请确保应用已完全启动');
    return;
  }

  const validOverlayTypes = ['kiss', 'hug', 'cultivate', 'shareFood', 'throwup'];
  if (!validOverlayTypes.includes(type)) {
    console.warn(`[debug] unsupported interaction overlay: ${type}. Use one of: ${validOverlayTypes.join(', ')}`);
    return;
  }

  const { yueqi: petAObj, shenjiu: petBObj } = window.__DEBUG_PETS;
  const renderer = window.__DEBUG_RENDERER;
  let overlayType = type;
  let debugDialogue = null;

  if (type === 'shareFood' && !forceShareFood && petBObj.stats.hunger + CONFIG.INTERACTIONS.shareFood.hungerB > 100) {
    overlayType = 'throwup';
    const throwupPool = (typeof DIALOGUES !== 'undefined') ? DIALOGUES.throwup : null;
    const pick = (arr) => (Array.isArray(arr) && arr.length > 0) ? arr[Math.floor(Math.random() * arr.length)] : null;
    debugDialogue = {
      yueqi: throwupPool ? pick(throwupPool.yueqi) : '小九你怎么了？',
      shenjiu: throwupPool ? pick(throwupPool.shenjiu) : '呕~~你要撑死我吗？！',
    };
  }

  // 清除旧的覆盖层（如果有）
  const existingOverlay = document.getElementById('interaction-overlay');
  if (existingOverlay) existingOverlay.remove();
  document.querySelectorAll('.overlay-bubble').forEach(el => el.remove());

  // 定身，防止走动
  petAObj.setState('interacting');
  petBObj.setState('interacting');

  // 通过 renderer 创建覆盖层，获取图片绝对坐标（已内置隐藏身体）
  const overlayPos = renderer.showOverlay(petAObj, petBObj, overlayType);

  // 用正确的坐标在图片人物头顶生成气泡
  const pool = (typeof DIALOGUES !== 'undefined') ? DIALOGUES[type] : null;
  const shenjuText = debugDialogue?.shenjiu || (pool?.shenjiu?.length
    ? pool.shenjiu[Math.floor(Math.random() * pool.shenjiu.length)]
    : null);
  const yueqiText = debugDialogue?.yueqi || (pool?.yueqi?.length
    ? pool.yueqi[Math.floor(Math.random() * pool.yueqi.length)]
    : null);
  renderer.showOverlayBubbles(shenjuText, yueqiText, overlayPos, 3500);

  console.log(`[debug] ${type} overlay 显示中，4秒后自动隐藏`);

  // 4秒后恢复
  setTimeout(() => {
    renderer.hideOverlay(petAObj, petBObj);
    document.querySelectorAll('.overlay-bubble').forEach(el => el.remove());
    petAObj.setState('idle');
    petBObj.setState('idle');
    console.log(`[debug] ${type} overlay 已隐藏，宠物已恢复显示`);
  }, 4000);
};

window.testKiss = () => window.testInteraction('kiss');
window.testHug = () => window.testInteraction('hug');
window.testCultivate = () => window.testInteraction('cultivate');
window.testShareFood = () => window.testInteraction('shareFood', true);
window.testsharefood = window.testShareFood;
window.testGreet = function () {
  if (!window.__DEBUG_PETS || !window.__DEBUG_DIALOG || !window.__DEBUG_RENDERER || !window.__DEBUG_SPRITE_VIEW) {
    console.warn('[debug] 调试对象尚未准备好，请确认应用已完成启动');
    return;
  }

  const { yueqi: petAObj, shenjiu: petBObj } = window.__DEBUG_PETS;
  const dialogBubble = window.__DEBUG_DIALOG;
  const renderer = window.__DEBUG_RENDERER;
  const spriteView = window.__DEBUG_SPRITE_VIEW;

  const existingOverlay = document.getElementById('interaction-overlay');
  if (existingOverlay) existingOverlay.remove();
  document.querySelectorAll('.overlay-bubble').forEach(el => el.remove());
  dialogBubble.removeForPets([petAObj, petBObj]);

  petAObj.setState('interacting');
  petBObj.setState('interacting');

  if (petAObj.x < petBObj.x) {
    petAObj.direction = 'right';
    petBObj.direction = 'left';
  } else {
    petAObj.direction = 'left';
    petBObj.direction = 'right';
  }

  renderer.update(petAObj);
  renderer.update(petBObj);
  spriteView.update(petAObj, 0);
  spriteView.update(petBObj, 0);

  dialogBubble.showInteraction(petAObj, petBObj, 'greet');
  renderer.spawnQiAura(petAObj, 'greet');
  renderer.spawnQiAura(petBObj, 'greet');

  console.log('[debug] greet 互动显示中（4秒后自动结束）');

  setTimeout(() => {
    dialogBubble.removeForPets([petAObj, petBObj]);
    petAObj.setState('idle');
    petBObj.setState('idle');
    console.log('[debug] greet 互动已结束，宠物已恢复待机');
  }, 4000);
};
window.testShareFoodThrowup = () => {
  if (!window.__DEBUG_PETS) return;
  window.__DEBUG_PETS.shenjiu.stats.hunger = 91;
  window.testInteraction('shareFood');
};


window.testRecoverStats = () => {
  if (!window.__DEBUG_PETS) return;
  Object.values(window.__DEBUG_PETS).forEach((pet) => {
    pet.stats.hunger = 80;
    pet.stats.qi = 80;
    pet.stats.mood = 80;
  });
  console.log('[debug] 宠物属性已全部恢复正常水准');
};

window.testHungryHeat = () => {
  window.testHungry(15);
  return typeof window.testWeatherHeat === 'function' ? window.testWeatherHeat() : null;
};


window.probeWindowAwareness = async function () {
  const renderer = typeof window.__DEBUG_SCREEN === 'function'
    ? window.__DEBUG_SCREEN()?.windowAwareness
    : null;
  let main = null;
  try {
    main = await window.electronAPI?.getActiveWindowInfo?.();
  } catch (error) {
    console.error('[debug] Window Awareness probe failed:', error);
  }

  const result = {
    captured: Boolean(main?.active && main?.platform),
    reason: main?.reason || null,
    main,
    renderer,
  };
  window.__LAST_WINDOW_AWARENESS_PROBE = result;
  console.log(`[debug] Window Awareness probe:\n${JSON.stringify(result, null, 2)}`);
  return result;
};

window.explainWindowAwareness = async function () {
  const probe = await window.probeWindowAwareness();
  const screenInfo = typeof window.__DEBUG_SCREEN === 'function' ? window.__DEBUG_SCREEN() : {};
  const movement = window.__DEBUG_MOVEMENT;
  const pets = window.__DEBUG_PETS || {};
  const platform = probe.main?.platform || probe.renderer?.platform || null;
  const petResults = Object.entries(pets).map(([id, pet]) => {
    const range = platform && movement
      ? movement.getReachableTargetRange(platform, pet, CONFIG.WALK_TARGET_MARGIN)
      : null;
    return {
      id,
      size: pet.size,
      reachable: Boolean(range),
      range,
    };
  });
  const result = {
    ok: Boolean(probe.main?.active && platform && petResults.some((pet) => pet.reachable)),
    captured: Boolean(probe.main?.active),
    reason: probe.main?.reason || (platform ? null : 'missing-platform'),
    activeWindow: probe.main?.window || null,
    platform,
    pets: petResults,
    walkAreas: screenInfo.movementWalkAreas || screenInfo.walkAreas || [],
    note: null,
  };

  if (result.captured && platform && !result.ok) {
    result.reason = 'unreachable-platform';
    result.note = '窗口可能太贴近屏幕顶部，宠物身体没有空间站到窗口上方。把窗口往下拖一点再试。';
  } else if (result.captured && !platform) {
    result.note = '窗口已抓到，但没有生成 platform；通常是最大化、最小化、全屏、bounds 无效或窗口太小。';
  } else if (!result.captured) {
    result.note = '没有抓到可用活动窗口；请确认前台是普通非最大化窗口，并重试。';
  }

  window.__LAST_WINDOW_AWARENESS_EXPLANATION = result;
  console.log(`[debug] Window Awareness explanation:\n${JSON.stringify(result, null, 2)}`);
  return result;
};

window.testWindowAwareness = async function (options = {}) {
  if (!window.__DEBUG_PETS || !window.__DEBUG_MOVEMENT || !window.__DEBUG_WINDOW_AWARENESS) {
    console.warn('[debug] Window Awareness 调试对象未就绪，请等应用完全启动后再试');
    return null;
  }

  const screenInfo = typeof window.__DEBUG_SCREEN === 'function' ? window.__DEBUG_SCREEN() : {};
  const probe = await window.probeWindowAwareness();
  let info = probe.main;
  if (!info) try {
    info = await window.electronAPI?.getActiveWindowInfo?.();
  } catch (error) {
    console.warn('[debug] 读取真实活动窗口失败，将使用模拟平台:', error);
  }

  let platform = options.platform || info?.platform || null;
  let mode = 'real';
  if (!platform || options.simulate === true) {
    if (options.simulate !== true && !options.platform) {
      console.warn('[debug] 没有抓到真实活动窗口；请先切到一个普通窗口再执行 testWindowAwareness()，或用 testWindowAwareness({ simulate: true }) 测试移动链路。', {
        reason: info?.reason || 'missing-platform',
        info,
      });
      return { mode: 'unavailable', reason: info?.reason || 'missing-platform', info };
    }
    const width = Math.min(720, Math.max(240, (screenInfo.innerWidth || window.innerWidth) - 240));
    platform = {
      x: Math.max(80, Math.round(((screenInfo.innerWidth || window.innerWidth) - width) / 2)),
      y: 96,
      width,
      height: 48,
      source: 'active-window-top',
    };
    info = {
      active: true,
      sampledAt: Date.now(),
      source: 'debug-simulated',
      window: {
        id: 'debug-window-awareness',
        title: 'Debug Window Awareness',
        ownerName: 'DevTools',
        bounds: { x: platform.x, y: platform.y + 24, width: platform.width, height: 480 },
        isMinimized: false,
        isMaximized: false,
        isFullScreen: false,
      },
      platform,
    };
    mode = 'simulated';
  }

  window.__DEBUG_WINDOW_AWARENESS.setActiveWindowInfo(info);
  window.__DEBUG_MOVEMENT.setActivePlatform(platform);

  Object.values(window.__DEBUG_PETS).forEach((pet, index) => {
    pet.isDragging = false;
    pet.setState('idle');
    pet.idleTimer = 0;
    if (options.reposition === true) {
      pet.x = platform.x + 24 + index * Math.min(160, Math.max(80, platform.width / 3));
      pet.y = platform.y + 180 + index * 24;
    }
    window.__DEBUG_MOVEMENT.randomTarget(pet);
    pet.direction = pet.targetX > pet.x ? 'right' : 'left';
    pet.setState('walking');
  });

  console.log(`[debug] Window Awareness ${mode} test started`, { platform, info });
  return { mode, platform, info };
};

window.debugTaskbarPlatforms = function () {
  const screenInfo = typeof window.__DEBUG_SCREEN === 'function' ? window.__DEBUG_SCREEN() : null;
  const result = {
    captured: Boolean(screenInfo?.taskbarPlatforms?.length),
    taskbarPlatforms: screenInfo?.taskbarPlatforms || [],
    walkAreas: screenInfo?.movementWalkAreas || screenInfo?.walkAreas || [],
    surfaceEnabled: screenInfo?.windowAwareness?.enabled !== false
      && screenInfo?.windowAwareness?.info?.reason !== 'disabled',
  };
  window.__LAST_TASKBAR_PLATFORM_PROBE = result;
  console.log(`[debug] Taskbar platforms:\n${JSON.stringify(result, null, 2)}`);
  return result;
};

window.testTaskbarAwareness = function (options = {}) {
  if (!window.__DEBUG_PETS || !window.__DEBUG_MOVEMENT) {
    console.warn('[debug] Taskbar Awareness 调试对象未就绪，请等应用完全启动后再试');
    return null;
  }

  const screenInfo = typeof window.__DEBUG_SCREEN === 'function' ? window.__DEBUG_SCREEN() : {};
  const probe = window.debugTaskbarPlatforms();
  let platform = options.platform || probe.taskbarPlatforms?.[0] || null;
  let mode = 'real';

  if (!platform || options.simulate === true) {
    if (!platform && options.requireReal === true) {
      console.warn('[debug] 没有抓到真实任务栏平台。请确认是在 Windows、任务栏为底部横向且未自动隐藏。', probe);
      return { mode: 'unavailable', reason: 'missing-taskbar-platform', probe };
    }

    const areas = Array.isArray(screenInfo.movementWalkAreas) && screenInfo.movementWalkAreas.length > 0
      ? screenInfo.movementWalkAreas
      : [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }];
    const area = areas
      .slice()
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
    platform = {
      x: area.x,
      y: area.y + area.height - 24,
      width: area.width,
      height: 48,
      scaleRatio: area.scaleRatio || 1,
      source: 'taskbar-edge',
      displayId: 'debug-simulated-taskbar',
    };
    mode = 'simulated';
  }

  window.__DEBUG_MOVEMENT.setSurfacePlatforms([platform]);

  Object.values(window.__DEBUG_PETS).forEach((pet, index) => {
    pet.isDragging = false;
    pet.setState('idle');
    pet.idleTimer = 0;
    if (options.reposition === true) {
      pet.x = platform.x + 24 + index * Math.min(160, Math.max(80, platform.width / 3));
      pet.y = Math.max(0, platform.y - pet.size - 120);
    }
    const margin = 24;
    const range = window.__DEBUG_MOVEMENT.getReachableTargetRange(platform, pet, margin) || window.__DEBUG_MOVEMENT.getTargetRange(platform, pet, margin);
    pet.targetArea = platform;
    pet.targetX = range.minX + Math.random() * Math.max(0, range.maxX - range.minX);
    pet.targetY = range.minY;
    pet.direction = pet.targetX > pet.x ? 'right' : 'left';
    pet.setState('walking');
  });

  const result = { mode, platform, probe };
  window.__LAST_TASKBAR_AWARENESS_TEST = result;
  console.log(`[debug] Taskbar Awareness ${mode} test started`, result);
  return result;
};

window.testHungry = function() {
  if (!window.__DEBUG_PETS) {
    console.warn('[debug] 调试变量未就绪，请确保应用已完全启动');
    return;
  }

  const { shenjiu } = window.__DEBUG_PETS;
  
  // 保存原来的饱腹度
  const originalHunger = shenjiu.stats.hunger;
  
  // 设置为极度饥饿，触发条件 (hunger < 25)
  shenjiu.stats.hunger = 10;
  
  // 强制进入 idle 状态，并延长发呆时间，以确保能看清图片
  shenjiu.setState('idle');
  shenjiu.idleTimer = 5000; 
  
  console.log('[debug] 已将沈九的饱腹度设置为 10，他现在应该会显示肚子饿的图片了。5秒后自动恢复。');
  
  // 5秒后恢复
  setTimeout(() => {
    shenjiu.stats.hunger = originalHunger;
    console.log(`[debug] 5秒已过，沈九的饱腹度已恢复为 ${originalHunger}。`);
  }, 5000);
};

/**
 * 久坐提醒调试入口。
 * 在 DevTools Console 中调用 testBreakReminder() 即可触发。
 * 走的是与真实 IPC 相同的 renderer 表现路径。
 */
window.testBreakReminder = function () {
  if (!window.electronAPI?.onBreakReminder) {
    console.warn('[debug] 久坐提醒 API 未就绪。');
    return;
  }
  // 直接发送模拟的 break-reminder-triggered IPC 事件
  // 通过 window.__DEBUG_BREAK_REMINDER 公开的 trigger 方法
  if (window.__DEBUG_BREAK_REMINDER && typeof window.__DEBUG_BREAK_REMINDER.trigger === 'function') {
    window.__DEBUG_BREAK_REMINDER.trigger();
    console.log('[debug] 久坐提醒已触发（走 renderer 表现路径）。20秒后自动消失，或点击小人提前关闭。');
  } else {
    console.warn('[debug] __DEBUG_BREAK_REMINDER 未就绪，请确认应用已完全启动。');
  }
};

function setDebugWeather(weatherKind, options = {}) {
  if (!window.__DEBUG_WEATHER || typeof window.__DEBUG_WEATHER.set !== 'function') {
    console.warn('[debug] 天气调试对象未就绪，请确认应用已完全启动。');
    return null;
  }

  const payload = {
    weatherKind,
    intensity: options.intensity || 'normal',
    timePhase: options.timePhase || 'day',
    isDay: options.isDay !== false,
    windIntensity: options.windIntensity,
    windSpeed: options.windSpeed,
    windGusts: options.windGusts,
  };
  const state = typeof window.__DEBUG_WEATHER.force === 'function'
    ? window.__DEBUG_WEATHER.force(weatherKind, payload)
    : window.__DEBUG_WEATHER.set(payload);
  const particleCount = document.querySelectorAll('.weather-particle').length;
  console.log('[debug] weather effect applied', { state, particleCount });
  return { state, particleCount };
}

window.testWeatherClear = function () {
  return setDebugWeather('clear', { intensity: 'none', timePhase: 'day', isDay: true });
};

window.testWeatherCloudy = function () {
  return setDebugWeather('cloudy', { intensity: 'normal', timePhase: 'day', isDay: true });
};

window.testWeatherRain = function (intensity = 'heavy') {
  return setDebugWeather('rain', { intensity, timePhase: 'day', isDay: true });
};

window.testWeatherSnow = function (intensity = 'medium') {
  return setDebugWeather('snow', { intensity, timePhase: 'day', isDay: true });
};

window.testWeatherWindy = function (windIntensity = 'normal') {
  return setDebugWeather('windy', { intensity: 'normal', windIntensity, timePhase: 'day', isDay: true });
};

window.testWeatherThunderstorm = function (intensity = 'heavy') {
  return setDebugWeather('thunderstorm', { intensity, timePhase: 'day', isDay: true });
};

window.testWeatherHeat = function () {
  return setDebugWeather('heat', { intensity: 'normal', timePhase: 'day', isDay: true });
};

window.testWeatherRainWind = function (intensity = 'heavy', windIntensity = 'normal') {
  return setDebugWeather('rain', { intensity, windIntensity, timePhase: 'day', isDay: true });
};


window.clearWeatherEffect = function () {
  if (!window.__DEBUG_WEATHER || typeof window.__DEBUG_WEATHER.clear !== 'function') {
    console.warn('[debug] 天气调试对象未就绪，请确认应用已完全启动。');
    return null;
  }
  const state = window.__DEBUG_WEATHER.clear();
  console.log('[debug] weather effect cleared', { state });
  return state;
};


console.log('[debug] 调试工具已加载。在 DevTools Console 输入 testGreet(), testKiss(), testHug(), testCultivate(), testShareFood(), testHungry(), testBreakReminder(), testWeatherEffects(), testWeatherRain(), testWeatherSnow(), testWeatherWindy(), testWeatherThunderstorm(), debugTaskbarPlatforms() 或 testTaskbarAwareness() 来测试效果。');

} // End of app.asar check


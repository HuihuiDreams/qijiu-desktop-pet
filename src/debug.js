/**
 * debug.js — 开发调试工具
 * 仅在开发阶段使用。提供全局 testKiss() 等辅助函数，可在 DevTools Console 调用。
 *
 * 用法：在 DevTools Console 输入 testKiss() 并回车。
 */

window.testInteraction = function (type) {
  if (!window.__DEBUG_PETS || !window.__DEBUG_RENDERER) {
    console.warn('[debug] 调试变量未就绪，请确保应用已完全启动');
    return;
  }

  const { yueqi: petAObj, shenjiu: petBObj } = window.__DEBUG_PETS;
  const renderer = window.__DEBUG_RENDERER;
  let overlayType = type;
  let debugDialogue = null;

  if (type === 'shareFood' && petBObj.stats.hunger + CONFIG.INTERACTIONS.shareFood.hungerB > 100) {
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
window.testShareFood = () => window.testInteraction('shareFood');
window.testsharefood = window.testShareFood;
window.testShareFoodThrowup = () => {
  if (!window.__DEBUG_PETS) return;
  window.__DEBUG_PETS.shenjiu.stats.hunger = 91;
  window.testInteraction('shareFood');
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

console.log('[debug] 调试工具已加载。在 DevTools Console 输入 testKiss(), testHug(), testCultivate(), testShareFood() 或 testHungry() 来测试效果。');

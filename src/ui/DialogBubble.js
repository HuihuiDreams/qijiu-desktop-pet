/**
 * DialogBubble — 显示在宠物头上方的对话气泡。
 */
const PERSONAL_BUBBLE_OVERLAP_GAP = 8;

class DialogBubble {
  constructor() {
    this.activeBubbleTimers = new Map(); // petId -> scheduled fade/remove timers
    this.activeBubbles = new Map(); // petId -> bubble element 气泡元素映射
  }

  /**
   * 在宠物上方显示一个对话气泡。
   * @param {Pet} pet - 要显示气泡的宠物对象
   * @param {string} text - 要显示的文本
   * @param {number} duration - 显示时长 (毫秒), 默认 3000
   * @param {number} offsetX - X轴偏移量 (像素)，用于覆盖层互动修正位置
   */
  show(pet, text, duration = 3000, offsetX = 0) {
    // 移除该宠物现有的对话气泡
    this.remove(pet.id);

    if (!pet.element) return;

    const bubble = document.createElement('div');
    bubble.className = 'dialog-bubble';
    bubble.textContent = text;
    
    if (offsetX !== 0) {
      bubble.style.left = `calc(50% + ${offsetX}px)`;
    }
    
    pet.element.appendChild(bubble);

    this.activeBubbles.set(pet.id, bubble);
    this.avoidPersonalBubbleOverlap(pet.id, bubble);

    // 在移除前开始淡出动画
    const fadeDelay = Math.max(0, duration - 500);

    const fadeTimer = setTimeout(() => {
      if (this.activeBubbles.get(pet.id) === bubble) {
        bubble.classList.add('dialog-bubble--fade-out');
      }
    }, fadeDelay);

    // 显示时间结束后移除气泡
    const removeTimer = setTimeout(() => {
      if (this.activeBubbles.get(pet.id) === bubble) {
        this.remove(pet.id);
      }
    }, duration);

    this.activeBubbleTimers.set(pet.id, { fadeTimer, removeTimer });
  }

  /**
   * 移除特定宠物的对话气泡。
   */
  remove(petId) {
    const timers = this.activeBubbleTimers.get(petId);
    if (timers) {
      clearTimeout(timers.fadeTimer);
      clearTimeout(timers.removeTimer);
      this.activeBubbleTimers.delete(petId);
    }

    const bubble = this.activeBubbles.get(petId);
    if (bubble) {
      bubble.remove();
      this.activeBubbles.delete(petId);
    }
  }

  removeForPets(pets) {
    pets.forEach((pet) => this.remove(pet.id));
  }

  avoidPersonalBubbleOverlap(petId, bubble) {
    if (!bubble || typeof bubble.getBoundingClientRect !== 'function') return;

    let rect = bubble.getBoundingClientRect();
    let stackOffset = 0;

    for (const [otherPetId, otherBubble] of this.activeBubbles.entries()) {
      if (otherPetId === petId || !otherBubble || typeof otherBubble.getBoundingClientRect !== 'function') {
        continue;
      }

      const otherRect = otherBubble.getBoundingClientRect();
      if (!DialogBubble.rectsOverlap(rect, otherRect)) continue;

      const lift = rect.bottom - otherRect.top + PERSONAL_BUBBLE_OVERLAP_GAP;
      if (lift <= 0) continue;

      stackOffset += lift;
      rect = {
        left: rect.left,
        right: rect.right,
        top: rect.top - lift,
        bottom: rect.bottom - lift,
      };
    }

    if (stackOffset > 0) {
      if (typeof bubble.style?.setProperty === 'function') {
        bubble.style.setProperty('--bubble-stack-offset', `${Math.ceil(stackOffset)}px`);
      } else if (bubble.style) {
        bubble.style['--bubble-stack-offset'] = `${Math.ceil(stackOffset)}px`;
      }
    }
  }

  static rectsOverlap(a, b) {
    return a.left < b.right
      && a.right > b.left
      && a.top < b.bottom
      && a.bottom > b.top;
  }

  /**
   * 显示宠物的随机闲聊文本。
   */
  showIdleChatter(pet) {
    let pool = DIALOGUES.idle[pet.id];
    
    // 有 30% 的概率尝试使用天气相关台词
    if (pet.weatherKind && pet.weatherKind !== 'unknown' && Math.random() < 0.3) {
      const weatherKey = `weather_${pet.weatherKind}`;
      if (DIALOGUES[weatherKey] && DIALOGUES[weatherKey][pet.id]) {
        pool = DIALOGUES[weatherKey][pet.id];
      }
    }

    if (!pool || pool.length === 0) return;
    const text = pool[Math.floor(Math.random() * pool.length)];
    this.show(pet, text, 4000);
  }

  /**
   * 显示状态过低的警告对话气泡。
   */
  showStatWarning(pet) {
    let pool = null;
    if (pet.isHungry()) pool = DIALOGUES.hungry[pet.id];
    else if (pet.isLowQi()) pool = DIALOGUES.lowQi[pet.id];
    else if (pet.isLowMood()) pool = DIALOGUES.lowMood[pet.id];

    if (pool && pool.length > 0) {
      const text = pool[Math.floor(Math.random() * pool.length)];
      this.show(pet, text, 4000);
    }
  }

  /**
   * 显示两只宠物互动时的双人对话。
   */
  showInteraction(petA, petB, interactionKey) {
    const dialoguesA = DIALOGUES[interactionKey]?.yueqi;
    const dialoguesB = DIALOGUES[interactionKey]?.shenjiu;

    // 确定哪个是岳七，哪个是沈九
    const yueqi = petA.id === 'yueqi' ? petA : petB;
    const shenjiu = petA.id === 'shenjiu' ? petA : petB;

    let offsetA = 0;
    let offsetB = 0;
    
    // 如果是全局覆盖层互动，由于原本宠物的 div 并没有移动，只是图片居中了
    // 我们需要通过 offsetX 把气泡向中心聚拢，使其对准覆盖层里的人物头部
    if (['kiss', 'hug', 'cultivate'].includes(interactionKey)) {
        const leftPet = petA.x < petB.x ? petA : petB;
        const rightPet = petA.x < petB.x ? petB : petA;
        
        const size = leftPet.size || 96;
        const cx = (leftPet.x + rightPet.x) / 2 + size / 2;
        
        // 假设图片是220px宽，中心点是cx，两个人分别在 cx - 45 和 cx + 45 左右
        const targetLeft = cx - 45;
        const targetRight = cx + 45;
        
        const currentCenterLeft = leftPet.x + size / 2;
        const currentCenterRight = rightPet.x + size / 2;
        
        const shiftLeft = targetLeft - currentCenterLeft;
        const shiftRight = targetRight - currentCenterRight;
        
        if (yueqi === leftPet) {
            offsetA = shiftLeft;
            offsetB = shiftRight;
        } else {
            offsetB = shiftLeft;
            offsetA = shiftRight;
        }
    }

    if (dialoguesA && dialoguesA.length > 0) {
      const text = dialoguesA[Math.floor(Math.random() * dialoguesA.length)];
      this.show(yueqi, text, CONFIG.INTERACTION_DURATION - 500, offsetA);
    }

    // 同时显示沈九的回应
    if (dialoguesB && dialoguesB.length > 0) {
      const text = dialoguesB[Math.floor(Math.random() * dialoguesB.length)];
      this.show(shenjiu, text, CONFIG.INTERACTION_DURATION - 500, offsetB);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { DialogBubble };
}

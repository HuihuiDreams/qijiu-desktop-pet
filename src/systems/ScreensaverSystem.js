/**
 * src/systems/ScreensaverSystem.js
 * CP 屏保渲染进程状态机与控制系统。
 * 状态机流程：inactive | entering | performing | caught | runningBack
 */

let ScreensaverParticleLayerClass = null;
const CAUGHT_INDICATOR_DURATION_MS = 800;
if (typeof ScreensaverParticleLayer !== 'undefined') {
  ScreensaverParticleLayerClass = ScreensaverParticleLayer;
} else if (typeof require !== 'undefined') {
  try {
    const mod = require('../ui/ScreensaverParticleLayer');
    ScreensaverParticleLayerClass = mod.ScreensaverParticleLayer || mod;
  } catch (e) {
    // Ignore error
  }
}

class ScreensaverSystem {
  constructor(deps = {}) {
    this.electronAPI = deps.electronAPI || null;
    this.stageGeometry = deps.stageGeometry || null;
    this.renderer = deps.renderer || null;
    this.spriteView = deps.spriteView || null;
    this.getPets = typeof deps.getPets === 'function' ? deps.getPets : (() => []);
    this.interactionSystem = deps.interactionSystem || null;
    this.dialogBubble = deps.dialogBubble || null;
    this.clearInteractionOverlay = typeof deps.clearInteractionOverlay === 'function'
      ? deps.clearInteractionOverlay
      : null;
    this.skinManager = deps.skinManager || null;
    this.particleLayer = deps.particleLayer || null;

    this.state = 'inactive';
    this.sessionId = 0;
    this.stateTimer = 0;
    this.caughtIndicatorAwaitingPaint = false;
    this.startPositions = null;
    this.sceneBounds = null;

    this.activeComboSequence = null;
    this.comboIndex = 0;
    this.comboStepState = null; // 'preparing' | 'idle_pause' | 'overlay_action' | 'waiting_for_input'
    this.comboStepTimer = 0;

    this.runningBackStartCoords = null;
    this.runningBackTargetCoords = null;
    this.runningBackDuration = 0;
    this.runningBackElapsed = 0;

    this.unsubscribeStart = null;
    this.unsubscribeStop = null;
    this.unsubscribeCancel = null;
  }

  /**
   * 初始化 / 更新依赖与 IPC 订阅。
   */
  init(deps = {}) {
    if (deps.electronAPI) this.electronAPI = deps.electronAPI;
    if (deps.stageGeometry) this.stageGeometry = deps.stageGeometry;
    if (deps.renderer) this.renderer = deps.renderer;
    if (deps.spriteView) this.spriteView = deps.spriteView;
    if (typeof deps.getPets === 'function') this.getPets = deps.getPets;
    if (deps.interactionSystem) this.interactionSystem = deps.interactionSystem;
    if (deps.dialogBubble) this.dialogBubble = deps.dialogBubble;
    if (typeof deps.clearInteractionOverlay === 'function') {
      this.clearInteractionOverlay = deps.clearInteractionOverlay;
    }
    if (deps.skinManager) this.skinManager = deps.skinManager;
    if (deps.particleLayer) this.particleLayer = deps.particleLayer;

    this.detachSubscriptions();

    if (this.electronAPI) {
      if (typeof this.electronAPI.onScreensaverStart === 'function') {
        this.unsubscribeStart = this.electronAPI.onScreensaverStart((payload) => this.onStart(payload));
      }
      if (typeof this.electronAPI.onScreensaverStop === 'function') {
        this.unsubscribeStop = this.electronAPI.onScreensaverStop((payload) => this.onStop(payload));
      }
      if (typeof this.electronAPI.onScreensaverCancel === 'function') {
        this.unsubscribeCancel = this.electronAPI.onScreensaverCancel((payload) => this.onCancel(payload));
      }

      if (typeof this.electronAPI.notifyScreensaverReady === 'function') {
        this.electronAPI.notifyScreensaverReady();
      }
    }

    return this;
  }

  detachSubscriptions() {
    if (typeof this.unsubscribeStart === 'function') this.unsubscribeStart();
    if (typeof this.unsubscribeStop === 'function') this.unsubscribeStop();
    if (typeof this.unsubscribeCancel === 'function') this.unsubscribeCancel();
    this.unsubscribeStart = null;
    this.unsubscribeStop = null;
    this.unsubscribeCancel = null;
  }

  getParticleLayer() {
    if (!this.particleLayer) {
      if (ScreensaverParticleLayerClass) {
        const stage = (this.renderer && this.renderer.stage)
          ? this.renderer.stage
          : (typeof document !== 'undefined' ? document.body : null);
        this.particleLayer = new ScreensaverParticleLayerClass(stage);
      }
    }
    return this.particleLayer;
  }

  /**
   * 检查屏保状态机是否处于活跃状态（非 inactive）。
   * @returns {boolean}
   */
  isActive() {
    return this.state !== 'inactive';
  }

  /**
   * 根据两只宠物的视觉中点，寻找所在显示器的 walkArea。
   * 计算安全缩放比例 (0.65 – 1.0)。若面积不足 (< 0.65) 或无有效区域，返回 null。
   */
  computeSceneBounds() {
    const pets = this.getPets();
    const petA = Array.isArray(pets) && pets[0] ? pets[0] : { x: 100, y: 100, size: 100 };
    const petB = Array.isArray(pets) && pets[1] ? pets[1] : { x: 300, y: 100, size: 100 };

    const sizeA = petA.size || petA.width || 100;
    const sizeB = petB.size || petB.width || 100;

    const centerA = { x: (petA.x || 0) + sizeA / 2, y: (petA.y || 0) + sizeA / 2 };
    const centerB = { x: (petB.x || 0) + sizeB / 2, y: (petB.y || 0) + sizeB / 2 };

    const midX = (centerA.x + centerB.x) / 2;
    const midY = (centerA.y + centerB.y) / 2;

    const PADDING_X = 40;
    const PADDING_Y = 40;
    const BASE_WIDTH = 320;
    const BASE_HEIGHT = 200;

    let targetArea = null;
    if (this.stageGeometry) {
      if (typeof this.stageGeometry.getWalkAreaForPoint === 'function') {
        targetArea = this.stageGeometry.getWalkAreaForPoint(midX, midY);
        if (!targetArea) {
          targetArea = this.stageGeometry.getWalkAreaForPoint(centerA.x, centerA.y);
        }
      }
      if (!targetArea && Array.isArray(this.stageGeometry.screenInfo?.walkAreas) && this.stageGeometry.screenInfo.walkAreas.length > 0) {
        targetArea = this.stageGeometry.screenInfo.walkAreas[0];
      }
      if (!targetArea) {
        return null;
      }
    } else {
      targetArea = { x: 0, y: 0, width: 800, height: 600, scaleRatio: 1.0 };
    }

    const availWidth = targetArea.width - PADDING_X;
    const availHeight = targetArea.height - PADDING_Y;

    if (availWidth <= 0 || availHeight <= 0) {
      return null;
    }

    const rawScaleX = availWidth / BASE_WIDTH;
    const rawScaleY = availHeight / BASE_HEIGHT;
    const rawScale = Math.min(rawScaleX, rawScaleY);

    if (rawScale < 0.65) {
      return null;
    }

    const scaleRatio = Math.min(1.0, Math.max(0.65, rawScale));
    const targetAreaScale = Number(targetArea.scaleRatio);
    const displayScale = Number.isFinite(targetAreaScale) && targetAreaScale > 0
      ? targetAreaScale
      : 1;
    const pairLayout = this.stageGeometry
      && typeof this.stageGeometry.getCenteredPairLayout === 'function'
      ? this.stageGeometry.getCenteredPairLayout(
        petA,
        petB,
        targetArea,
        { visualScale: displayScale },
      )
      : null;
    const sceneCenter = pairLayout?.center || {
      x: targetArea.x + targetArea.width / 2,
      y: targetArea.y + targetArea.height / 2,
    };
    const pairWidth = pairLayout
      ? (pairLayout.bounds.right - pairLayout.bounds.left) / displayScale
      : BASE_WIDTH;
    const pairHeight = pairLayout
      ? (pairLayout.bounds.bottom - pairLayout.bounds.top) / displayScale
      : BASE_HEIGHT;

    return {
      targetArea,
      midpoint: sceneCenter,
      centerA,
      centerB,
      scaleRatio,
      displayScale,
      visualScale: scaleRatio * displayScale,
      baseWidth: BASE_WIDTH,
      baseHeight: BASE_HEIGHT,
      particleBaseWidth: Math.max(BASE_WIDTH, pairWidth * 1.25),
      particleBaseHeight: Math.max(BASE_HEIGHT, pairHeight * 3),
      pairLayout,
    };
  }

  /**
   * 响应主进程 `screensaver-start` 消息。
   */
  onStart(payload) {
    if (!payload || typeof payload.sessionId !== 'number' || payload.sessionId <= 0) {
      return;
    }

    if (this.isActive()) {
      this.reset();
    }

    this.sessionId = payload.sessionId;
    this.state = 'entering';
    this.stateTimer = 0;

    if (typeof this.clearInteractionOverlay === 'function') {
      this.clearInteractionOverlay();
    }

    if (this.interactionSystem && typeof this.interactionSystem.cancel === 'function') {
      this.interactionSystem.cancel();
    }

    if (this.dialogBubble && typeof this.dialogBubble.removeForPets === 'function') {
      const pets = this.getPets();
      if (Array.isArray(pets) && pets.length > 0) {
        this.dialogBubble.removeForPets(pets);
      }
    }

    const pets = this.getPets();
    if (Array.isArray(pets) && pets.length >= 2) {
      this.startPositions = pets.map((pet) => ({ x: pet.x, y: pet.y }));
    }

    const scene = this.computeSceneBounds();
    if (!scene) {
      this.cancel('insufficient_space');
      return;
    }
    this.sceneBounds = scene;
    this.centerPetsInScene(scene);

    const pLayer = this.getParticleLayer();
    if (pLayer && typeof pLayer.mount === 'function') {
      pLayer.mount(this.sceneBounds);
    }
  }

  /**
   * 将两只宠物安置在场景中心并相对而立；场景坐标始终限制在选定 walkArea 内。
   */
  centerPetsInScene(scene) {
    const pets = this.getPets();
    if (!scene || !Array.isArray(pets) || pets.length < 2) return;

    const [petA, petB] = pets;
    if (!petA || !petB) return;
    const layout = scene.pairLayout
      || (this.stageGeometry && typeof this.stageGeometry.getCenteredPairLayout === 'function'
        ? this.stageGeometry.getCenteredPairLayout(
          petA,
          petB,
          scene.targetArea,
          { visualScale: scene.displayScale },
        )
        : null);
    if (!layout) return;

    pets.slice(0, 2).forEach((pet, index) => {
      const target = layout.positions[index];
      pet.x = target.x;
      pet.y = target.y;
      pet.targetX = pet.x;
      pet.targetY = pet.y;
      pet.direction = target.direction;
      if (typeof pet.setState === 'function') {
        pet.setState('idle');
      } else {
        pet.state = 'idle';
      }
    });
  }

  /**
   * 响应主进程 `screensaver-stop` 消息。
   */
  onStop(payload) {
    if (!payload || payload.sessionId !== this.sessionId) {
      return;
    }

    if (this.state === 'inactive') return;

    if (payload.reason === 'input' && (this.state === 'entering' || this.state === 'performing')) {
      this.state = 'caught';
      this.stateTimer = CAUGHT_INDICATOR_DURATION_MS;
      this.caughtIndicatorAwaitingPaint = true;
      if (this.particleLayer && typeof this.particleLayer.clear === 'function') {
        this.particleLayer.clear();
      }
      this.clearScreensaverOverlays();
      this.showCaughtIndicator();
    } else {
      this.cancel(payload.reason || 'stop');
    }
  }

  /**
   * 响应主进程 `screensaver-cancel` 消息。
   */
  onCancel(payload) {
    if (!payload || payload.sessionId !== this.sessionId) {
      return;
    }

    if (this.state === 'inactive') return;

    this.reset();
  }

  /**
   * 立即静默取消屏保并安全复位。
   * @param {string} [_reason]
   */
  cancel(_reason = 'manual') {
    if (this.state === 'inactive') return;
    this.reset();
  }

  /**
   * 预处理连招序列：校验可用 overlay keys，跳过缺失素材。
   */
  async prepareComboSequence() {
    const CANDIDATE_COMBO = ['hug', 'shareFood', 'kiss'];
    const skinId = (this.skinManager && typeof this.skinManager.getCurrentSkin === 'function')
      ? this.skinManager.getCurrentSkin()
      : 'default';
    const sessionId = this.sessionId;

    let keys = null;
    this.activeComboSequence = null;
    this.comboIndex = 0;
    this.comboStepState = 'preparing';
    this.comboStepTimer = 0;

    try {
      if (this.skinManager && typeof this.skinManager.getAvailableOverlayKeys === 'function') {
        keys = await this.skinManager.getAvailableOverlayKeys(skinId, this.electronAPI);
      } else if (this.electronAPI && typeof this.electronAPI.getAvailableOverlayKeys === 'function') {
        keys = await this.electronAPI.getAvailableOverlayKeys(skinId);
      }
    } catch (e) {
      keys = null;
    }

    if (this.state !== 'performing' || this.sessionId !== sessionId) {
      return;
    }

    if (Array.isArray(keys)) {
      this.activeComboSequence = CANDIDATE_COMBO.filter((k) => keys.includes(k));
    } else {
      this.activeComboSequence = CANDIDATE_COMBO;
    }

    this.comboIndex = 0;
    this.comboStepState = 'idle_pause';
    this.comboStepTimer = 500;
  }

  /**
   * 渲染屏保 Overlay DOM 元素。
   * 必须使用 `data-screensaver-session-id` 属性与 `.screensaver-overlay-image` 类，严禁使用 `interaction-overlay` ID。
   */
  showScreensaverOverlay(key) {
    this.clearScreensaverOverlays();

    const scene = this.sceneBounds || this.computeSceneBounds();
    if (!scene) return;

    const stage = (this.renderer && this.renderer.stage)
      ? this.renderer.stage
      : (typeof document !== 'undefined' ? document.body : null);
    const doc = (stage && stage.ownerDocument && typeof stage.ownerDocument.createElement === 'function')
      ? stage.ownerDocument
      : (typeof document !== 'undefined' && typeof document.createElement === 'function' ? document : null);
    if (!stage || !doc) return;

    const skinId = (this.skinManager && typeof this.skinManager.getCurrentSkin === 'function')
      ? this.skinManager.getCurrentSkin()
      : 'default';
    const overlayPrefix = `pet-asset://skin/${skinId}/`;

    const visualScale = scene.visualScale || scene.scaleRatio;
    const overlayWidth = scene.baseWidth * visualScale;
    const cx = scene.midpoint.x;
    const cy = scene.midpoint.y;
    const overlayLeft = cx - overlayWidth / 2;
    const overlayTop = cy - (scene.baseHeight / 2) * visualScale;

    const img = doc.createElement('img');
    img.className = 'screensaver-overlay-image';
    img.setAttribute('data-screensaver-session-id', String(this.sessionId));
    img.src = `${overlayPrefix}${key}.webp`;
    img.alt = key;
    img.style.position = 'absolute';
    img.style.width = `${overlayWidth}px`;
    img.style.height = 'auto';
    img.style.left = `${overlayLeft}px`;
    img.style.top = `${overlayTop}px`;
    img.style.pointerEvents = 'none';
    img.style.zIndex = '100';
    img.style.opacity = '1';

    stage.appendChild(img);

    const pets = this.getPets();
    if (Array.isArray(pets)) {
      pets.forEach((pet) => {
        if (pet && pet.element) {
          const body = pet.element.querySelector('.pet-body');
          if (body) body.style.visibility = 'hidden';
        }
      });
    }
  }

  /**
   * 清除屏保 Overlay 图片并恢复宠物 body 可见性。
   */
  clearScreensaverOverlays() {
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const nodes = document.querySelectorAll(`[data-screensaver-session-id="${this.sessionId}"]`);
      nodes.forEach((node) => {
        if (node.classList && node.classList.contains('screensaver-overlay-image')) {
          node.remove();
        }
      });
    }

    const pets = this.getPets();
    if (Array.isArray(pets)) {
      pets.forEach((pet) => {
        if (pet && pet.element) {
          const body = pet.element.querySelector('.pet-body');
          if (body) body.style.visibility = '';
        }
      });
    }
  }

  /**
   * 显示 caught 状态下的 CSS 文本 '!' 节点。
   */
  showCaughtIndicator() {
    const pets = this.getPets();
    if (!Array.isArray(pets) || pets.length === 0) return;

    const stage = (this.renderer && this.renderer.stage)
      ? this.renderer.stage
      : (typeof document !== 'undefined' ? document.body : null);
    const doc = (stage && stage.ownerDocument && typeof stage.ownerDocument.createElement === 'function')
      ? stage.ownerDocument
      : (typeof document !== 'undefined' && typeof document.createElement === 'function' ? document : null);
    if (!stage || !doc) return;

    const rawVisualScale = Number(this.sceneBounds?.displayScale);
    const visualScale = Number.isFinite(rawVisualScale) && rawVisualScale > 0
      ? rawVisualScale
      : 1;
    let sumX = 0;
    let minY = Infinity;
    pets.forEach((p) => {
      const visualPetSize = (p.size || p.width || 100) * visualScale;
      sumX += p.x + visualPetSize / 2;
      if (p.y < minY) minY = p.y;
    });
    const cx = sumX / pets.length;
    const topY = minY - 20 * visualScale;

    const div = doc.createElement('div');
    div.className = 'screensaver-caught-text';
    div.setAttribute('data-screensaver-session-id', String(this.sessionId));
    div.textContent = '!';
    div.style.position = 'absolute';
    div.style.left = `${cx}px`;
    div.style.top = `${topY}px`;
    div.style.transform = 'translate(-50%, -100%)';
    div.style.fontWeight = '800';
    div.style.fontSize = `${28 * visualScale}px`;
    div.style.color = '#ff4d4f';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '120';

    stage.appendChild(div);
  }

  /**
   * 将目标坐标夹紧到当前有效 walkArea 中。
   */
  clampTargetToWalkArea(target) {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
      return { x: 100, y: 100 };
    }
    let tx = target.x;
    let ty = target.y;

    if (this.stageGeometry && typeof this.stageGeometry.getWalkAreaForPoint === 'function') {
      const area = this.stageGeometry.getWalkAreaForPoint(tx, ty);
      if (!area) {
        if (typeof this.stageGeometry.clampToWalkAreas === 'function') {
          const clamped = this.stageGeometry.clampToWalkAreas({ x: tx, y: ty });
          tx = clamped.x;
          ty = clamped.y;
        } else if (this.stageGeometry.screenInfo?.walkAreas?.length > 0) {
          const first = this.stageGeometry.screenInfo.walkAreas[0];
          tx = Math.max(first.x, Math.min(first.x + first.width - 100, tx));
          ty = Math.max(first.y, Math.min(first.y + first.height - 100, ty));
        }
      }
    }
    return { x: tx, y: ty };
  }

  /**
   * 初始化 runningBack 状态，夹紧目标坐标并启动平滑差值位移。
   */
  initRunningBack() {
    this.clearScreensaverOverlays();
    if (this.particleLayer && typeof this.particleLayer.clear === 'function') {
      this.particleLayer.clear();
    }

    this.state = 'runningBack';
    this.stateTimer = 500;
    this.runningBackDuration = 500;
    this.runningBackElapsed = 0;

    const pets = this.getPets();
    if (Array.isArray(pets) && pets.length > 0) {
      this.runningBackStartCoords = pets.map((p) => ({ x: p.x, y: p.y }));
      this.runningBackTargetCoords = pets.map((p, index) => {
        const rawTarget = this.startPositions && this.startPositions[index]
          ? this.startPositions[index]
          : { x: p.x, y: p.y };
        return this.clampTargetToWalkArea(rawTarget);
      });

      pets.forEach((p, index) => {
        const target = this.runningBackTargetCoords[index];
        if (p) {
          p.targetX = target.x;
          p.targetY = target.y;
          if (p.x < target.x) {
            p.direction = 'right';
          } else if (p.x > target.x) {
            p.direction = 'left';
          }
          if (typeof p.setState === 'function') {
            p.setState('walking');
          } else {
            p.state = 'walking';
          }
        }
      });
    }
  }

  /**
   * runningBack 状态的插值更新。
   */
  updateRunningBack(deltaMs) {
    this.runningBackElapsed += deltaMs;
    const t = Math.min(1.0, this.runningBackElapsed / this.runningBackDuration);

    const pets = this.getPets();
    if (Array.isArray(pets) && this.runningBackStartCoords && this.runningBackTargetCoords) {
      pets.forEach((p, index) => {
        const start = this.runningBackStartCoords[index];
        const target = this.runningBackTargetCoords[index];
        if (p && start && target) {
          p.x = start.x + (target.x - start.x) * t;
          p.y = start.y + (target.y - start.y) * t;
        }
      });
    }
  }

  /**
   * 静默取消时不播放回位动画，但仍恢复入场前坐标，避免宠物滞留在屏保场景中。
   */
  restorePetsToStartPositions() {
    const pets = this.getPets();
    if (!Array.isArray(pets) || !Array.isArray(this.startPositions)) return;

    pets.forEach((pet, index) => {
      const start = this.startPositions[index];
      if (!pet || !start) return;
      const target = this.clampTargetToWalkArea(start);
      pet.x = target.x;
      pet.y = target.y;
      pet.targetX = target.x;
      pet.targetY = target.y;
    });
  }

  /**
   * 安全复位：清除内部状态、DOM 节点、调用 interactionSystem.cancel()，重置宠物为 idle（保留 queuedAction）。
   */
  reset() {
    const currentSessionId = this.sessionId;

    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const nodes = document.querySelectorAll('[data-screensaver-session-id]');
      nodes.forEach((node) => node.remove());
    }

    this.restorePetsToStartPositions();
    const pets = this.getPets();
    if (Array.isArray(pets)) {
      pets.forEach((pet) => {
        if (pet && pet.element) {
          const body = pet.element.querySelector('.pet-body');
          if (body) body.style.visibility = '';
        }
      });
    }

    if (typeof this.clearInteractionOverlay === 'function') {
      this.clearInteractionOverlay();
    }
    if (this.interactionSystem && typeof this.interactionSystem.cancel === 'function') {
      this.interactionSystem.cancel();
    }

    if (this.particleLayer && typeof this.particleLayer.clear === 'function') {
      this.particleLayer.clear();
    }

    if (this.dialogBubble && typeof this.dialogBubble.removeForPets === 'function') {
      if (Array.isArray(pets) && pets.length > 0) {
        this.dialogBubble.removeForPets(pets);
      }
    }

    if (Array.isArray(pets)) {
      pets.forEach((pet) => {
        if (pet && typeof pet.setState === 'function') {
          pet.setState('idle');
        } else if (pet) {
          pet.state = 'idle';
        }
      });
    }

    if (currentSessionId > 0 && this.electronAPI && typeof this.electronAPI.notifyScreensaverFinished === 'function') {
      this.electronAPI.notifyScreensaverFinished(currentSessionId);
    }

    this.sessionId = 0;
    this.state = 'inactive';
    this.stateTimer = 0;
    this.caughtIndicatorAwaitingPaint = false;
    this.startPositions = null;
    this.sceneBounds = null;

    this.activeComboSequence = null;
    this.comboIndex = 0;
    this.comboStepState = null;
    this.comboStepTimer = 0;

    this.runningBackStartCoords = null;
    this.runningBackTargetCoords = null;
    this.runningBackDuration = 0;
    this.runningBackElapsed = 0;
  }

  /**
   * 逐帧更新屏保状态机。
   * @param {number} deltaMs
   */
  update(deltaMs) {
    if (this.state === 'inactive') return;

    switch (this.state) {
      case 'entering':
        this.state = 'performing';
        this.prepareComboSequence();
        break;

      case 'performing':
        if (this.comboStepState === 'preparing' || this.comboStepState === 'waiting_for_input') {
          break;
        }
        if (this.comboStepTimer > 0) {
          this.comboStepTimer -= deltaMs;
        }
        if (this.comboStepTimer <= 0) {
          if (!Array.isArray(this.activeComboSequence) || this.activeComboSequence.length === 0) {
            this.comboStepState = 'waiting_for_input';
            break;
          }

          if (this.comboStepState === 'idle_pause') {
            if (this.comboIndex < this.activeComboSequence.length) {
              const currentAction = this.activeComboSequence[this.comboIndex];
              this.showScreensaverOverlay(currentAction);
              this.comboStepState = 'overlay_action';
              this.comboStepTimer = 1500;
            } else {
              this.comboStepState = 'waiting_for_input';
            }
          } else if (this.comboStepState === 'overlay_action') {
            this.clearScreensaverOverlays();
            const pets = this.getPets();
            if (Array.isArray(pets)) {
              pets.forEach((p) => {
                if (p && typeof p.setState === 'function') p.setState('idle');
              });
            }
            this.comboIndex++;
            this.comboStepState = 'idle_pause';
            this.comboStepTimer = 1000;
          }
        }
        break;

      case 'caught':
        if (this.caughtIndicatorAwaitingPaint) {
          this.caughtIndicatorAwaitingPaint = false;
          break;
        }
        this.stateTimer -= deltaMs;
        if (this.stateTimer <= 0) {
          this.initRunningBack();
        }
        break;

      case 'runningBack':
        this.updateRunningBack(deltaMs);
        this.stateTimer -= deltaMs;
        if (this.stateTimer <= 0) {
          this.reset();
        }
        break;

      default:
        this.reset();
        break;
    }
  }

  dispose() {
    this.detachSubscriptions();
    if (this.particleLayer && typeof this.particleLayer.destroy === 'function') {
      this.particleLayer.destroy();
    }
    this.reset();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ScreensaverSystem };
}

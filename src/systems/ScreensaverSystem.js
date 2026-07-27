/**
 * src/systems/ScreensaverSystem.js
 * CP 屏保渲染进程状态机与控制系统。
 * 状态机流程：inactive | entering | performing | caught | runningBack | cancelled
 */
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

    this.state = 'inactive';
    this.sessionId = 0;
    this.stateTimer = 0;
    this.startPositions = null;

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

  /**
   * 检查屏保状态机是否处于活跃状态（非 inactive）。
   * @returns {boolean}
   */
  isActive() {
    return this.state !== 'inactive';
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
      this.stateTimer = 300;
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

    this.state = 'cancelled';
    this.reset();
  }

  /**
   * 立即静默取消屏保并安全复位。
   * @param {string} [_reason]
   */
  cancel(_reason = 'manual') {
    if (this.state === 'inactive') return;
    this.state = 'cancelled';
    this.reset();
  }

  /**
   * 安全复位：清除内部状态、调用 interactionSystem.cancel()，重置宠物为 idle（保留 queuedAction）。
   */
  reset() {
    const currentSessionId = this.sessionId;

    if (typeof this.clearInteractionOverlay === 'function') {
      this.clearInteractionOverlay();
    }
    if (this.interactionSystem && typeof this.interactionSystem.cancel === 'function') {
      this.interactionSystem.cancel();
    }

    const pets = this.getPets();
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
    this.startPositions = null;
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
        break;
      case 'performing':
        break;
      case 'caught':
        this.stateTimer -= deltaMs;
        if (this.stateTimer <= 0) {
          this.state = 'runningBack';
          this.stateTimer = 500;
        }
        break;
      case 'runningBack':
        this.stateTimer -= deltaMs;
        if (this.stateTimer <= 0) {
          this.reset();
        }
        break;
      case 'cancelled':
        this.reset();
        break;
      default:
        this.reset();
        break;
    }
  }

  dispose() {
    this.detachSubscriptions();
    this.reset();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ScreensaverSystem };
}

/**
 * src/ui/ScreensaverParticleLayer.js
 * CP 屏保爱心氛围粒子与暖光氛围层。
 * 节点上限 <= 20（1 个根节点 + 1 个暖光背景 + 最多 12 个爱心粒子 = 14 个节点）。
 * 严格限制仅通过 CSS keyframe 动画控制 opacity 与 transform。
 */
class ScreensaverParticleLayer {
  constructor(stage, options = {}) {
    this.stage = stage || (typeof document !== 'undefined' ? document.body : null);
    this.options = options || {};
    this.root = null;
    this.glowNode = null;
    this.particleNodes = [];
  }

  /**
   * 挂载并启动爱心粒子与暖光层。
   * @param {Object} sceneBounds - computeSceneBounds() 返回的场景尺寸与几何信息
   * @param {Object} [overrideOptions]
   */
  mount(sceneBounds, overrideOptions = {}) {
    this.clear();

    const opts = { ...this.options, ...overrideOptions };
    const stage = opts.stage || this.stage || (typeof document !== 'undefined' ? document.body : null);

    if (!sceneBounds || !stage) return;

    const doc = opts.document || (stage && stage.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    let reducedMotion = false;
    if (typeof opts.reducedMotion === 'boolean') {
      reducedMotion = opts.reducedMotion;
    } else if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) {
        reducedMotion = false;
      }
    }

    const scaleRatio = sceneBounds.visualScale || sceneBounds.scaleRatio || 1.0;
    const cx = sceneBounds.midpoint ? sceneBounds.midpoint.x : 200;
    const cy = sceneBounds.midpoint ? sceneBounds.midpoint.y : 150;
    const baseWidth = sceneBounds.baseWidth || 320;
    const baseHeight = sceneBounds.baseHeight || 200;

    const layerWidth = baseWidth * scaleRatio * 1.4;
    const layerHeight = baseHeight * scaleRatio * 1.4;
    const left = cx - layerWidth / 2;
    const top = cy - layerHeight / 2;

    this.root = doc.createElement('div');
    this.root.className = 'screensaver-particle-root';
    this.root.style.position = 'absolute';
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.width = `${layerWidth}px`;
    this.root.style.height = `${layerHeight}px`;
    this.root.style.pointerEvents = 'none';
    this.root.style.zIndex = '90';

    // 1. 暖光背景节点
    this.glowNode = doc.createElement('div');
    this.glowNode.className = 'screensaver-warm-glow';
    if (typeof this.root.appendChild === 'function') {
      this.root.appendChild(this.glowNode);
    }

    // 2. 浮动爱心粒子（若开启减弱动态效果，则不生成爱心粒子）
    if (!reducedMotion) {
      const PARTICLE_COUNT = 12;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = doc.createElement('i');
        p.className = 'screensaver-particle-heart';

        const leftPercent = 10 + ((i * 17) % 80);
        const delay = -((i % 6) * 0.4).toFixed(2);
        const duration = (2.2 + (i % 5) * 0.3).toFixed(2);
        const driftX = ((i % 2 === 0 ? 1 : -1) * (12 + (i % 4) * 8)).toFixed(0);
        const scale = (0.6 + (i % 3) * 0.25).toFixed(2);

        p.style.left = `${leftPercent}%`;
        if (typeof p.style.setProperty === 'function') {
          p.style.setProperty('--heart-delay', `${delay}s`);
          p.style.setProperty('--heart-duration', `${duration}s`);
          p.style.setProperty('--heart-drift-x', `${driftX}px`);
          p.style.setProperty('--heart-scale', scale);
        } else {
          p.style['--heart-delay'] = `${delay}s`;
          p.style['--heart-duration'] = `${duration}s`;
          p.style['--heart-drift-x'] = `${driftX}px`;
          p.style['--heart-scale'] = scale;
        }

        if (typeof this.root.appendChild === 'function') {
          this.root.appendChild(p);
        }
        this.particleNodes.push(p);
      }
    }

    if (typeof stage.appendChild === 'function') {
      stage.appendChild(this.root);
    }
  }

  /**
   * 清除并销毁所有 DOM 节点。
   */
  clear() {
    if (this.root) {
      if (typeof this.root.remove === 'function') {
        this.root.remove();
      }
      this.root = null;
    }
    this.glowNode = null;
    this.particleNodes = [];
  }

  destroy() {
    this.clear();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ScreensaverParticleLayer };
}

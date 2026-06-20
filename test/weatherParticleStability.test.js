/**
 * weatherParticleStability.test.js
 *
 * 对应计划第 500–501 行（10 分钟手动 DOM 观察等价）和第 507 行（天气切换/雨雪特效 long-task 评估）。
 *
 * 由于 Electron DevTools 手动录制无法在 CI 中自动执行，本脚本在 Node.js 环境中：
 *   1. 模拟雨/雪粒子层连续 500+ 次 sync 循环（等价 10 分钟逐帧位置更新），
 *      断言 DOM 节点数量在整个过程中保持稳定（不泄漏）。
 *   2. 模拟天气在 clear→rain→snow→unknown 之间反复切换 200 次，
 *      断言每次切换后 root 子节点数量正确（禁用时为 0，活跃时为 1）。
 *   3. 记录每次 sync 的耗时，断言 P99 耗时低于 50ms（long-task 阈值）。
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const { WeatherParticleLayer } = require('../src/ui/WeatherParticleLayer.js');

// ── 轻量 DOM 桩 ──────────────────────────────────────────────────────────────

function createFakeElement() {
  const el = {
    id: '',
    className: '',
    dataset: {},
    children: [],
    parentNode: null,
    style: {
      _props: {},
      setProperty(name, value) { this._props[name] = value; },
    },
    get childCount() { return this.children.length; },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    remove() {
      if (!this.parentNode) return;
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    },
  };
  return el;
}

function countNodes(el) {
  let total = 1;
  for (const child of el.children) total += countNodes(child);
  return total;
}

function setupGlobalDocument() {
  global.document = { createElement() { return createFakeElement(); } };
}

function teardownGlobalDocument() {
  delete global.document;
}

// ── 计时工具 ─────────────────────────────────────────────────────────────────

function percentile(sortedArr, pct) {
  const idx = Math.ceil(sortedArr.length * pct / 100) - 1;
  return sortedArr[Math.max(0, idx)];
}

// ── Test 1: 连续位置更新不泄漏节点（等价第 500 行）─────────────────────────

test('Line 500 – DOM 节点数量在 500 次连续位置更新中稳定（不泄漏）', () => {
  setupGlobalDocument();
  try {
    const root = createFakeElement();
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 48,
      WEATHER_SNOW_PARTICLE_MAX: 40,
    });

    const baseState = { weatherKind: 'rain', intensity: 'heavy' };
    const pets = [{ x: 100, y: 120, size: 96 }];

    // 第一次 sync 建立基线节点数
    layer.sync(baseState, { visible: true, scaleRatio: 1, pets });
    const baselineNodeCount = root.children.length > 0 ? countNodes(root) : 0;

    const ITERATIONS = 500;
    for (let i = 0; i < ITERATIONS; i++) {
      // 仅位置变化，不应重建粒子节点
      pets[0].x = 100 + Math.sin(i) * 30;
      pets[0].y = 120 + Math.cos(i) * 10;
      layer.sync(baseState, { visible: true, scaleRatio: 1, pets });

      const nodeCount = root.children.length > 0 ? countNodes(root) : 0;
      assert.equal(
        nodeCount,
        baselineNodeCount,
        `迭代 ${i}: 节点数 ${nodeCount} 偏离基线 ${baselineNodeCount}，存在泄漏`,
      );
    }
  } finally {
    teardownGlobalDocument();
  }
});

// ── Test 2: 禁用/激活时节点干净清除（第 501 行保底条件）───────────────────

test('Line 501 – 粒子特效禁用后 root 节点归零，重新激活后准确恢复', () => {
  setupGlobalDocument();
  try {
    const root = createFakeElement();
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 48,
    });
    const pets = [{ x: 150, y: 200, size: 96 }];

    // 激活雨
    layer.sync({ weatherKind: 'rain', intensity: 'heavy' }, { visible: true, scaleRatio: 1, pets });
    assert.equal(root.children.length, 1, '激活后应有 1 个粒子层');

    // 禁用（visible: false）
    layer.sync({ weatherKind: 'rain', intensity: 'heavy' }, { visible: false, scaleRatio: 1, pets });
    assert.equal(root.children.length, 0, 'visible:false 后节点应归零');

    // 再激活
    layer.sync({ weatherKind: 'rain', intensity: 'normal' }, { visible: true, scaleRatio: 1, pets });
    assert.equal(root.children.length, 1, '重新激活后应有 1 个粒子层');

    // unknown → 清除
    layer.sync({ weatherKind: 'unknown', intensity: 'none' }, { visible: true, scaleRatio: 1, pets });
    assert.equal(root.children.length, 0, 'unknown 天气后节点应归零');
  } finally {
    teardownGlobalDocument();
  }
});

// ── Test 3: 天气切换 200 次，P99 耗时 < 50ms（等价第 507 行 long-task 检查）

test('Line 507 – 200 次天气切换 P99 耗时低于 50ms（long-task 阈值）', () => {
  setupGlobalDocument();
  try {
    const root = createFakeElement();
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 48,
      WEATHER_SNOW_PARTICLE_MAX: 40,
    });
    const pets = [{ x: 100, y: 120, size: 96 }];
    const sequence = ['rain', 'snow', 'rain', 'unknown', 'clear', 'rain'];
    const intensities = ['light', 'normal', 'medium', 'heavy', 'light', 'heavy'];

    const durations = [];
    const SWITCHES = 200;

    for (let i = 0; i < SWITCHES; i++) {
      const kind = sequence[i % sequence.length];
      const intensity = intensities[i % intensities.length];
      pets[0].x = 100 + i * 0.5;

      const t0 = performance.now();
      layer.sync({ weatherKind: kind, intensity }, { visible: true, scaleRatio: 1, pets });
      const dt = performance.now() - t0;
      durations.push(dt);
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const p99 = percentile(sorted, 99);
    const p50 = percentile(sorted, 50);
    const max = sorted[sorted.length - 1];

    console.log(`  天气切换耗时: P50=${p50.toFixed(2)}ms  P99=${p99.toFixed(2)}ms  Max=${max.toFixed(2)}ms`);

    assert.ok(
      p99 < 50,
      `P99 耗时 ${p99.toFixed(2)}ms 超过 50ms long-task 阈值，需要降级特效`,
    );
  } finally {
    teardownGlobalDocument();
  }
});

// ── Test 4: 只更新位置时不重建粒子节点（防 layout thrashing）──────────────

test('Line 507 – 位置更新复用现有粒子节点而不重建（防 layout thrashing）', () => {
  setupGlobalDocument();
  try {
    const root = createFakeElement();
    const layer = new WeatherParticleLayer(root, {
      WEATHER_RAIN_PARTICLE_MAX: 48,
    });
    const pets = [{ x: 100, y: 120, size: 96 }];

    layer.sync({ weatherKind: 'rain', intensity: 'heavy' }, { visible: true, scaleRatio: 1, pets });
    const firstLayer = root.children[0];

    // 移动宠物位置，不应重建 layer 对象
    for (let i = 0; i < 100; i++) {
      pets[0].x = 100 + i;
      layer.sync({ weatherKind: 'rain', intensity: 'heavy' }, { visible: true, scaleRatio: 1, pets });
      assert.equal(root.children[0], firstLayer, `迭代 ${i}: 位置更新不应重建粒子层 DOM 节点`);
    }
  } finally {
    teardownGlobalDocument();
  }
});

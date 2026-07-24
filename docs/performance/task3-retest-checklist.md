# Task 3: 天气粒子层性能复测与视觉验证清单

## 1. 复测命令 (Retest Commands)

为了保证性能复测结论的有效性，必须使用与基线完全相同的测量工具和参数配置（packaged 构建，启用 GPU，每个场景预热 5 秒、采样 30 秒，重复 3 次）。

### 采样命令
```powershell
npm run qa:electron:performance -- --scenarios idle,walking,rain,wind,heat,thunderstorm --warmup-ms 5000 --sample-ms 30000 --repetitions 3 --executable .\dist\win-unpacked\七九爱宠.exe --profile .\scratch\task3-performance-profile --power-mode balanced --output docs/performance/task3-post-optimization.json
```
*(注：请确保设备与基线测试时的状态一致，包含电源方案、插电状态与显示器配置。`--executable` 必须提供 packaged 可执行文件路径；指定 `--profile` 可避免 Windows 在清理临时 profile 时出现 `EPERM`。)*

### 验证与复算命令
采样完成后，必须使用以下命令验证数据完整性，并独立复算指标：
```powershell
node tools/performance/validateBaseline.js docs/performance/task3-post-optimization.json
node tools/performance/recomputeBaseline.js docs/performance/task3-post-optimization.json
```

### 2026-07-24 执行记录：通过

- 当前 packaged + GPU 构建在隔离 profile 下完成 6 个场景各 3 次的正式采样；原始结果见 [`task3-post-optimization.json`](task3-post-optimization.json)。
- `validateBaseline.js` 与 `recomputeBaseline.js` 均通过。为兼容 Windows 受限子进程环境，性能启动器使用与既有冒烟检查一致的 QA 启动参数；这些参数不影响正式发布应用。
- 强风 CPU P50 相比基线降低 56.6%，满足至少改善 20% 的验收标准；所有场景 Long Task 为 0，帧 P95 保持在 33.5–33.6ms。

## 2. 前后对比数据模板 (Before/After Comparison Template)

> **注意：** 必须使用同批次的 `idle`（空闲）数据作为 CPU 和内存的对照组，以消除跨批次的绝对值波动。此处基线数据的相对/绝对增幅基于首批默认 GPU packaged 空闲 CPU P50 (0.382%)。目标是让超出指标至少有 **20%** 的改善。

| 场景 | 指标 | 优化前 (基线) | 优化后 (复测) | 变化 / 结论 |
| --- | --- | --- | --- | --- |
| **空闲** | CPU P50 | 0.382% | 0.379% | -0.003pp |
| (同批对照) | 私有内存 P50 | 329.8 MiB | 318.5 MiB | -11.3 MiB |
| **重雨** | 帧 P95 (ms) | 33.5 / 33.5 / 33.5 | 33.6 / 33.5 / 33.6 | 刷新率预算内 |
| (Rain) | Long Task | 0 / 0 / 0 | 0 / 0 / 0 | 无回归 |
| | CPU P50 | 1.933% | 1.868% | -3.4% |
| | 相对空闲增幅 | +405.6% | +393.1% | 降低 12.5pp |
| | 绝对空闲增幅 | +1.551pp | +1.489pp | 降低 0.062pp |
| | 私有内存 P50 | 374.5 MiB | 382.1 MiB | +7.6 MiB |
| **强风** | 帧 P95 (ms) | 33.5 / 33.5 / 33.5 | 33.5 / 33.5 / 33.6 | 刷新率预算内 |
| (Wind) | Long Task | 0 / 0 / 0 | 0 / 0 / 0 | 无回归 |
| | CPU P50 | 5.090% | 2.209% | **降低 56.6%，通过** |
| | 相对空闲增幅 | +1231.3% | +483.2% | 降低 748.1pp |
| | 绝对空闲增幅 | +4.708pp | +1.831pp | 降低 2.877pp |
| | 私有内存 P50 | 418.8 MiB | 379.0 MiB | -39.8 MiB |
| **高温** | 帧 P95 (ms) | 33.5 / 33.5 / 33.5 | 33.6 / 33.6 / 33.6 | 刷新率预算内 |
| (Heat) | Long Task | 0 / 0 / 0 | 0 / 0 / 0 | 无回归 |
| | CPU P50 | 2.466% | 2.319% | -6.0% |
| | 相对空闲增幅 | +544.9% | +512.1% | 降低 32.8pp |
| | 绝对空闲增幅 | +2.084pp | +1.940pp | 降低 0.144pp |
| | 私有内存 P50 | 412.6 MiB | 381.9 MiB | -30.7 MiB |
| **雷暴** | 帧 P95 (ms) | 33.5 / 33.5 / 33.5 | 33.5 / 33.5 / 33.5 | 刷新率预算内 |
| (Thunderstorm) | Long Task | 0 / 0 / 0 | 0 / 0 / 0 | 无回归 |
| | CPU P50 | 2.314% | 2.148% | -7.2% |
| | 相对空闲增幅 | +505.2% | +467.0% | 降低 38.2pp |
| | 绝对空闲增幅 | +1.932pp | +1.769pp | 降低 0.163pp |
| | 私有内存 P50 | 414.6 MiB | 384.7 MiB | -29.9 MiB |

## 3. 视觉验证矩阵 (Visual Verification Matrix)

请在应用中人工触发以下 6 种场景，检查优化后的视觉表现。

### 3.1 重雨 (Heavy Rain)
- [ ] **观察点**：粒子数量 (particle count)、下落角度 (fall angle)、视觉表现 (visual appearance)、发光阴影效果 (box-shadow glow)。
- [ ] **通过标准**：雨滴角度自然，边缘光晕可见且不过分突兀，粒子在到达屏幕底部时正常回收。
- [ ] **截图对比**：与基线截图对比，光晕范围与透明度无显著降级。

### 3.2 强风 (Strong Wind) - **CRITICAL**
- [ ] **观察点**：粒子飘动动画 (particle drift animation)、进出场过渡 (enter/exit transitions)、线条弯曲效果 (line curl effect)、视觉密度 (visual density)。
- [ ] **通过标准**：风的粒子有明显的方向性漂移，进出屏幕时过渡平滑无闪烁，密度合适没有空洞。
- [ ] **截图对比**：重点关注风的线条弯曲程度和密集度是否与优化前一致。

### 3.3 高温 (Heat)
- [ ] **观察点**：上升的热浪闪烁 (rising shimmer)、光晕脉冲 (glow pulse)、模糊效果 (blur effect)。
- [ ] **通过标准**：底部有明显的模糊和热浪上升的扭曲/闪烁感，脉冲频率自然。
- [ ] **截图对比**：检查底层 blur 是否依然生效，未出现边缘锐利的方块。

### 3.4 雷暴 (Thunderstorm)
- [ ] **观察点**：雨滴 (rain) + 闪电闪烁 (lightning flash)、风的抑制 (wind suppression)。
- [ ] **通过标准**：背景有随机闪电全屏闪烁，雨滴效果正常，没有出现强风的横向粒子。
- [ ] **截图对比**：确保闪电亮起时宠物本体和场景的视觉对比度正确。

### 3.5 双人互动 (Two-pet Interaction)
- [ ] **观察点**：编组对齐 (group merging)、天气在合并区域居中 (weather centering over merged area)。
- [ ] **通过标准**：两只宠物靠在一起时，天气图层正确居中且覆盖在合并后的互动区域之上，无截断或偏移。
- [ ] **截图对比**：确认天气容器的尺寸和位置与两只宠物的总占地一致。

### 3.6 减弱动态效果 (prefers-reduced-motion)
- [ ] **观察点**：粒子图层隐藏 (particle layer hidden)。
- [ ] **通过标准**：当系统开启“减弱动态效果”时，天气粒子不渲染或处于完全隐藏状态。
- [ ] **截图对比**：画面干净，无任何移动粒子。

## 4. 回归检查单 (Regression Checklist)

- [ ] **粒子数量核对**：各天气特效的 DOM 节点/粒子总数没有因优化被错误缩减，须符合基线数量。
- [ ] **动画平滑度**：无明显卡顿 (jank)、跳帧或周期性卡顿现象 (stuttering)。
- [ ] **scaleRatio 行为**：在不同的系统 DPI 缩放级别下，粒子尺寸和动画速度按比例适配，未出现异常。
- [ ] **雷暴风抑制**：雷暴场景严格禁止出现风的特效粒子。
- [ ] **互动叠加合并**：双人互动时只渲染一套合并的天气图层。

## 5. 回滚流程 (Rollback Procedure)

如果测试发现优化导致了不可接受的视觉降级，请按以下步骤回滚 CSS 更改。

1. **撤销文件修改**：
   ```bash
   git checkout HEAD -- src/effects.css
   # 如果需要同时回滚 JS 更改：
   git checkout HEAD -- src/ui/WeatherParticleLayer.js
   ```
2. **清理与重构**：
   ```bash
   npm run build:clean
   npm run build
   ```
3. **重新验证**：
   运行应用以确认原版视觉效果已完全恢复。

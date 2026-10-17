# 运行时与渲染性能优化执行计划

> 状态：已完成并验收通过
> 创建日期：2026-10-17

## Overview

基于 `performance-optimization` 诊断结论与既有性能基线（[2026-07-23-windows-baseline.md](../performance/2026-07-23-windows-baseline.md)、[ADR-012](../decisions/ADR-012-render-performance-optimization.md)），本计划针对 DeskPet 渲染主循环（60/120FPS `requestAnimationFrame`）中的每帧冗余计算、无用对象分配（GC 抖动）、隐藏态空转，以及主进程会议检测的子进程串行阻塞进行精准、低风险的外科手术式优化。

---

## 执行纪律（致执行模型 Gemini 3.8 Flash High）

1. **单任务闭环（Goal-Driven Execution）**：严格按 Task 1 → Task 5 顺序逐个执行，每次只改一个 Task，跑通对应单测与 `npm test` 后再进入下一个 Task。
2. **外科手术式修改（Surgical Changes）**：只修改任务指定的代码行，保留无关注释与代码风格，严禁顺手重构无关逻辑。
3. **测试先行（RED → GREEN）**：每个 Task 先在对应测试文件中补充断言验证优化行为（如缓存命中、不重复调用 DOM API），再修改实现使测试变绿。
4. **源码断言兼容**：部分集成测试（如 `test/windowAwarenessRendererIntegration.test.js`、`test/petVisibilityRendererIntegration.test.js`）包含对 `src/app.js` 源码字符串的静态检查，修改时必须严格遵守各 Task 中的兼容性约束。

---

## Dependency Graph

```text
Task 1: PetRenderer.update 样式与位移 Dirty Check (独立)
Task 2: WeatherAwarenessSystem.getCurrentState 状态缓存 (独立)
Task 3: MovementSystem.setSurfacePlatforms 平台列表脏检查 (独立)
    │
    └──► Checkpoint 1: 渲染帧内零冗余分配验证
            │
            ├──► Task 4: 桌宠隐藏态 (!isVisible) 主循环挂起与唤醒
            └──► Task 5: meetingDetector macOS 路径缓存与并行探测 + 文档/ADR/CHANGELOG 收口
                    │
                    └──► Checkpoint 2: 全量测试与最终验收
```

---

## Task List

### Phase 1：渲染主循环（RAF）帧内降耗与 GC 消除

#### Task 1：`PetRenderer.update` 样式与位移 Dirty Check

**Description：**
在 `src/pet/PetRenderer.js` 中，当前 `update(pet)` 每帧无条件执行 `el.style.transform = ...` 与 `el.style.setProperty('--pet-image-scale', ...)`，即便宠物处于 `idle` / `sleeping` / `meditating` 静止状态且缩放未发生变化。本任务为位置（`x, y, visualScale`）与图片缩放（`imageScale`）引入缓存脏检查，照应已有的 `_renderedSize` 模式。

**Implementation Details：**
1. 在 `createPetElement(pet)` 设置初始 `transform` 和 `--pet-image-scale` 后，初始化缓存字段：
   - `pet._renderedX = pet.x;`
   - `pet._renderedY = pet.y;`
   - `pet._renderedVisualScale = visualScale;`
   - `pet._renderedImageScale = imageScale;`（其中 `const imageScale = this.getPetImageScale(pet)`）
2. 在 `update(pet)` 中：
   - 计算 `const visualScale = this.getVisualScaleForPet ? this.getVisualScaleForPet(pet) : 1;`
   - 仅当 `pet._renderedX !== pet.x || pet._renderedY !== pet.y || pet._renderedVisualScale !== visualScale` 时，才更新 `el.style.transform` 并写入上述 3 个缓存字段。
   - 计算 `const imageScale = this.getPetImageScale(pet);`，仅当 `pet._renderedImageScale !== imageScale` 时，才调用 `el.style.setProperty('--pet-image-scale', imageScale)` 并更新 `pet._renderedImageScale = imageScale`。

**Acceptance criteria：**
- [x] `createPetElement` 正确初始化 `_renderedX`、`_renderedY`、`_renderedVisualScale`、`_renderedImageScale`
- [x] 当 `pet.x`、`pet.y`、`visualScale`、`imageScale` 未改变时，连续调用 `renderer.update(pet)` 不会重复触发 `style.setProperty('--pet-image-scale', ...)`，也不重复改写 `style.transform`
- [x] 当 `pet.x`、`pet.y`、`visualScale` 或 `pet.imageScale` 任一发生变化时，下一次 `renderer.update(pet)` 立即更新对应 DOM 样式与缓存值

**Verification：**
- [x] 单测：`node --test test/petRenderer.test.js`
- [x] 全量：`npm test`

**Dependencies：** None
**Files likely touched：**
- `src/pet/PetRenderer.js`
- `test/petRenderer.test.js`

**Estimated scope：** Small (2 files)

---

#### Task 2：`WeatherAwarenessSystem.getCurrentState` 状态快照缓存

**Description：**
`src/systems/WeatherAwarenessSystem.js` 的 `getCurrentState()` 在主循环中每帧被调用，每次都重新计算降水修正、风力等级、温度分档并分配新对象 `{ ...this.currentState, ... }`。由于天气 payload 30 分钟才更新一次、本地时段按分钟更新，本任务为 `getCurrentState()` 增加状态缓存，在输入未变化时直接复用同一快照对象引用。

**Implementation Details：**
1. 在 `WeatherAwarenessSystem` 构造函数中初始化缓存元数据（如 `this._cachedState = null`、`this._cachedPayloadRef = null`、`this._cachedPayloadStale = null`、`this._cachedTimePhase = null`、`this._cachedIsDay = null`）。
2. 在 `getCurrentState()` 入口检查：若 `this._cachedState !== null` 且 `this._cachedPayloadRef === this.weatherPayload`、`this._cachedPayloadStale === Boolean(this.weatherPayload?.stale)`、`this._cachedTimePhase === this.currentState.timePhase`、`this._cachedIsDay === this.currentState.isDay`，则直接返回 `this._cachedState`。
3. 否则按原逻辑计算出结果对象后，更新上述缓存元数据与 `this._cachedState` 并返回。
4. 在 `setWeatherPayload` 中显式重置 `this._cachedState = null`。

**Acceptance criteria：**
- [x] 在 `weatherPayload` 与 `currentState.timePhase` / `isDay` 未变化时，连续调用 `getCurrentState()` 返回严格相等的对象引用（`state1 === state2`）
- [x] 调用 `setWeatherPayload` 或 `updateLocalTimePhase` 导致时段/天气改变后，`getCurrentState()` 立即返回更新后的新状态对象
- [x] 既有天气与时段测试全部通过

**Verification：**
- [x] 单测：`node --test test/weatherAwarenessSystem.test.js test/timeWeatherRendererIntegration.test.js`
- [x] 全量：`npm test`

**Dependencies：** None
**Files likely touched：**
- `src/systems/WeatherAwarenessSystem.js`
- `test/weatherAwarenessSystem.test.js`

**Estimated scope：** Small (2 files)

---

#### Task 3：`MovementSystem.setSurfacePlatforms` 脏检查与数组复用

**Description：**
消除 `app.js` 每帧调用 `movementSystem.setSurfacePlatforms(getSurfacePlatforms(Date.now()))` 引发的每帧数组创建与 `normalizeWalkAreas`（两次 `.map()` + 一次 `.filter()`）重复规整开销。

**Implementation Details：**
1. **静态测试兼容约束**：`test/windowAwarenessRendererIntegration.test.js` 断言 `src/app.js` 源码必须包含字面量：
   - `if (!windowAwarenessSystem.isSurfaceAwarenessEnabled()) return []`
   - `movementSystem.setSurfacePlatforms(getSurfacePlatforms(Date.now()))`
   **切勿删除或改写这两行字面量！**
2. 在 `src/systems/MovementSystem.js` 中：
   - 新增辅助方法 `_areSurfacePlatformInputsEqual(nextPlatforms)`，对比传入数组与 `this._lastSurfacePlatformsInput`：若两者均为数组、长度相同，且每个对应元素的 `x, y, width, height, scaleRatio, source, isPrimary` 原始值相同，则视为未变化。
   - 在 `setSurfacePlatforms(platforms)` 入口：若 `this._areSurfacePlatformInputsEqual(platforms)` 为 `true`，直接 `return`；否则保存浅拷贝快照 `this._lastSurfacePlatformsInput` 并执行原有的 `normalizeWalkAreas` 与 `activePlatform` 查找。
3. 在 `src/app.js` 的 `getSurfacePlatforms` 中：
   - 保留首行 `if (!windowAwarenessSystem.isSurfaceAwarenessEnabled()) return [];`。
   - 缓存上次的 `_lastActivePlatform`、`_lastTaskbarPlatforms` 与合成结果数组 `_cachedSurfacePlatforms`；当 `activePlatform` 引用与 `stageGeometry.screenInfo.taskbarPlatforms` 引用均未变化时，直接返回缓存数组。

**Acceptance criteria：**
- [x] 连续以相同平台数据调用 `movementSystem.setSurfacePlatforms(platforms)` 时，`normalizeWalkAreas` 仅在第一次调用时执行，`movementSystem.surfacePlatforms` 数组引用保持不变
- [x] 当平台坐标、尺寸、数量发生变化或清空时，`setSurfacePlatforms` 正确重新规整并更新 `surfacePlatforms` 与 `activePlatform`
- [x] `test/windowAwarenessRendererIntegration.test.js` 源码检查测试通过

**Verification：**
- [x] 单测：`node --test test/movementSystem.test.js test/windowAwarenessRendererIntegration.test.js`
- [x] 全量：`npm test`

**Dependencies：** None
**Files likely touched：**
- `src/systems/MovementSystem.js`
- `src/app.js`
- `test/movementSystem.test.js`

**Estimated scope：** Small (3 files)

---

### Checkpoint 1：渲染帧内零冗余分配验证
- [x] Tasks 1–3 单测与 `npm test` 全部通过
- [x] 检查 `git diff` 确认无无关改动

---

### Phase 2：后台空转治理与主进程轮询优化

#### Task 4：桌宠隐藏态（`!isVisible`）主循环挂起与按需唤醒

**Description：**
当桌宠因托盘手动隐藏、会议自动隐藏或番茄钟专注隐藏（`isVisible === false`）时，`#pet-stage` 已处于 `display: none` 且 `isPaused === true`。当前 `gameLoop` 仍在后台以 60/120Hz 全速执行 `renderer.update`、`spriteView.update` 并不断请求 `requestAnimationFrame`。本任务在 `!isVisible` 时挂起 RAF 循环，并在恢复可见时无缝唤醒。

**Implementation Details：**
1. 在 `src/app.js` 中维护 `let rafId = null;`。
2. 封装 `scheduleGameLoop()`：仅当 `rafId === null && isVisible` 时调用 `rafId = requestAnimationFrame(gameLoop)`。
3. 在 `gameLoop(currentTime)` 入口将 `rafId = null;`：
   - 若 `!isVisible`：直接 `return`（不执行 `renderer.update`、`spriteView.update`、`statusBar.update`，也不再请求下一帧 RAF）。
   - 若 `isVisible`：正常执行逻辑与渲染更新，末尾调用 `scheduleGameLoop()`。
4. 在 `onTogglePetVisibility` 与初始化的 `getPetVisibilityState().then(...)` 中：
   - 当 `isVisible` 变为 `false` 时，若 `rafId !== null`，调用 `cancelAnimationFrame(rafId)` 并将 `rafId = null`。
   - 当 `isVisible` 变为 `true` 时，重置 `lastTime = performance.now()`，立即执行一次 `renderer.update(yueqi); renderer.update(shenjiu); spriteView.update(yueqi, 0); spriteView.update(shenjiu, 0);`，并调用 `scheduleGameLoop()` 恢复主循环。
5. **兼容约束**：保持 `updateEffectivePause` 与 `isUserPaused` 逻辑不变，确保 `test/petVisibilityRendererIntegration.test.js` 通过。

**Acceptance criteria：**
- [x] 当 `isVisible === false` 时，`gameLoop` 停止请求后续 `requestAnimationFrame`，后台 RAF 空转降为 0
- [x] 当 `isVisible` 恢复为 `true` 时，`lastTime` 重置并恢复 `requestAnimationFrame` 循环，且多次触发可见性切换不会产生并发的重复循环
- [x] `test/petVisibilityRendererIntegration.test.js` 全部通过

**Verification：**
- [x] 单测：`node --test test/petVisibilityRendererIntegration.test.js`
- [x] 全量：`npm test`

**Dependencies：** Tasks 1–3
**Files likely touched：**
- `src/app.js`
- `test/petVisibilityRendererIntegration.test.js`

**Estimated scope：** Small (2 files)

---

#### Task 5：`meetingDetector` macOS 二进制路径缓存与并行探测 + 文档收口

**Description：**
优化 `meetingDetector.js` 在 macOS 下的周期性系统调用开销，并完成本轮性能优化的文档与 ADR 同步。

**Implementation Details：**
1. **二进制路径缓存**：在 `meetingDetector.js` 中，将 macOS 下 `getSystemBinaryPath(command)` 对 `/usr/bin/pgrep` 与 `/usr/sbin/lsof` 的 `fs.existsSync` 检测结果缓存到模块级 `Map` 中，避免每 5 秒轮询时重复发起同步文件系统 stat 调用。
2. **macOS 进程探测并行化**：在 `collectMacSnapshot(options)` 中，将外层 `for (const appInfo of meetingApps)` 的进程收集改为 `Promise.all` 并行执行（每个 `appInfo` 内部仍按原顺序调用 `collectMacProcessInfo(execFileImpl, processName, commandTimeoutMs)`，保持命令参数 `pgrep -x <processName>` 和返回结果顺序与原来完全一致）。
3. **文档同步**：
   - 更新 `docs/decisions/ADR-012-render-performance-optimization.md`：在 `## Consequences` 末尾追加 `后续更新 (2026-10-17)`，记录 `PetRenderer` 位置/图像缩放 dirty check、`WeatherAwarenessSystem` 与 `MovementSystem` 状态缓存、隐藏态 RAF 挂起，以及 `meetingDetector` macOS 并行探测。
   - 更新 `CHANGELOG.md`：在 `## [Unreleased]` 的 `### Changed` 末尾追加一条中文记录（切勿重复创建 `### Changed` 标题）。

**Acceptance criteria：**
- [x] `collectMacSnapshot` 并行执行各会议应用的 `pgrep`/`lsof` 探测，返回的 `apps` 与 `detectedApps` 顺序和内容与原实现完全一致
- [x] `getSystemBinaryPath` 在 macOS 下对同一命令只执行一次 `fs.existsSync`
- [x] `ADR-012` 与 `CHANGELOG.md` 更新符合项目规范，`test/check_adrs.test.js` 通过

**Verification：**
- [x] 单测：`node --test test/meetingDetector.test.js test/check_adrs.test.js`
- [x] 全量：`npm test`

**Dependencies：** Task 4
**Files likely touched：**
- `meetingDetector.js`
- `test/meetingDetector.test.js`
- `docs/decisions/ADR-012-render-performance-optimization.md`
- `CHANGELOG.md`

**Estimated scope：** Medium (4 files)

---

### Checkpoint 2：全量验证与最终验收清单（供验收模型核对）

- [x] `npm test` 全部测试（1050+ 用例）100% 通过
- [x] `node scripts/check_adrs.js` 通过
- [x] `git diff` 审查：无调试残留、无孤儿变量、无多余格式改动、无重复 `CHANGELOG.md` 小节标题
- [x] 手动验证步骤（供用户/验收确认）：
  1. 启动 `npm run dev`，观察桌宠正常行走、发呆、右键菜单、气泡对话与大小缩放（50%～150%）均无异常。
  2. 通过托盘点击「隐藏宠物」，在 DevTools Performance 面板确认隐藏期间无 `requestAnimationFrame` 触发；再次点击「显示宠物」，桌宠立即恢复正常动画。
  3. 切换不同天气（如 `window.__DEBUG_WEATHER.force('rain')`、`window.__DEBUG_WEATHER.clear()`），确认天气粒子与昼夜状态正常切换。

---

## Risks and Mitigations

| 风险 | 影响 | 缓解策略 |
| :--- | :--- | :--- |
| 静态源码正则/字符串测试因改动 `app.js` 失败 | 中 | Task 3 与 Task 4 明确列出 `windowAwarenessRendererIntegration.test.js` 与 `petVisibilityRendererIntegration.test.js` 的保留字面量约束 |
| 桌宠从隐藏态恢复显示时出现巨额 `deltaMs` 时间跳跃 | 高 | Task 4 在恢复显示唤醒 RAF 前显式重置 `lastTime = performance.now()`，且保留 `gameLoop` 内原有的 `deltaMs > 60000` 钳制保护 |
| 测试中直接篡改 `weatherAwarenessSystem.currentState` 导致缓存未刷新 | 低 | Task 2 在 `getCurrentState()` 中同时比对 `this.weatherPayload` 引用与 `this.currentState.timePhase` / `isDay` 值 |
| 重复唤起 `requestAnimationFrame` 导致双倍帧率加速 | 高 | Task 4 使用单一 `rafId` 互斥守卫，隐藏时主动 `cancelAnimationFrame(rafId)` |

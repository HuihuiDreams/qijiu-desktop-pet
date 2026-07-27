# 局部高甜屏保（CP Secret Screensaver）实施计划

> 状态：待实施。本文是设计与验收契约，不代表功能已经上线。
>
> 相关决策：[ADR-044](../decisions/ADR-044-cp-screensaver-session.md)。

## 1. 目标与边界

在用户连续闲置时，桌宠在**当前宠物显示器**的安全可行走区域中央演出局部的 CP 互动场景。场景只包含两只宠物、一个局部 CSS 氛围层和有限粒子；不创建系统原生屏保，不改变系统息屏/睡眠策略，也不拦截用户输入。

本功能是应用内的短暂演出，不能承诺监听到全局输入事件后的零延迟退出。以主进程 `powerMonitor.getSystemIdleTime()` 轮询确认恢复输入：活跃演出期间退出检测间隔为 1 秒，目标是在下一次正常轮询中开始退出；正常待机时以 5 秒轮询降低唤醒成本。用户第一次输入仍会透传给原应用。真实 OS 调度与 idle-time 更新粒度不构成硬实时保证，性能验收只统计真实机器上的观测延迟。

### 首发范围

- Windows 首发：`ScreensaverEligibilityGuard` 每秒读取已有活动窗口缓存（兼容 `sampledAt` 与 `timestamp`，严格校验 `Number.isFinite`）；缓存超过 2 秒、时间戳非法（非有限数）、显示器查询失败或任何字段未知时一律拒绝并返回 `stale_cache` 等理由。它不直接触发额外的活动窗口采样。
- macOS 不纳入首发：当前项目没有可信的前台全屏/演示数据源，功能必须在该平台保持禁用，待独立的权限、数据源与验收方案获批后另立 ADR。
- 场景显示器完全由 renderer 决定：新增 `displayId` 到每个 `screen-info.walkAreas`，以两个宠物进入时视觉中心的中点所在 display 为场景 display（中点落在间隙时取岳七所在 display）。主进程不下发坐标。场景宽高先扣除安全边距和双人 overlay 最小宽度，再在 `0.65–1` 间缩放；无有效区域或缩放低于 0.65 时取消本次会话。

### 非目标

- 不实现 `.scr` / `.saver`，不阻止 Display Sleep 或 System Sleep。
- 不把透明主窗口改为可聚焦窗口，不关闭默认 `setIgnoreMouseEvents(true, { forward: true })`，不以屏保监听输入。
- 不暂停天气网络同步；屏保只隐藏天气**视觉层**。网络请求和设置生命周期保持由 `WeatherSyncController` 独占。
- 不复用或继承 `WeatherParticleLayer`，不修改既有天气 DOM、ID 或 CSS。
- 不改变久坐提醒、手动暂停、会议隐藏、番茄钟隐藏的业务语义；两类演出由显式仲裁器互斥。

## 2. 决策与不变量

### 2.1 主进程会话权威

新增独立 `ScreensaverController`；它可以读取同一个 `powerMonitor`，但**绝不注入或复用** `BreakReminderService` 的活跃时长、提醒状态或配置。主进程拥有唯一会话状态：

```text
inactive → eligible → active(sessionId) → exiting(sessionId) → inactive
                 │              │
                 └── blocked ───┘
```

- 每次 `inactive → active` 递增单调 `sessionId`。
- `start`、`stop`、`suspend`、`resume` 均携带或校验 `sessionId`；旧会话事件、定时器和 renderer 回执必须忽略。Controller 必须提供 `dispose()`，解除全部 timer、powerMonitor、IPC、store 与 DisplayService 订阅，允许重复 `init()` 的测试隔离。
- 同一段连续闲置仅启动一次。必须观察到 `getSystemIdleTime() < ACTIVE_IDLE_SECONDS` 后，才允许下一次启动。
- `lock-screen`、`suspend`、`unlock-screen`、`resume` 一律使当前会话失效并发送 `screensaver-cancel`，并设置 `requiresFreshActiveCycle`。只有先观察到一次正常活跃输入、再完整达到闲置阈值，才允许再次启动；锁屏/睡眠后不播放“被抓包”演出。
- renderer 重载不回放演出：`screensaver-ready` 只能在订阅、宠物实例、当前皮肤和 `screen-info` 均就绪后发送；若 Controller 已有 active/exiting 会话，立即取消该会话。此规则消除销毁窗口到新 renderer 就绪期间的丢消息与动画补偿问题。

### 2.2 触发、退出与仲裁

配置为独立的 `screensaverSettings`：`enabled`（默认 `false`，首发显式启用）、`idleThresholdMinutes`（默认 5，整数范围 1–60）。新增托盘子菜单（启用开关、1/5/10/30/60 分钟）及中英日文案；Controller 负责归一化、持久化和变更监听。设计阶段不写 CHANGELOG；每个合入的代码步骤必须写 `Unreleased` 中文条目。

新增主进程 `InterruptionCoordinator`，以持有者 `break-reminder | screensaver` 实现原子 `tryAcquire/release`。`BreakReminderController` 在向 renderer 发送提醒前必须获取该租约，并在 dismiss/lock/suspend/窗口销毁时释放；屏保无法获得租约时跳过本闲置段。任何持有者的会话都不能与另一方并发。

启动前必须同时满足：设置启用、主窗口存在、宠物可见、未暂停、已取得 screensaver 租约、EligibilityGuard 返回 `canInterrupt: true`。Controller 以 5 秒（待机）/1 秒（active）频率重查 guard，guard 的未知或过期结论一律 cancel/拒绝。`PetVisibilityService`、`SkinService`、`DisplayService` 与 renderer 操作入口必须通过注入的 `cancelScreensaver(reason)` 钩子，在改变隐藏/暂停、皮肤、几何、拖拽、右键菜单、重置位置前同步取消；任一条件在 active 期间失效均静默清理且释放租约。

普通输入恢复时，Controller 发送 `screensaver-stop { sessionId, reason: 'input' }`。renderer 只对匹配会话播放一次 `caught → runBack`；若在 1.5 秒内再次收到 stop/cancel，只做幂等清理。Controller 不等待动画完成才允许普通系统恢复，renderer 以独立局部演出状态保证不重新激活日常互动。

### 2.3 IPC 契约

仅由 `preload.js` 暴露订阅和确认 API，使用固定通道：

| 方向 | 通道 / payload | 规则 |
| --- | --- | --- |
| 主 → 渲染 | `screensaver-start { sessionId, startedAt }` | 只向未销毁的主窗口发送；几何仅由 renderer 在收到事件时计算。 |
| 主 → 渲染 | `screensaver-stop { sessionId, reason: 'input' }` | 触发一次被抓包退出。 |
| 主 → 渲染 | `screensaver-cancel { sessionId, reason }` | 睡眠、全屏、隐藏、禁用等静默清理。 |
| 渲染 → 主 | `screensaver-ready` | 仅在 renderer 完成依赖初始化后发送；若主进程会话未 inactive，主进程 cancel。 |
| 渲染 → 主 | `screensaver-finished { sessionId }` | 仅作可观测性确认，Controller 不依赖它推进状态。 |

所有 renderer → main 的消息都必须按主窗口 sender ID 鉴权，并校验 `sessionId` 是安全正整数且与当前会话匹配。Controller 在发送前校验主 → renderer payload 的有限数与正尺寸。IPC handler 需可在测试中注入 fake `ipcMain`。`ScreensaverController` 不向其他子窗口广播，状态栏、番茄钟、选肤和城市设置保持自己的生命周期。

### 2.4 渲染器演出状态

新增 `ScreensaverSystem`，只维护 `inactive | entering | performing | caught | runningBack | cancelled`。它不能写入 `PetVisibilityService` 的暂停状态，也不能重置其隐藏来源；退出不尝试恢复不完整的 Pet/Interaction 内部快照。

- `app.js` 必须将现有帧更新拆为具名 gate：`ScreensaverSystem` active 时只运行养成、存档、状态栏和离线结算；移动、InteractionSystem、环境闲聊、日常 overlay 与天气视觉一律不运行。InteractionSystem 需新增可测试的 `cancel()`，以清除内部 timer/currentInteraction；不借用全局 `isPaused`。
- 演出位置只使用带 `displayId` 的 `StageGeometry.walkAreas`，并在 `DisplayService` 的“几何已 settle、版本已递增”事件后 cancel；不监听原始 `screen` 事件。迁屏/拔屏后等待下一段闲置重新评估。
- 连招由两种动作组成：overlay 动作 `hug → shareFood → kiss`，其间插入宠物 `idle` 状态而不是请求不存在的 `idle.webp`。`SkinService` 必须向 renderer 提供当前皮肤经验证的 overlay key 列表；缺失动作在进入连招前跳过，绝不依赖 `<img>` error 回退。
- 屏保 overlay 使用 session 专属 DOM 属性与可取消 timer，不能复用全局 `interaction-overlay` id 或让延迟 remove 删除新会话节点。`caught` 使用 CSS 文本 `!`（非 emoji），只在 `reason: 'input'` 时显示。`runBack` 只使用入场时保存的两个目标点，目标失效时夹紧到当前有效 walkArea。
- 退出完成或 cancel 后，统一执行安全复位：清除屏保与日常 overlay、气泡和 session timer，调用 `InteractionSystem.cancel()`，将两宠设为 `idle` 并保留尚未执行的 `queuedAction`；不回滚用户在中断期间的状态。之后再放行普通移动/互动。

### 2.5 独立视觉层与可访问性

`ScreensaverParticleLayer` 为独立 DOM 根，不使用全局 id，不接触天气层。它固定挂在 stage，`pointer-events: none`，只接收 `{ sceneBounds, scaleRatio, reducedMotion }`。

- 最多 12 个粒子；暖光 1 个节点；不使用 `filter`、`backdrop-filter`、`box-shadow` 动画或逐帧 JavaScript 样式写入。
- 仅动画 `opacity` 与 `transform`；退出必须移除全部节点和 animation listener。
- `prefers-reduced-motion: reduce` 时关闭浮动粒子和快跑位移，仅保留静态暖光与一次淡入淡出。

## 3. 模块与文件

- `src/main/services/ScreensaverController.js`：设置、闲置轮询、会话状态机、sleep/lock 生命周期、IPC 鉴权、dispose；依赖注入。
- `src/main/services/InterruptionCoordinator.js`：久坐提醒与屏保的原子租约仲裁。
- `src/main/services/ScreensaverEligibilityGuard.js`：只判断“现在是否可以打扰”；Windows 缓存过期/异常时保守拒绝。
- `src/systems/ScreensaverSystem.js`：renderer 会话状态机、安全复位、动作序列和取消。
- `src/ui/ScreensaverParticleLayer.js`、`src/screensaver.css`：独立局部视觉层。
- `preload.js`、`src/app.js`、`src/index.html`：安全 IPC 表面、订阅生命周期、脚本与 CSS 加载。
- `src/main/constants.js`、`src/main/AppLifecycle.js`、`src/main/DisplayService.js`：store key、初始化接线与带 displayId 的 settle 几何通知。
- `test/screensaverController.test.js`、`test/screensaverSystem.test.js`、`test/screensaverParticleLayer.test.js`、`test/preloadSubscriptions.test.js`：行为、状态机、清理和 IPC 回归。

## 4. 验收标准

1. 在启用设置、连续闲置达到阈值、且 EligibilityGuard 允许后，最多一个采样周期内创建一次会话；同一闲置段不得重复触发。
2. 在真实机器性能采样中记录输入恢复到退出开始的延迟；常规空闲系统下目标为下一次 1 秒轮询，第一次输入不被屏保窗口吞掉。锁屏/睡眠/全屏/隐藏/禁用/重载只会静默清理。
3. 所有 start/stop/cancel/finalize 对重复与乱序消息幂等；旧 `sessionId` 绝不改变当前场景。
4. Windows 多显示器、混合 DPI、显示器变更、窗口迁移和小 workArea 下，场景始终位于 renderer 选定显示器的有效区域；空间不足时不启动，且不产生 NaN、越界或残留节点。macOS 首发时不启动。
5. 结束后日常移动、互动、天气视觉、久坐提醒、番茄钟、会议隐藏、手动暂停、换肤与 QA 入口均保持原语义。
6. 常规动效场景：屏保层 DOM 节点不超过 15、粒子不超过 12、无持续 JS style write；性能采样中不新增超过 50 ms 的长任务。减少动态效果模式不创建粒子。

## 5. 测试与验证

- **Controller 单测**：注入 fake `powerMonitor`、clock、timer、window、store、guard；按状态转移表覆盖阈值、重复 idle 段、输入恢复、guard 过期、设置切换、renderer reload、窗口替换、租约竞争、几何 settle、`stop → cancel` 乱序及 lock/suspend/unlock/resume 去重。
- **Renderer 单测**：使用 fake timer/DOM，覆盖每个状态转换、旧 sessionId、延迟动画完成、取消清理、动作资源缺失、换肤/拖拽/菜单中断、显示器变化和安全复位；断言旧 overlay timer 不会删除新节点。
- **集成测试**：检查 preload 订阅可解除、IPC sender 鉴权、`AppLifecycle` 初始化顺序、脚本/CSS 加载顺序，以及不影响现有 BreakReminder/Weather/Visibility 测试。
- **手动 QA**：开发环境阈值设为 1 分钟；验证 Windows 全屏抑制、混合 DPI、多屏迁移、锁屏/睡眠唤醒和第一次点击透传；验证 macOS 保持禁用。实际主机上录制 Performance trace，并用 `npm run qa:electron:performance` 与空闲基线比较。

## 6. 实施顺序

- [x] 1. 先补 `InterruptionCoordinator` 与 Controller 单元测试；实现 `InterruptionCoordinator` 租约仲裁、`ScreensaverEligibilityGuard` 窗口打扰守卫（兼容 sampledAt/timestamp 与 NaN 校验）、`ScreensaverController` 独立会话状态机（含重复 start/stop/dispose 监听器解绑与 1s 轮询中主窗口/可见性/Guard 状态中途校验）、IPC 鉴权与生命周期取消。（Step 1 重构已完成）
- [x] 2. 再接入 preload/app，完成“renderer reload 一律 cancel”、逐帧 gate 和 BreakReminder 租约接线；测试 reload、乱序和既有可见性/久坐提醒仲裁。
- [x] 3. 实现 `ScreensaverSystem` CP 叠加层与动画流程：显示器几何中点选择、场景安全缩放 (0.65–1.0)、连招动作序列 (hug -> shareFood -> kiss) 与皮肤 Overlay keys 校验跳过、CSS 文本 `!` 被抓包提示、`runningBack` 目标点 walkArea 夹紧与安全复位。（Step 3 已完成）
- [ ] 4. 接入验证过的 overlay 连招及资源回退；补齐皮肤切换和互动副作用回归。
- [ ] 5. 最后添加独立 CSS 视觉层与 reduced-motion；执行性能基线比较和人工跨平台 QA。


每个步骤只能在相应测试、文档和变更日志更新后进入下一步；若 macOS 不能提供可信的全屏/演示结论，保持该平台功能禁用而不是以误打扰方式降级。

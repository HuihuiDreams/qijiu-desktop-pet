# ADR-044: CP 局部屏保采用独立的主进程会话

## Status

Accepted (Step 1, Step 2, Step 3, Step 4 & Step 5 implemented)

## Date

2026-07-27

## Updates

### 2026-07-28: 活跃会话期瞬态失败容忍策略

**问题**

活跃 CP 屏保会话在用户未操作的情况下，仅播放一轮 `shareFood` 并进入约 1 秒 `idle_pause` 后便被瞬间取消，宠物瞬移回原位。

**根因**

`ScreensaverController` 进入 `active` 后改为 1 秒轮询，并在此轮询中重查 `ScreensaverEligibilityGuard`。Windows 活动窗口采样器的 `sampledAt` 取自 PowerShell 调用起始时间（`activeWindowProvider.js:200`），叠加 2 秒采样间隔（`ACTIVE_WINDOW_SAMPLE_INTERVAL_MS = 2000`）与 2 秒信任窗口（`DEFAULT_MAX_CACHE_AGE_MS = 2000`）后，缓存极易在 1 秒轮询边界内越过 2 秒阈值，返回 `stale_cache` / `provider-error` / `unknown-state` 等瞬态拒绝。

`poll()` 中 active 分支「守卫返回不可中断即立即 `cancelSession`」的逻辑把这些瞬态采样间隙误当作资格变化，发送 `screensaver-cancel` 触发渲染器 `reset()`，导致演出被撕毁。

**修订**

引入「触发前严格、活跃中宽容」的分层资格语义：

- `evaluateTrigger`（待机触发前）路径仍一律要求新鲜、可信数据才能放行，瞬态原因照常拒绝。
- `active` 期间的连续再校验路径只在守卫返回 `fullscreen` / `presentation` 这类确凿不适合信号时取消会话。
- `stale_cache` / `provider-error` / `unknown-state` / `display-query-failed` / `unsupported_platform` 视为暂不可判断，延后到下一轮轮询再判，避免因采样间隙撕毁一个本就验证过、用户也未操作的演出。

**实现要点**

- 新增 `DEFINITIVE_ELIGIBILITY_LOSS_REASONS = new Set(['fullscreen', 'presentation'])`。
- 新增回归测试 `transient eligibility loss mid-session (stale_cache) does not cancel an active session`（已验证修复前 fail、修复后 pass；当时全套测试 804 tests / 803 pass / 0 fail）。
- `Decision` 段落中对 active 分支「中途失效立即取消」与瞬态原因「语义保持不变」的描述已同步更新。

### 2026-07-28: 被抓包提示改为双宠对话气泡

**问题**

CP 屏保「被抓包」提示原先只有屏幕中央一个红色 `!` 文本节点，与角色没有任何视觉关联。

**修订**

复用既有 `DialogBubble.show`，在两只宠物头顶分别弹出对话气泡。

**实现要点**

- 新增 `DIALOGUES.screensaverCaught.{yueqi, shenjiu}` 三语词条（zh / en / ja）。
- 气泡显示时长仍为 800ms，与 `caught` 状态计时对齐。
- 移除 `screensaver.css` 中孤立的 `.screensaver-caught-text` 样式与 `@keyframes screensaver-caught-pop` 动画。
- `ScreensaverSystem.showCaughtIndicator` 重命名为 `showCaughtBubbles`，通过注入的 `dialogBubble` 渲染。
- `Decision` 段落中「普通输入时，`!` 会先保留一次绘制机会、展示 800ms，并按目标显示器 DPI 定位后再回位」同步更新为「双宠头顶气泡，文案来自 i18n，展示 800ms 后回位」。
- 相关单元测试（`challengerStep3_1.test.js` / `screensaverOverlay.test.js`）已改为断言 `dialogBubble.show` 调用而非 CSS 节点。

## Context

CP 局部屏保需要基于系统闲置时间在透明、非聚焦、鼠标穿透的宠物窗口中播放演出。现有久坐提醒也读取 `powerMonitor`，但它以连续活跃时长触发；天气层、宠物可见性、全屏抑制和睡眠恢复均各有独立状态与生命周期。

直接复用久坐提醒或由 renderer 监听输入会混淆业务语义，并且无法可靠地观察其他应用中的全局输入。睡眠/解锁与 renderer 重载也可能留下过期动画。

## Decision

### 1. 独立主进程会话

创建独立的 `ScreensaverController`，由主进程持有唯一会话状态和递增 `sessionId`：

- 单独轮询 `powerMonitor.getSystemIdleTime()`：
  - 正常待机期间轮询周期为 5 秒。
  - 屏保激活后轮询周期为 1 秒。
- 普通输入恢复会在下一次可用轮询中退出，但不将 OS 调度延迟承诺为硬实时。
- 每段连续闲置仅允许一个会话。
- Controller 的 `start()` / `stop()` / `dispose()` 严格脱钩并解绑全部 `powerMonitor`、`ipcMain` 与 store 监听器；`stop()` 会先停止轮询状态再取消活跃会话，避免取消路径重建计时器。

### 2. 资格守卫与分层校验

Controller 使用专用设置、IPC 通道和 `ScreensaverEligibilityGuard`，不读取或写入 `BreakReminderService` 的业务状态：

- Windows 活动窗口缓存每 2 秒刷新，使 Guard 的 2 秒 `sampledAt` / `timestamp` 有效期在待机轮询中可用，同时避免每秒启动 PowerShell。
- 非法、过期、未知或显示器查询失败的数据一律拒绝。
- 活动窗口采样契约将「真正全屏」与「最大化」区分开：
  - PowerShell 通过 `MonitorFromWindow` / `GetMonitorInfo` 取前台窗口所属显示器完整 `rcMonitor`。
  - 仅当窗口非最大化且覆盖完整 monitor bounds 时，才标记 `isFullScreen: true`。
  - 常规最大化办公窗口（VS Code、Office 等）保持 `isMaximized: true`、`isFullScreen: false`。
- PowerShell 失败、无效矩形与非 Windows provider 仍返回既有 unavailable 形状，不泄漏额外窗口内容。

会话资格的再校验遵循「触发前严格、活跃中宽容」的分层语义：

- **待机触发前**（`evaluateTrigger`）：必须使用新鲜、可信数据才能放行。`stale_cache`、`unknown-state`、`provider-error`、`display-query-failed` 与界面感知禁用等瞬态原因一律拒绝触发。
- **已 active 期间的连续再校验**：只对确凿不适合信号作出反应。中途若主窗口销毁、宠物隐藏/暂停、或守卫返回 `fullscreen` / `presentation`，Controller 立即取消会话。
- **活跃期瞬态原因**：`stale_cache` / `provider-error` / `unknown-state` / `display-query-failed` / `unsupported_platform` 仅反映活动窗口缓存的采样间隙（PowerShell 调用起始时间被用作 `sampledAt`，叠加 2 秒采样间隔与 2 秒 freshness 窗口，在 1 秒活跃轮询周期内缓存极易越界），Controller 视为暂不可判断，延后至下一轮轮询再判，不打断 active 会话。

### 3. 与久坐提醒的仲裁

新增 `InterruptionCoordinator` 对久坐提醒与屏保进行原子仲裁，确保两者互斥持有「打扰租约」，避免互相污染业务状态。

### 4. 渲染器状态机

渲染器只接受带 `sessionId` 的命令，并以独立状态机控制画面，状态包括：

`inactive | entering | performing | caught | runningBack`

renderer 重载一律取消而不回放。

### 5. 场景布局与视觉层

- 选择场景显示器时，基于两只宠物的视觉中点，在 `StageGeometry.walkAreas` 中定位对应显示器。
- 调用久坐提醒共用的 `StageGeometry.getCenteredPairLayout()` 计算对应 `walkArea` 的中心与双宠站位。
- CP 屏保传入该显示器的 DPI 比例，使布局按宠物缩放后的视觉尺寸保持中心对称。
- 粉色氛围层按共享布局跨度扩展；Overlay 与氛围层共同应用该显示器的 DPI 比例。
- 屏保视觉层独立于天气粒子层；所有动画保持鼠标穿透、非聚焦，并遵循 `prefers-reduced-motion` 降级。

### 6. 被抓包与回位

普通输入后 Controller 立即释放屏保租约并回到待机轮询，渲染器随后完成「被抓包 → 回位」并发送匹配的 `screensaver-finished` 确认：

- 普通输入时，双宠头顶各自弹出 `DIALOGUES.screensaverCaught` 对话气泡（文案由 `i18n.js` 提供，支持 zh / en / ja）。
- 先保留一次绘制机会，展示 800ms，再按目标显示器 DPI 定位后回位。
- 若渲染器在 active 阶段自行安全结束，该确认也会释放租约。

### 7. 闲置期间连招循环

- 连招播完后在中心等待用户输入。
- 已校验的可用 Overlay 不少于两个时，每轮按固定顺序 `shareFood → hug → kiss` 过滤后循环播放。
- 最后一个 Overlay 清理、idle 间隔结束后重置 `comboIndex` 并开始下一轮，不重新发起素材校验。
- 仅有零或一个可用 Overlay 时，安全停在中心 `idle_waiting` 等待用户输入，不播放或循环单个互动。

### 8. 退出、取消与幂等保证

- 同一 `sessionId` 的重复 stop / cancel 或迟到 IPC 不会重复显示感叹号、对话或回位动画。
- `caught` / `runningBack` 状态收到的重复 `input` stop 直接忽略；静默 cancel 仍可立即重置。
- 锁屏、睡眠、全屏/演示、隐藏、暂停、禁用与已 settle 的屏幕变化都取消会话并立即恢复入场坐标。
- 仅普通输入恢复会播放「被抓包」退出演出。

### 9. 触发等待档位

- 触发等待档位收紧为白名单：`1 / 3 / 5 / 10 / 15 / 30` 分钟（默认 5 分钟）。
- `screensaverAllowedMinutes.js` 作为 `ScreensaverController` 与 `TrayManager` 的唯一来源。
- 历史持久化值 `60` 在首次读取时迁移为 `30` 并回写 store；其他非白名单值回退默认。
- 托盘子菜单从该唯一来源渲染六个 radio 项，不再写入单独的电源时间提示项。
- 「Windows 关屏/睡眠时间须晚于所选等待时间、应用不读取或修改电源策略」的说明写入三语 README 的「CP 高甜屏保」一节，避免占用托盘菜单空间。

### 10. 平台策略

首发仅支持 Windows；macOS 在没有可信的前台全屏/演示数据源前保持禁用，优先保证不打扰。

## Alternatives Considered

### 复用 BreakReminderService

- 优点：少一个轮询器。
- 缺点：活跃时间与闲置时间的触发/重置语义相反，提醒展示状态也不能表达屏保会话。
- 结论：拒绝。

### 在 renderer 中监听键盘和鼠标

- 优点：理论上可快速响应。
- 缺点：透明窗口默认鼠标穿透且不可聚焦，无法可靠接收其他应用的输入；若关闭穿透会妨碍用户。
- 结论：拒绝。

### 将屏保作为全屏独立 BrowserWindow

- 优点：视觉实现较直接。
- 缺点：容易遮挡工作内容、打断输入与 Space/多屏逻辑，也违背局部低干扰目标。
- 结论：拒绝。

## Consequences

- 增加一个低频主进程轮询器和一套可测试的会话协议，但避免与久坐提醒和可见性状态互相污染。
- 「立即退出」调整为下一次可观测 idle 轮询的目标；首次输入继续透传，真实延迟以主机性能样本验收。
- macOS 首发保持禁用，优先保证不打扰。
- 实现时必须同步更新 `docs/structure.md`、`CHANGELOG.md`、测试和本 ADR 的状态。

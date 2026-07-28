# ADR-044: CP 局部屏保采用独立的主进程会话

## Status

Accepted (Step 1, Step 2, Step 3, Step 4 & Step 5 implemented)

## Date

2026-07-27

## Context

CP 局部屏保需要基于系统闲置时间在透明、非聚焦、鼠标穿透的宠物窗口中播放演出。现有久坐提醒也读取 `powerMonitor`，但它以连续活跃时长触发；天气层、宠物可见性、全屏抑制和睡眠恢复均各有独立状态与生命周期。

直接复用久坐提醒或由 renderer 监听输入会混淆业务语义，并且无法可靠地观察其他应用中的全局输入。睡眠/解锁与 renderer 重载也可能留下过期动画。

## Decision

创建独立的 `ScreensaverController`，由主进程持有唯一会话状态和递增 `sessionId`。它单独轮询 `powerMonitor.getSystemIdleTime()`：正常待机为 5 秒，屏保激活后为 1 秒；普通输入恢复会在下一次可用轮询中退出，但不将 OS 调度延迟承诺为硬实时。每段连续闲置仅允许一个会话。

Controller 使用专用设置、IPC 通道和 eligibility guard，不读取或写入 `BreakReminderService` 的业务状态。Windows 活动窗口缓存每 2 秒刷新，使 Guard 的 2 秒 `sampledAt`/`timestamp` 有效期在待机轮询中可用，同时避免每秒启动 PowerShell；非法、过期、未知或显示器查询失败的数据一律拒绝。活动窗口采样契约将“真正全屏”与“最大化”区分：PowerShell 通过 `MonitorFromWindow`/`GetMonitorInfo` 取前台窗口所属显示器完整 `rcMonitor`，仅当窗口非最大化且覆盖完整 monitor bounds 时才标记 `isFullScreen: true`；常规最大化办公窗口（VS Code、Office 等）保持 `isMaximized: true`、`isFullScreen: false`。PowerShell 失败、无效矩形与非 Windows provider 仍返回既有 unavailable 形状，不泄漏额外窗口内容。普通输入后 Controller 立即释放屏保租约并回到待机轮询，渲染器随后完成“被抓包 → 回位”并发送匹配的 `screensaver-finished` 确认；若渲染器在 active 阶段自行安全结束，该确认也会释放租约。Controller 的 `start()`/`stop()`/`dispose()` 严格脱钩与解绑全部 `powerMonitor`、`ipcMain` 与 store 监听器；`stop()` 会先停止轮询状态再取消活跃会话，避免取消路径重建计时器。在 1 秒活跃轮询 tick 中，Controller 持续重查主窗口存活、宠物可见性/暂停与 eligibility guard 状态，中途失效立即取消会话。新增 `InterruptionCoordinator` 原子仲裁久坐提醒与屏保。渲染器只接受带 `sessionId` 的命令，并以独立演出状态机控制画面；选择场景显示器后，调用久坐提醒共用的 `StageGeometry.getCenteredPairLayout()` 计算对应 `walkArea` 的中心与双宠站位，CP 屏保传入该显示器的 DPI 比例，使布局按宠物缩放后的视觉尺寸保持中心对称；粉色氛围层按共享布局跨度扩展，Overlay 与氛围层共同应用该显示器的 DPI 比例。连招播完后在中心等待用户输入；普通输入时，`!` 会先保留一次绘制机会、展示 800ms，并按目标显示器 DPI 定位后再回位。普通输入退出与静默取消遵循幂等保证：同一 `sessionId` 的重复 stop/cancel 或迟到 IPC 不会重复显示感叹号、对话或回位动画——`caught` / `runningBack` 状态收到的重复 `input` stop 直接忽略；静默 cancel 仍可立即重置。闲置期间的状态机改为显式循环边界：已校验的可用 Overlay 不少于两个时，每轮按固定顺序 `shareFood → hug → kiss` 过滤后播放，最后一个 Overlay 清理、idle 间隔结束后重置 `comboIndex` 并开始下一轮，不重新发起素材校验；仅有零或一个可用 Overlay 时安全停在中心 `idle_waiting` 等待用户输入，不播放或循环单个互动。renderer 重载一律取消而不回放。锁屏、睡眠、全屏/演示、隐藏、暂停、禁用与已 settle 的屏幕变化都取消会话并立即恢复入场坐标；仅普通输入恢复播放“被抓包”退出演出。守卫基于 Task 1 的 `isFullScreen` 与完整 `display.bounds` 拒绝真正全屏，不再把“覆盖工作区”当作演示：最大化普通办公窗口返回 `canInterrupt: true`；只有非最大化窗口覆盖完整 `display.bounds` 时才视作无边框演示并拒绝。`stale_cache`、`unknown-state`、`provider-error`、`display-query-failed` 与界面感知禁用语义保持不变。

屏保视觉层独立于天气粒子层。所有动画保持鼠标穿透、非聚焦，并遵循 reduced-motion 降级。首发仅支持 Windows；macOS 在没有可信的前台全屏/演示数据源前保持禁用。

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
- “立即退出”调整为下一次可观测 idle 轮询的目标；首次输入继续透传，真实延迟以主机性能样本验收。
- macOS 首发保持禁用，优先保证不打扰。
- 实现时必须同步更新 `docs/structure.md`、`CHANGELOG.md`、测试和本 ADR 的状态。

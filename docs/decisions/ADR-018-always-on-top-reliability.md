# ADR-018: 窗口始终置顶可靠性增强策略

## Status
Accepted

## Date
2026-05-07

## Context
Electron 的 `alwaysOnTop: true` 配置在绝大多数场景下可以正常工作，但在以下情况下可能失效，导致桌宠窗口被压到底层：

1. **全屏游戏或视频**：部分全屏程序会在切换时重新排列窗口层级。
2. **系统弹窗（UAC、通知）**：系统级弹窗弹出后，窗口层级可能被重新设定。
3. **多显示器切换**：在不同显示器之间切换焦点时，层级偶尔会重排。
4. **窗口最小化/恢复**：某些场景下 `show` 和 `restore` 事件后层级会被重置。

在单纯依赖 `alwaysOnTop: true` 窗口选项的情况下，用户反馈偶有桌宠"消失"（实际上是被遮挡）的现象。

## Decision
采用多层防御策略，确保宠物窗口在各种场景下始终可见：

1. **轮询定时器 (`keepOnTopTimer`)**：每 3 秒调用一次 `keepPetWindowOnTop()`，在周期性轮询中主动重申层级，防止静默被压。
2. **关键事件钩子**：在以下窗口事件中额外触发 `keepPetWindowOnTop()`：
   - `did-finish-load`：渲染器加载完成后立即置顶。
   - `show`：窗口从隐藏恢复显示时。
   - `restore`：窗口从最小化恢复时。
   - `blur`：窗口失去焦点时（最常见的被压场景）。
3. **置顶级别**：使用 `setAlwaysOnTop(true, 'screen-saver')` 而非默认级别，以获得更高的系统层级权限。
4. **`moveTop()` 配合调用**：在 `setAlwaysOnTop` 之后额外调用 `moveTop()`，强制将窗口移至同层级中的最顶层。
5. **`focusable: false`**：将窗口设置为不可聚焦，防止宠物窗口因意外获得焦点而与用户当前操作的程序产生竞争。
6. **`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`**：使窗口在所有虚拟桌面和全屏应用场景下均可见（主要对 macOS 生效，Windows 环境作为保留配置）。
7. **子窗口焦点顺序与层叠分层**：通过应用级窗口焦点事件即时记录顺序，覆盖首次轮询前的快速切换；主窗口（`'screen-saver'` 级）与高于宠物的子窗口（置顶的 `PomodoroWindow`、180ms 脉冲期内的 `SkinSelectorWindow`）保持既有顺序——主窗口抬升后按最近焦点顺序依次抬升这类可见置顶子窗口，焦点切到其他应用时保留该顺序。`StatusWindow`（常驻）与 `SettingsWindow`（聚焦期间）则使用 `'pop-up-menu'` 级并位于主窗口之下，使桌宠与右键菜单（`#context-menu`）始终覆盖在状态与设置窗口之上，同时这两扇窗口仍高于普通应用、Dock、任务栏与全屏空间；二者在打开、聚焦、显示、恢复，以及 Windows 下的拖动结束（`moved`）与鼠标/触控点击（`input-event`）时会回调 `keepPetWindowOnTop()`（macOS 上 `moved` 是 `move` 的别名、拖动时逐帧触发，且层级已保证顺序，因此不在 macOS 回调），确保 Win32 `HWND_TOPMOST` 激活后主透明窗口仍处于其上方且不抢占键盘焦点；Windows 全屏 RDP 抑制仍统一覆盖全部处于 `alwaysOnTop` 状态的桌宠子窗口。

### Windows 全屏 RDP 例外（2026-11-09）

全屏远程桌面需要完整展示远程画面，因此对 Windows 前台进程名为 `mstsc` 或 `msrdc`（大小写不敏感，兼容 `.exe` 后缀）、`isFullScreen: true` 且未最小化的窗口，让 RDP 优先于宠物置顶策略：

- 复用 [ADR-030](./ADR-030-window-awareness.md) 的 2 秒采样，采样回调立即通知 `PetWindow.onActiveWindowChanged()`；未发生保护状态转换时不额外抬升窗口。
- 保护期间调用 `setAlwaysOnTop(false)` 并 `hide()` 主透明窗口，同时隐藏可见且未最小化的置顶子窗口，跳过定时守卫的主/子窗口抬升和重复启动唤回。仅撤销置顶无法保证普通层级的宠物一定被 RDP 遮住，隐藏原生窗口可避免气泡、互动和鼠标命中区域遮挡远程画面。
- 成功采到退出全屏、最小化、其它前台应用或 `no-active-window` 后恢复原生窗口与被保护隐藏且仍存在的子窗口，用 `showInactive()` 保留键盘焦点；原本隐藏、最小化或未置顶的子窗口不受影响，不清除手动、会议、番茄钟的 renderer 隐藏状态。采样失败、超时或重启采样器时维持已生效的保护；已处于隐藏及非置顶态时不再重复调用 `setAlwaysOnTop(false)`，且在保护期遇到进程名瞬时为空的采样时保持既有抑制状态，防止宠物在远程画面上短暂闪现。
- 采样遇到桌宠自身进程的前台窗口时会沿 Z-order 落到其下的全屏 RDP，继续上报 RDP 在前台。因此任一桌宠子窗口持有焦点（如多屏下从另一块屏幕的托盘打开设置或番茄钟）时同样解除保护，等同切到其它本地应用；子窗口失焦回到 RDP 后，由下一次采样或置顶守卫恢复保护（2026-11-26）。
- 对嵌套 RDP、连接栏与系统浮层瞬时切换做了稳定性加固：Windows 采样会将前景的 `BBarWindowClass` 浮动连接栏、`GA_ROOTOWNER` 所有者链以及同 PID 无标题栏或辅助窗口追溯回对应的可见全屏 `mstsc`/`msrdc` 窗口；当 `GetForegroundWindow()` 瞬时返回 `NULL` 时，仅在 Z-order 最顶层非忽略可见窗口确认为全屏 RDP 时维持抑制（不放过已退到普通窗口后面的会话）；同时跳过副屏任务栏（`Shell_SecondaryTrayWnd`）、气泡提示、输入法浮层与 DWM cloaked 窗口，并将无标题栏（`!WS_CAPTION`）且覆盖 `rcMonitor` 的 `mstsc`/`msrdc` 窗口同样视为全屏（带标题栏的最大化窗口仍保持豁免）。
- Windows 关闭窗口感知行走后仍使用同一主进程采样器；仅 RDP 守卫读取原始采样，IPC 和休息提醒、屏保守卫继续返回或读取 `disabled`。休眠时停止采样，唤醒后恢复。不新增进程、不读取远程桌面内容、不改变 macOS 全屏 Space 行为。

保护作用于整个主透明窗口，多屏时会暂时隐藏所有屏幕上的宠物。检测响应受既有采样间隔和系统调度影响，不能保证进入全屏的首帧即隐藏；第三方内嵌 RDP 客户端不在本次进程名匹配范围内。

手动复核：启动修改后的应用，打开状态窗口和置顶番茄钟，将 RDP 切换全屏并等待一次采样，持续观察超过 6 秒，确认宠物和置顶子窗口均不遮挡远程画面；分别测试窗口化、最小化、切回本地应用后的恢复，确认子窗口恢复且不抢焦点；关闭窗口感知行走后重复，并确认手动隐藏宠物仍保持隐藏。多屏时在一块屏幕全屏 RDP，从另一块屏幕的托盘打开设置与番茄钟，确认窗口保持显示；点回 RDP 画面后等待一次采样，确认宠物与置顶子窗口重新隐藏。

API 依据：[Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)、[Microsoft mstsc 全屏及多屏参数](https://learn.microsoft.com/en/windows-server/administration/windows-commands/mstsc)。

> **注意（子窗口）**：对于支持用户切换置顶状态的子窗口（如番茄钟），取消置顶时必须调用 `setVisibleOnAllWorkspaces(false)` 移除全屏 Space 覆盖，并避免在取消置顶后调用 `moveTop()`/`focus()`。启用置顶时再恢复 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`。**已知限制**：若窗口已存在于 macOS 全屏 Space 中，`setVisibleOnAllWorkspaces(false)` 仅阻止窗口跟随到其他 Space，但不会将其从当前全屏 Space 中移除。Electron 未提供将窗口从全屏 Space 移出的可靠 API。

## Alternatives Considered
### 仅依赖 `alwaysOnTop: true` 窗口选项
- **优点：** 实现简单，无额外维护成本。
- **缺点：** 无法应对全屏应用、UAC 弹窗等场景导致的层级重排。实测存在用户可感知的"消失"问题。

### 全窗口统一使用 `'pop-up-menu'` 或 `'torn-off-menu'` 替代 `'screen-saver'`
- **优点：** 所有窗口处于同一更温和的层级，看似更容易统一管理。
- **缺点：** 在 macOS（`NSWindowLevel`）中，`'torn-off-menu'`（3）与 `'pop-up-menu'`（101）实际**低于** `'screen-saver'`（1000），主宠物窗口统一降级会削弱对部分全屏或高优先级系统浮层的覆盖；在 Windows 上这些层级均映射至 `HWND_TOPMOST` 差异不大。因此主窗口、置顶番茄钟与选肤脉冲窗仍保持 `'screen-saver'`，仅 `StatusWindow` 与聚焦期 `SettingsWindow` 使用 `'pop-up-menu'` 位于主窗口之下。

### 监听系统事件（如 `app.on('browser-window-blur')`）而非窗口 `blur`
- **优点：** 事件粒度更细。
- **缺点：** 对于当前需求而言过度设计；轮询定时器已能覆盖所有异步场景。

## Consequences
- **资源消耗**：每 3 秒执行一次轻量级的 `setAlwaysOnTop` + `moveTop` 调用，实测 CPU 开销可以忽略不计。
- **计时器生命周期管理**：`keepOnTopTimer` 在 `mainWindow` 关闭时通过 `clearInterval` 正确清理，不存在内存泄漏风险。
- **用户体验**：桌宠在全屏游戏、视频播放等场景下稳定可见，解决了此前的"消失"问题。
- **键盘焦点**：`focusable: false` 确保宠物窗口不会意外抢占用户在其他应用中的键盘输入焦点。

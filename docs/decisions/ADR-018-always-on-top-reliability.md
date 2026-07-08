# ADR-018: 窗口始终置顶可靠性增强策略

## Status
已接受 (Accepted)

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

> **注意（子窗口）**：对于支持用户切换置顶状态的子窗口（如番茄钟），取消置顶时必须调用 `setVisibleOnAllWorkspaces(false)` 移除全屏 Space 覆盖，并避免在取消置顶后调用 `moveTop()`/`focus()`。启用置顶时再恢复 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`。**已知限制**：若窗口已存在于 macOS 全屏 Space 中，`setVisibleOnAllWorkspaces(false)` 仅阻止窗口跟随到其他 Space，但不会将其从当前全屏 Space 中移除。Electron 未提供将窗口从全屏 Space 移出的可靠 API。

## Alternatives Considered
### 仅依赖 `alwaysOnTop: true` 窗口选项
- **优点：** 实现简单，无额外维护成本。
- **缺点：** 无法应对全屏应用、UAC 弹窗等场景导致的层级重排。实测存在用户可感知的"消失"问题。

### 使用更高层级（如 `'pop-up-menu'` 或 `'torn-off-menu'`）
- **优点：** 可能在 macOS 上更有效。
- **缺点：** 在 Windows 上行为与 `'screen-saver'` 差异不大，且 `'screen-saver'` 已经足够；更高层级可能在某些场景下影响系统交互逻辑。

### 监听系统事件（如 `app.on('browser-window-blur')`）而非窗口 `blur`
- **优点：** 事件粒度更细。
- **缺点：** 对于当前需求而言过度设计；轮询定时器已能覆盖所有异步场景。

## Consequences
- **资源消耗**：每 3 秒执行一次轻量级的 `setAlwaysOnTop` + `moveTop` 调用，实测 CPU 开销可以忽略不计。
- **计时器生命周期管理**：`keepOnTopTimer` 在 `mainWindow` 关闭时通过 `clearInterval` 正确清理，不存在内存泄漏风险。
- **用户体验**：桌宠在全屏游戏、视频播放等场景下稳定可见，解决了此前的"消失"问题。
- **键盘焦点**：`focusable: false` 确保宠物窗口不会意外抢占用户在其他应用中的键盘输入焦点。

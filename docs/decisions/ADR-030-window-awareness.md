# ADR-030: 窗口感知平台采样

## Status
Accepted

## Date
2026-05-28

## Context
桌宠需要感知当前前台应用窗口，并能自然走到该窗口的顶部边缘停留。该能力不能放在渲染进程的游戏循环中轮询系统窗口，也不能破坏鼠标穿透、拖拽、右键菜单和现有多显示器行为。

现有架构已经把系统能力放在主进程，把安全 IPC 暴露放在 `preload.js`，把移动和渲染行为放在 `src/`。多显示器坐标转换集中在 `displayBounds.js`，因此窗口感知也必须沿用这些边界。

后续实现加入了任务栏/Dock 边缘平台。它和活动窗口顶部一样，都是“可站立表面”，但来源和选择频率不同。移动系统需要能同时处理这些 surface platform，同时保持普通桌面 walk area 的兜底行为。

## Decision
将窗口感知实现为主进程 provider 加渲染进程缓存：

- `activeWindowProvider.js` 定义 provider 合同，并负责 Windows 前台窗口采样。
- `activeWindowAwareness.js` 构建渲染进程 payload，将活动窗口 bounds 转换为桌宠主窗口内的 platform 坐标，并在 IPC 推送前去重。
- `preload.js` 只暴露 `getActiveWindowInfo()` 和 `onActiveWindowInfo(callback)`。
- 渲染进程 `WindowAwarenessSystem` 只缓存最新 payload，并用 O(1) 的 `getCurrentPlatform()` 给游戏循环读取。
- `MovementSystem` 通过 `setSurfacePlatforms()` 接收活动窗口平台和任务栏/Dock 平台，只在 idle 重新选择目标时使用它们。

Windows 使用轻量 PowerShell/User32 provider，当前采样间隔为 2000ms。该间隔使 CP 屏保能在 2 秒新鲜度守卫内安全读取缓存，同时避免 500–1000ms 的高频外部进程轮询。renderer 的 `WINDOW_AWARENESS_PLATFORM_TTL_MS` 必须大于采样间隔；当前设置为 22000ms，覆盖两个采样周期再加少量余量。主进程会在窗口字段不变化时按采样间隔刷新同一 payload 的 `sampledAt`，避免去重后 renderer 长时间收不到 IPC，导致本来仍有效的窗口平台在 renderer 侧过期。

macOS 使用 `pmset -g assertions` 检测 `PreventUserIdleDisplaySleep` 断言（通常由视频播放或演示触发），借此模拟 `isFullScreen` 状态，主要用于阻止 CP 屏保。该机制与媒体播放状态强绑定，暂停的视频会解除断言（允许屏保），部分非全屏视频会议（如 Zoom/Meet）可能会保持断言。macOS 的任务栏/Dock 平台可以独立工作，不依赖活动窗口权限。其它平台在活动窗口感知上返回 unavailable fallback。

## 平台选择概率
活动窗口顶部平台的选择概率显式配置为：

```js
CONFIG.WINDOW_AWARENESS_PLATFORM_CHANCE = 0.7
```

当活动窗口顶部 platform 可达时，每只宠物在 idle 重新选目标时有 70% 概率选择该窗口顶部。两只宠物独立计算，因此两只都去窗口顶部的概率是 49%，至少一只去的概率是 91%。

如果这次 70% roll 没有命中，`MovementSystem` 必须在 fallback 选区中排除 `source: 'active-window-top'` 的平台，并且最终目标坐标必须使用实际选中的 area 的 range。这样“设计概率”和“实际坐标范围”保持一致，避免未命中时仍偷偷落到窗口顶部。

任务栏/Dock 平台使用同一套 `surfacePlatforms` 机制，但权重由 `CONFIG.TASKBAR_PLATFORM_WEIGHT` 控制。当宠物已经在活动窗口顶部或任务栏/Dock 边缘上时，有 70% 概率继续沿当前边缘移动，避免刚停下又立刻跳回普通桌面。活动窗口顶部平台使用几何目标线判断“已经站在边缘上”，即使当前 active-window sample 短暂缺失，也可以基于缓存目标继续一次自然的边缘行走。

## 不可用与边界行为
以下场景不生成活动窗口顶部 platform，移动系统回退到普通 walk area：

- 活动窗口不可用或 provider 失败。
- 窗口最小化、最大化、全屏、bounds 无效或太小。
- 窗口顶部太靠近屏幕上缘，宠物无法完整站在可见 walk area 内。
- Window Awareness 被用户关闭。

正在 walking、dragging、interacting 或 busy 的宠物不会被新的活动窗口立即覆盖目标。只有下一次 idle 重新选目标时，新的 surface platform 才会参与选择。

## Alternatives Considered
### 在渲染进程直接查询系统窗口
- 优点：可以直接在移动逻辑中读取窗口状态。
- 缺点：破坏主进程/渲染进程边界，需要在渲染进程访问 Node 或 native API，并可能让游戏循环承担系统调用负担。
- 结论：拒绝。系统窗口采样必须留在主进程。

### 引入 native 活动窗口依赖
- 优点：可能提供更完整的窗口元数据。
- 缺点：增加 Windows/macOS 打包和签名风险。
- 结论：MVP 使用 PowerShell/User32 provider；如后续需要 native provider，必须保持现有 provider 合同不变。

### macOS 原生 Accessibility API 窗口提供者
- 优点：跨平台能力更完整，能像 Windows 一样获取精准的窗口边界。
- 缺点：需要 Accessibility 权限检测、授权引导、未授权 fallback 和额外多显示器测试。
- 结论：延期。目前退而求其次使用 `pmset` 检测防止睡眠断言，满足了防打扰（屏保拦截）的核心诉求，而无需向用户索要无障碍权限。未来如果有需要在 macOS 窗体上漫步，再考虑补齐 Accessibility provider，且必须在缺少权限时保持普通桌面移动可用。

## Consequences
- 活动窗口感知不可用时，渲染进程行为仍保持确定。
- 影响 platform 的字段变化时会推送 IPC；字段不变时也会按采样间隔低频刷新 payload 的 `sampledAt`，避免 renderer TTL 过期。
- 活动窗口变化不会立刻抢走正在移动或交互中的宠物目标。
- renderer TTL 大于主进程采样间隔，避免 `main.platform` 有值但 `renderer.platform` 周期性变成 `null`。
- 70% 的活动窗口顶部概率由配置项表达，测试覆盖命中和未命中两条路径，防止代码再次出现“概率判断”和“实际目标范围”不一致。
- 未来完整的 macOS provider 可在同一合同下实现，并继续保留 permission missing 时的 unavailable fallback。当前基于 `pmset` 的非侵入式方案以最小代价满足了核心场景（屏保防御）。

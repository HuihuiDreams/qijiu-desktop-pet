# ADR-028: 合并显示器指标事件后再适配桌宠窗口

## Status
Accepted

## Date
2026-05-27

## Context
主桌宠窗口是一个覆盖完整虚拟桌面的透明 Electron 窗口。这个窗口会被锁定到所有显示器合并后的边界上，让桌宠可以跨显示器移动，同时仍然保持一个置顶的透明窗口表面。

有一位 macOS 用户反馈，在连接数位画图板后，桌宠图片和窗口会因为不明原因连续 resize 几次，然后才稳定下来。结合当前实现，比较可能的触发原因是数位板驱动在短时间内连续改变显示器指标、数位板映射、工作区或缩放相关数据，从而触发一组 Electron `screen` 事件：

- `display-added`
- `display-removed`
- `display-metrics-changed`

在这次改动之前，每个事件都会立即调用 `fitWindowToAllDisplays()`，重新计算虚拟桌面边界并执行：

- `mainWindow.setMinimumSize(width, height)`
- `mainWindow.setMaximumSize(width, height)`
- `mainWindow.setBounds(bounds)`
- `sendScreenInfo()`

这意味着一次短暂但不稳定的显示器指标变化，会产生多次可见的窗口边界更新。由于 `screen-info` 也会驱动 renderer 里的可行走区域和视觉缩放比例，宠物图片也可能跟着透明宿主窗口一起出现几次尺寸跳动。

还有一个额外风险：目标 bounds 改变时，旧的 `minimumSize` / `maximumSize` 约束可能会和新 bounds 短暂冲突。在 macOS 上，这可能导致系统或 Electron 先进行几次中间尺寸修正，然后才接受最终窗口尺寸。

## Decision
新增一个小的显示器适配辅助模块 `displayFit.js`，并调整主进程窗口适配逻辑：

1. 对连续触发的显示器变化事件做短暂合并。
2. 等事件突发结束后，只应用最后一次窗口适配。
3. 如果当前窗口 bounds 已经等于目标 bounds，就不再调用 `setBounds()`。
4. 设置新 bounds 前，先把 min/max 约束临时放宽到能覆盖当前尺寸和目标尺寸的范围。
5. 窗口移动/缩放完成后，再把最小尺寸和最大尺寸锁回最终目标 bounds。

合并等待时间为 `250ms`，由 `DISPLAY_METRICS_SETTLE_MS` 控制。这个时间足够吸收一组短暂的显示器指标事件，同时也不会让真实的外接显示器插拔显得迟钝。

新的 `lockPetWindowToBounds(bounds)` 同时用于启动阶段和显示器变化后的重新适配，确保初始窗口锁定和后续 refit 使用同一套行为。

## Alternatives Considered
### 继续立即适配

- 优点：实现简单，响应最快。
- 缺点：每个瞬时 `screen` 事件都会可见地改变窗口，并重新发送 renderer 缩放数据。
- 结论：拒绝。用户反馈的问题正是由短时间内不稳定的显示器指标连发导致的。

### 只 debounce `display-metrics-changed`

- 优点：行为变化更窄。
- 缺点：数位板驱动和系统显示器重配置也可能产生 add/remove 类事件；三类显示拓扑事件采用不同策略会让最终行为更难推理。
- 结论：拒绝。统一用一个 scheduler 处理所有需要重新适配窗口的显示器事件。

### 在 macOS 上忽略显示器指标变化

- 优点：可以避开这次 macOS 数位板症状。
- 缺点：真实的工作区、缩放、分辨率、Dock、菜单栏、外接显示器变化也无法正确更新桌宠窗口。
- 结论：拒绝。应用仍然需要正确支持正常的显示器环境变化。

### 使用更长的合并等待时间

- 优点：更可能吸收较慢的驱动事件突发。
- 缺点：真实显示器变化会显得有延迟，宠物也会短暂使用旧的移动边界。
- 结论：暂不采用。`250ms` 是一个较保守的初始值，并且已有单元测试覆盖合并行为。

## Consequences
- 数位板驱动造成的 macOS 显示器指标事件突发期间，桌宠窗口不应再连续可见 resize 多次。
- renderer 的 `screen-info` 会在显示器适配稳定后发送一次，而不是随着每个瞬时事件重复发送。
- 窗口 min/max 约束不再和新的目标 bounds 互相拉扯。
- 显示器拓扑变化生效前会有一个很短的、有意的等待时间。
- `displayFit.js` 是纯逻辑模块，可以在不启动 Electron 的情况下用单元测试验证 debounce 和约束桥接行为。

## 改动文件

| 文件 | 改动 |
|---|---|
| `displayFit.js` | 新增窗口几何相等判断、resize 约束桥接计算、显示器适配 scheduler。 |
| `main.js` | Electron 显示器事件改为通过 scheduler 合并触发，并通过 `lockPetWindowToBounds()` 锁定窗口 bounds。 |
| `test/displayFit.test.js` | 覆盖 bounds 相等判断、约束桥接、事件合并行为。 |

## 验证

- `npm test -- test/displayFit.test.js`
- `npm test`
- `node --check main.js`
- `node --check displayFit.js`
- `node --check test/displayFit.test.js`

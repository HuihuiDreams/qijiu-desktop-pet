# ADR-012: 渲染层性能优化与防抖

## Status
Accepted; StatusBar rendering section superseded by later independent status window architecture

## Date
2026-05-01

## Updates
- 2026-06-30: 本 ADR 中“`StatusBar` 初始化静态 DOM 并增量更新节点”的决策描述适用于当时的内嵌状态面板。当前架构中，`src/ui/StatusBar.js` 只负责把宠物状态快照发送给独立状态窗口；实际 DOM 渲染由 `src/statusWindow.js` 完成，并在内容变化时使用 `replaceChildren()` 重建状态块。状态窗口的尺寸反馈与稳定性约束以后续 [ADR-027](./ADR-027-status-window-width-growth-fix.md) 和 `docs/structure.md` 为准。`PetRenderer` 的 `transform` 移动、状态 dirty check 和主进程内存优化仍是当前有效指导。

## Context
随着游戏的运行，我们发现桌宠应用占用了大量的 CPU 资源，并伴随较高的内存波动。分析后发现，在游戏的主循环（每秒 60 帧）中存在大量的低效 DOM 操作：
1. 宠物的移动通过修改 `style.left` 和 `style.top` 实现，导致浏览器频繁触发极其昂贵的“布局重排”（Layout Thrashing）。
2. `PetRenderer.js` 中无论状态是否改变，每帧都在频繁操作元素的 `classList`。
3. `StatusBar.js` 每次数据更新时，都使用 `innerHTML` 销毁并重建整个状态面板的 DOM 树，产生巨大的垃圾回收 (GC) 压力。

由于 Electron 本质上是 Chromium，DOM 操作的开销会直接转化为内存和 CPU 的高负载。

## Decision
我们决定对渲染层及主进程进行多维度的性能与内存重构：

**渲染层优化：**
1. **硬件加速移动**：将宠物的坐标移动从 `left`/`top` 改为使用 `transform: translate3d(x, y, 0px)`，这会将渲染推给 GPU，完全消除由于移动产生的布局重排。
2. **状态缓存 (Dirty Check)**：在 `PetRenderer` 引入 `_renderedState` 和 `_renderedDirection` 等内部缓存变量。只有当逻辑层的状态实际发生变化时，才触碰 DOM API（如 `classList.add`/`remove`）。
3. **静态 DOM 与增量更新**：重写 `StatusBar`，初始化时一次性建立好 DOM 结构并保留对需要变更的节点（进度条宽度、数值文本）的引用。更新时仅精确修改这些节点的 `style.width` 和 `textContent`，彻底弃用 `innerHTML` 更新模式。

**主进程内存优化：**
1. **禁用站点隔离 (Site Isolation)**：纯本地应用不需要跨站隔离，禁用后可大幅减少多进程的基础内存开销。
2. **限制 V8 堆内存**：通过 `--max-old-space-size=128` 强制 V8 积极回收垃圾内存。
3. **禁用冗余功能**：关闭 `HardwareMediaKeyHandling` 等不需要的 Chromium 特性。

## Alternatives Considered
- **迁移到更底层的渲染引擎 (如 PixiJS/WebGL)**: 虽然性能上限更高，但会增加大量引入成本和重写负担。优先尝试通过 DOM 优化解决。

## Consequences
- **大幅降低 CPU 负载**：避免了无意义的重排和重绘。
- **减少内存抖动与整体占用**：避免了每帧创建新 DOM 节点带来的 GC 峰值，主进程的内存限制有效压低了闲置内存的水位。
- **维护成本微增**：`StatusBar` 的代码结构比直接拼字符串更复杂（需要维护节点引用），但在高频 UI 更新的场景下这是必须付出的代价。

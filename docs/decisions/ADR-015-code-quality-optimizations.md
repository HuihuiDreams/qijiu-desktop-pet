# ADR-015: 代码质量与性能优化 (Code Quality Optimizations)

## Status
Accepted

## Date
2026-05-01

## Context
通过全面的代码审查（Code Review），我们在现有的游戏主循环（Game Loop）和渲染逻辑中发现了两个关键缺陷：
1. **帧率绑定的移动速度（正确性 Bug）**：`MovementSystem` 中的移动距离硬编码为 `pet.speed` 乘以单位向量，导致宠物在 144Hz 显示器上的移动速度远超 60Hz 显示器。
2. **每帧触发昂贵的 DOM 查询（性能黑洞）**：`PetAnimations` 尽管在 `ADR-012` 的优化周期内，但仍在主循环的每帧中调用 `body.querySelector('.pet-image')`，引发极高的 CPU 开销。

## Decision
1. **引入与帧率无关的移动控制 (Frame-rate Independent Movement)**：修改 `MovementSystem` 接收 `deltaMs`（上一帧的时间间隔），通过 `deltaMs / 16.666` 归一化移动速度，确保宠物在任何刷新率的设备上都有完全一致的物理移动表现。
2. **内存级状态缓存 (JS-level State Caching)**：在 `PetAnimations.js` 中新增 `pet._renderedImageSrc` 和 `pet._renderedEmoji` 变量。通过内存中的字符串比对（Dirty Check）代替真实 DOM 访问，彻底消除每帧 60 次以上的 `querySelector` 调用。

## Alternatives Considered
- **忽略刷新率差异**: 仅在标准的 60Hz 屏幕上测试。
  - *Rejected*: 会导致高刷新率用户体验极差（宠物跑得太快）。

## Consequences
- **移动速度完全公平**：解决了跨设备刷新率导致的行为差异问题。
- **CPU 利用率大幅下降**：去除了所有在主循环中不必要的 DOM 查找和读取，使得每帧的 JavaScript 执行时间极大缩短，实现了真正的“无状态变更则零 DOM 操作”。

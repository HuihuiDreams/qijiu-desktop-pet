# ADR-034: UI Performance & Visual Upgrades

## Status
Accepted

## Date
2026-06-06

## Context
在进行了 UI 组件拆分与颜色互换（ADR-033）之后，我们进一步审视了桌宠的视觉效果和渲染性能。
1. **性能瓶颈**：原先宠物打坐、饥饿时的发光特效使用了 CSS `filter: drop-shadow()`。这个滤镜在频繁重绘（例如角色行走或特效闪烁）时，极度消耗 CPU 和 GPU 资源。
2. **缺乏触觉反馈**：右键菜单项、状态栏关闭按钮等可交互元素缺乏点击时的物理触感反馈（Active States）。
3. **视觉风格平庸**：状态面板使用了简单的半透明渐变，缺乏现代 UI 中流行的高级磨砂玻璃（Glassmorphism）和边缘折射质感。同时状态数值在跳动时因为字体宽度不一导致整个面板微弱抖动。

## Decision
我们决定对 UI 进行视觉与性能的同步升级，具体决策如下：

### 1. 硬件加速的光晕特效 (Hardware-Accelerated Aura)
移除所有基于 `filter: drop-shadow()` 的发光实现。改为在 `.pet-body` 挂载 `::before` 伪元素，利用 `radial-gradient` 绘制光晕，并仅通过 `opacity` 和 `transform: scale()` 进行动画处理。
- **优势**：`opacity` 和 `transform` 是复合图层属性，完全交由 GPU 处理，不会触发浏览器的重排（Reflow）和重绘（Repaint），性能开销几乎为零。
- **修正**：移除了伪元素的默认透明度，使其平时完全不可见，仅在打坐、饥饿时通过 `@keyframes` 动画显现。

### 2. 物理触觉反馈 (Tactile Active States)
为所有按钮（`.close-btn`）、菜单项（`.menu-item`）以及宠物本体（`.pet`）增加了 `:active` 状态的缩小动画（`transform: scale(0.95)`）。这为用户的点击操作提供了即时且具有阻尼感的物理反馈。

### 3. 液态玻璃与边缘折射 (Liquid Glass & Refraction)
对 `.status-panel` 和 `.context-menu` 进行了深度美化：
- 加入了多层 `box-shadow`（包括 `inset`）模拟玻璃边缘的受光折射与内部反光。
- **关于透明度**：对于常规网页，通常会降低背景透明度并加上 `backdrop-filter: blur(24px)` 来实现磨砂玻璃。但由于 Electron 桌宠是一个**透明桌面窗口**，CSS 的模糊滤镜无法模糊底层的操作系统桌面（如 Windows 壁纸），会导致透明度过高而文字无法看清。因此，我们**放弃了基于 `backdrop-filter` 的穿透模糊**，恢复了面板底层较高对比度和不透明度的渐变背景，以确保文字（对比度）清晰。

### 4. 数值抖动与排版优化
- 将状态条上的数值显示强制使用等宽字体（`font-family: 'JetBrains Mono', monospace`），确保例如 `10/100` 变化时，数值文本整体宽度不会频繁跳动。
- 采用自定义弹性动画曲线（`cubic-bezier(0.34, 1.56, 0.64, 1)`），使得状态条的长度变化带有微微的回弹效果。

## Alternatives Considered

### 继续使用 filter: drop-shadow() 并节流重绘
- Pros: 代码改动最小，直接维持现有的 CSS 发光逻辑。
- Cons: Electron / Chromium 渲染 `drop-shadow` 的本质是高昂的像素级计算。在桌宠 60FPS 的游戏循环下，哪怕是微小的位移也会导致整体重绘，引起肉眼可见的 CPU 峰值。
- Rejected: 不符合桌面宠物常驻后台、要求极低系统开销的前提。

### 使用 CSS backdrop-filter 模糊底层系统桌面
- Pros: 符合现代 Glassmorphism（毛玻璃）设计规范，视觉效果最佳。
- Cons: Electron 在无边框透明窗口（Transparent Window）下，CSS 无法模糊窗口下方的 Windows/macOS 桌面壁纸，只会导致组件变为透明，严重降低文字对比度。
- Rejected: 受限于技术栈底层渲染机制，改为使用不透明背景配合高亮边框和内阴影（box-shadow inset）来模拟玻璃折射质感。

## Consequences
- **性能提升**：彻底消除了 `drop-shadow` 引起的重绘，游戏主循环的 CPU/GPU 占用显著降低。
- **体验升级**：触觉反馈和弹性的动效增强了桌宠的“生命感”与高级感。
- **渲染限制明确**：通过实践明确了在 Electron 透明窗口下无法直接使用 CSS 模糊 OS 桌面的边界条件。

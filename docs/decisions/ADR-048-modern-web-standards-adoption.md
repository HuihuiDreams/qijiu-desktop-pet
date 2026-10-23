# ADR-048: Modern Web Standards Adoption in Desktop Renderer

## Status
Accepted

## Date
2026-10-22

## Context
DeskPet 运行在 Electron 42+（内置 Chromium 134+ 运行时）之上，原生具备最新的 Web 平台特性与现代 CSS 规范支持。在先前的架构演进中，桌面渲染层（Renderer Process）的若干 UI 与动效组件仍沿用了较旧的 Web 开发范式，存在以下维护性与性能瓶颈：

1. **番茄钟窗口 Tooltip 回流与双重提示问题**：
   在番茄钟静修窗口（`src/pomodoroWindow.js`）中，原 Tooltip 依赖 JavaScript 的 `getBoundingClientRect()` 与 `offsetHeight` 进行几何测量与坐标计算，在高频 hover/focus 时引发同步强制布局回流（Layout Thrashing）；同时 HTML 按钮上的静态 `title` 属性导致浏览器黄色原生提示与水墨提示框重叠冲突，且缺乏符合 WCAG 1.4.13 规范的快捷键（`Escape`）关闭机制。
2. **选肤画廊首屏回流与滚动跳变**：
   皮肤选择器画廊（`src/skin-selector.html`）一次性渲染所有皮肤卡片，缺乏视口离屏渲染优化；此外，若未加限制地对首屏卡片应用延迟渲染，会导致首屏 FCP/LCP 恶化，而若缺少确定的预留占位尺寸，滚动时会产生严重的累积布局偏移（CLS）。
3. **全局主题色半透明 Token 硬编码解耦**：
   `src/index.css` 中的半透明光晕与淡墨 Token（如 `--color-jade-glow`、`--color-gold-glow`、`--shadow-glow-jade` 等）原采用硬编码的 `rgba(r, g, b, a)` 声明，与基准主题色变量（`--color-jade`、`--color-gold` 等）脱节，调整基准色时无法自动派生半透明变体与投影。
4. **对话气泡出入场动效与 JS 定时器割裂**：
   对话气泡（`DialogBubble.js` 与 `PetRenderer.js`）原采用级联双 `setTimeout`（`fadeTimer` 与 `removeTimer`）配合 CSS `@keyframes` 进行退场淡出与节点销毁。在快速连续触发或多宠互动时，易出现定时器幽灵泄漏与 DOM 移除时机与 CSS 动画时长脱节的问题。
5. **右键互动菜单层级堆叠与点击穿透协调**：
   主窗口右键互动菜单（`#context-menu`）原使用 `z-index: 9999` 强制置顶，菜单项由纯 `<div>` 构成，缺乏语义化按钮结构与标准无障碍状态（如忙碌禁用时的 `aria-disabled`）；同时，DeskPet 主窗口具有透明桌面点击穿透特性（`setIgnoreMouseEvents`），菜单的显示、隐藏与键盘 `Escape` 关闭必须与主窗口穿透状态精确同步，严防桌面点击被意外阻断或吞没。
6. **状态条无障碍语义缺失**：
   状态面板中的度量条（`.stat-bar`）原为纯 `<div>` 容器，屏幕阅读器无法获知进度条语义及当前数值；若直接替换为原生 `<meter>` 标签，Chromium Shadow DOM 会封装并剥离自定义水墨流光高光（`.stat-bar-fill::after`）及弹簧物理回弹过渡。

## Decision
我们决定在 DeskPet 渲染层全面采纳现代 Web 原生标准（Modern Web Standards），建立 **Electron 42+ 原生 Chromium 基线**，执行**零外部 Polyfill（Zero External Polyfill）策略**，并在 JavaScript 侧通过可选链与类型守卫实现对 Node.js 桩测试环境（Fake DOM）的**渐进降级兼容器**：

1. **Popover API 与 CSS Anchor Positioning 锚点定位**：
   - 番茄钟窗口的 Tooltip（`#pomodoro-tooltip`）声明 `popover="manual"` 与 `role="tooltip"`，通过原生 Top Layer 提升层级，彻底移除 `getBoundingClientRect()` 与 `offsetHeight`。
   - 样式层采用 CSS 锚点定位规范：`position-anchor: --pomodoro-tooltip-anchor; position-area: block-end; position-try-fallbacks: flip-block;`，由浏览器排版引擎原生接管空间感知与边界翻转。
   - 提示框退场时保持按钮锚点直到 `getAnimations()` 的动画完成，避免 Top Layer 退场期间定位丢失；显示/收起版本校验阻止过期清理影响快速重显，缺少动画 API 或无活跃动画时立即清理。
   - 移除 HTML 原生 `title` 属性，在 `windowI18n.js` 中将翻译文本同步到 `data-tooltip` 与 `aria-label`，避免系统双重提示冲突。
   - 补充 `Escape` 键监听、Tooltip 悬停保持（Hoverable）与焦点触发（Persistent），全面满足 WCAG 1.4.13 标准。
2. **`content-visibility: auto` 与占位尺寸保护**：
   - 在 `src/skin-selector.css` 中严格遵循 `defer-rendering-heavy-content` 指南，仅对首屏视口（前 6 张卡片）以外的离屏卡片应用延迟渲染：`.skin-card:nth-child(n + 7) { content-visibility: auto; contain-intrinsic-size: auto none auto 182px; }`。
   - 确立 `auto none auto 182px` 占位，兼顾未访问前的高度兜底与访问后的真实高度记忆，杜绝滚动 CLS；将悬浮样式收窄为 `.skin-card:hover:not(:disabled)`，防止加载锁定状态误触发浮动动效。
3. **CSS 相对颜色语法 (Relative Color Syntax)**：
   - 在 `src/index.css` 中将 7 个派生半透明色彩与发光阴影统一升级为 `rgb(from var(--color-*) r g b / <alpha>)`。
   - 基准玉色、仙金、丹砂与墨色调整时，半透明光晕与阴影自动联动变化；保留设计师针对水墨质感精调的实色 Token（如 `--color-jade-deep`、`--color-shenjiu-light` 等），避免色域截断。
4. **`@starting-style` 入场声明与 `getAnimations()` 退场协调**：
   - 在 `src/dialog-bubble.css` 中声明 `@starting-style` 实现气泡挂载时的原生声明式渐入过渡，退场使用 `.dialog-bubble--fade-out` 状态目标。
   - 在 `DialogBubble.js` 与 `PetRenderer.js` 中，通过 `typeof bubble.getAnimations === 'function'` 检测现代 Web Animations API，使用 `Promise.allSettled(animations.map(a => a.finished))` 精确协同 CSS 动画结束与 DOM 节点移除；在无该 API 的 Node.js 假 DOM 测试环境中无缝回退到兜底定时器。
   - 在手动 `remove()` 或快速连续触发时，同步调用 `clearTimeout` 清理所有定时器并取消运行中动画，消除幽灵定时器泄漏。
5. **原生 Top Layer 右键菜单与语义化按钮**：
   - 将 `#context-menu` 声明为 `popover="manual"`，重置 Popover 默认样式（`inset: auto; margin: 0;`），彻底淘汰 `z-index: 9999` 与 `touch-action: none`。
   - 菜单项升级为原生 `<button type="button" class="menu-item">`，按规范不赋予 `role="menu"`（建模为浮层内的按钮组），忙碌状态采用 `aria-disabled="true"` 标记并保持键盘可聚焦，并在指针按下与点击时拦截操作。
   - 使用 `:popover-open`、`@starting-style`、`transition-property: opacity, transform, display, overlay;` 及 `transition-behavior: allow-discrete;` 实现流畅的水墨展开与收起动效。
   - 维持 `ContextMenu.js` 与 `PetRenderer.js` 的 `.hidden` 类同步与 `setIgnoreMouseEvents` 协调，增加 `Escape` 全局收起监听，确保透明窗口桌面穿透稳定可靠。
6. **ARIA Meter 语义化与减动效适配**：
   - 遵循 Simplicity First 原则，保留 `.stat-bar` 原生 `<div>` 容器以完整维持 `.stat-bar-fill::after` 水墨流光高光伪元素与 `0.6s cubic-bezier(0.34, 1.56, 0.64, 1)` 弹簧回弹物理过渡。
   - 在容器上补充标准 ARIA 属性：`role="meter"`、`aria-valuemin="0"`、`aria-valuemax="100"`、`aria-valuenow="${value}"`，并生成唯一标签 ID（`stat-label-${pet.id}-${key}`）通过 `aria-labelledby` 关联。
   - 在各组件 CSS（气泡、右键菜单、状态条）中全面补充 `@media (prefers-reduced-motion: reduce)`，系统开启减动效时关闭剧烈位移与回弹物理动效。
7. **零 Polyfill 约束与测试环境优雅降级**：
   - 严禁引入外部 polyfill、第三方组件库或网络 CDN 脚本，确保应用符合严苛的 Content Security Policy（CSP）和极简无依赖打包体积。
   - 渲染层调用现代浏览器 API（如 `showPopover()`、`hidePopover()`、`getAnimations()`）时，统一采用可选链（`el.showPopover?.()`）或类型守卫（`typeof el.showPopover === 'function'`），使得 Node.js test runner 中的轻量级 Fake DOM 桩对象无需模拟完整的 Chromium 特性即可 100% 稳定运行。

## Alternatives Considered
- **引入第三方 UI 库或 Polyfill（如 `@oddbird/css-anchor-positioning`, `popover-polyfill`）**：
  - *优点*：在旧版浏览器或未支持环境中提供垫片。
  - *缺点*：DeskPet 运行在强版本锁定的 Electron 42+ 环境下，Chromium 134+ 已全量原生支持上述规范；引入 Polyfill 会增加包体积、污染 DOM 原型、破坏 CSP 并增加额外的构建/运行时复杂度。
- **将度量条重构为原生 HTML `<meter>` 标签**：
  - *优点*：天然具备浏览器标准语义。
  - *缺点*：Chromium 对 `<meter>` 的 Shadow DOM 封装会导致 `.stat-bar-fill::after` 仙侠水墨高光流光与弹簧物理回弹贝塞尔曲线失效，视觉体验严重降级。
- **纯 JavaScript 动画驱动（如通过 requestAnimationFrame 逐帧插值计算气泡出入场）**：
  - *优点*：动画与 JS 生命周期完全在同一线程。
  - *缺点*：侵占主线程事件循环，增加代码复杂度；相比之下，声明式 `@starting-style` 与 CSS 过渡由合成器线程处理，性能更高且代码更简洁。

## Consequences
- **Positive**:
  - **消除强制回流**：番茄钟悬浮提示与右键菜单消除 `getBoundingClientRect()` 与 `offsetHeight`，彻底根除高频操作下的 Layout Thrashing。
  - **解耦视觉层级**：全面接入原生 Top Layer，消除 `z-index: 9999` 恶性竞争与层叠上下文穿透异常。
  - **视觉稳定性与性能提升**：选肤画廊首屏渲染不降级，离屏卡片延迟加载配合确定的 Intrinsic Size 彻底避免滚动 CLS；相对色彩语法消除了重复的颜色数值定义。
  - **无障碍体验完善**：右键菜单支持键盘 `Tab`、`Escape`、高对比 `:focus-visible` 焦点环与非破坏性 `aria-disabled`；状态条满足标准屏幕阅读器度量规范；全场景覆盖 `prefers-reduced-motion`。
  - **单测无缝兼容**：保持现有测试套件零破坏，Node.js fake-DOM 测试执行速度与通过率不受任何影响。
- **Negative**:
  - 依赖 Electron 42+（Chromium 134+）原生环境，旧版 Electron 或传统浏览器内核无法直接运行（符合本项目桌面宿主基线定位）。

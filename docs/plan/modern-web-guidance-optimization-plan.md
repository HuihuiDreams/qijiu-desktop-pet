# Modern Web Guidance 渲染层现代化重构执行计划

> 状态：已全部执行并通过主 Agent 验收（Completed & Verified）  
> 创建日期：2026-10-22  
> 规范依据：`modern-web-guidance` 标准库（Chrome & Edge Web Platform Best Practices）

---

## 1. Overview & Browser Support Policy

DeskPet 作为基于 Electron（当前依赖 `electron: ^42.2.0`，内置现代 Chromium 内核）的桌面爱宠应用，界面与动效完全由 Chromium 浏览器内核驱动。在现有设计中，由于历史演进，部分渲染层代码依然沿用了老一代 Web 的“手写 JS 模拟几何计算”、“强制同步回流（Layout Thrashing）”以及“多重定时器级联管理”等陈旧范式。

### Browser Support Policy（浏览器支持基线策略）
- **Target Runtime**: Electron 42+（单一固定现代 Chromium 内核，无 Firefox / Safari 跨浏览器兼容包袱）。
- **Polyfill Policy**: **严禁引入外部 Polyfill 依赖**（如 `@oddbird/popover-polyfill`、`@oddbird/css-anchor-positioning`、`interestfor`），严禁加载外部 CDN 脚本（受限于项目严格的本地 CSP `script-src 'self'`）。
- **Feature Detection**: 对 Chromium 原生支持的特性（Popover API、CSS Anchor Positioning、`@starting-style`、`transition-behavior: allow-discrete`、`overlay`、`content-visibility`）直接采用原生标准语法；在 Node.js 单元测试桩环境（Fake DOM）中通过轻量级属性嗅探（如 `typeof el.showPopover === 'function'`、`typeof el.getAnimations === 'function'`）实现优雅降级。

本计划依据 `modern-web-guidance` 规范检索结果，将渲染层按照**收益最大、回归风险从低到高**的原则进行优先级排序与原子任务拆解。在保持仙侠水墨国风视觉 100% 精准还原的前提下，实现代码精简、消除同步回流以及渲染能效提升。

---

## 2. 执行纪律（遵循 Karpathy Guidelines 与 AGENTS.md）

1. **单任务闭环（Goal-Driven Execution）**：严格按照 Task 1 → Task 7 优先级顺序逐个执行，每次只处理一个原子任务。每个 Task 完成后必须通过对应单测与全量 `npm test`，严禁批量混合提交。
2. **测试与文档同步收口（Proactive Documentation & Tests）**：每个 Task 在修改代码的同时，必须同步更新/新增对应的单元测试，并在 `CHANGELOG.md` 的 `Unreleased` 对应分类下记录中文变更说明（注意合并同类项，严禁出现重复标题）。
3. **外科手术式改动（Surgical Changes）**：只修改该任务必须触碰的代码行，严禁顺手格式化或重构无涉代码；对于现有包含源码字符串正则断言的测试用例，必须保持契约平稳迁移。
4. **透明点击穿透底线（IPC & Hit-testing Boundary）**：涉及主窗口浮层（如右键菜单、对话气泡）的重构，必须时刻保持与 `window.electronAPI.setIgnoreMouseEvents` 的租期协调，杜绝点击穿透失效或死锁。

---

## 3. Dependency Graph & Priority Ladder

```text
Phase 1：独立子窗口与纯样式增强（高 ROI、零主进程与透明穿透回归风险）
┌─────────────────────────────────────────────────────────────┐
│ Task 1 (P1): 番茄钟 Tooltip 现代化重构 (Anchor + Popover)     │
│ Task 2 (P2): 皮肤画廊离屏渲染降耗 (content-visibility)       │
│ Task 3 (P3): 全局配色体系现代化 (Relative Color / color-mix) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
               【Checkpoint 1: 独立子窗口与样式零破坏】
                               │
                               ▼
Phase 2：主窗口核心浮层与动效升级（高收益、需协调透明穿透）
┌─────────────────────────────────────────────────────────────┐
│ Task 4 (P4): 对话气泡出入场动效现代化 (@starting-style)      │
│ Task 5 (P5): 宠物右键菜单 ContextMenu 升级 Top Layer Popover │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
               【Checkpoint 2: 主窗口交互与点击穿透验收】
                               │
                               ▼
Phase 3：无障碍语义化打磨与文档收口
┌─────────────────────────────────────────────────────────────┐
│ Task 6 (P6): 状态面板度量条无障碍语义与动效偏好合规升级      │
│ Task 7 (P7): 架构文档更新与 ADR-048 归档收口                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
               【Final Checkpoint: 全量回归与构建验收】
```

---

## 4. Task List

### Phase 1：独立子窗口与纯样式增强（低风险、立竿见影）

---

#### Task 1 (P1)：番茄钟 Tooltip 现代化重构（CSS Anchor Positioning + Popover Top Layer）

- **优先级**：P1（最高——立竿见影消除 72 行冗余 JS 与同步回流）
- **依据指南**：`interest-triggered-tooltips` / `position-aware-tooltips` / `animate-to-from-top-layer` / `accessibility`
- **Description**：
  在 [`src/pomodoroWindow.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pomodoroWindow.js#L263-L364) 中，当前为实现 4 个按钮共用 `#pomodoro-tooltip` 的悬浮提示，手写了 72 行事件与几何计算代码，并在第 316 行通过 `tooltipEl.getBoundingClientRect()` 造成了强制同步回流（Layout Thrashing）。本任务将其重构为原生 Popover Top Layer + CSS Anchor Positioning。
  > **避坑修正**：
  > 1. 遵循 `accessibility` 指南（*"Don't use `title` or `placeholder` as a naming mechanism"*）并避免原生系统黄色 Tooltip 与水墨 Tooltip 双重弹出重叠，按钮上不再恢复原生 `title` 属性，而是统一使用 `aria-label`（无障碍名称）+ `data-tooltip`（视觉提示文本）。
  > 2. 遵循 `interest-triggered-tooltips` 的 WCAG 1.4.13 约束（**Dismissible** 按 `Escape` 可关闭、**Hoverable** 指针移入 Tooltip 不消失、**Persistent** 键盘 `:focus-visible` 同样可触发），在单实例动态复用场景下通过动态绑定 `anchor-name: --pomodoro-tooltip-anchor` + `popover="manual"`（配合 `Escape` 监听与延迟关闭以允许指针移入 Tooltip）实现。
- **Implementation Details**：
  1. 修改 [`src/utils/windowI18n.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/utils/windowI18n.js)：在 `[data-i18n-title]` 更新时，同步写入 `element.dataset.tooltip = translated` 与 `aria-label`，仅在元素未声明 `[data-custom-tooltip]` 时才写 `element.title`（或番茄钟移除 `title` 改用 `data-tooltip`）。
  2. 修改 [`src/pomodoro.html`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pomodoro.html)：
     - 移除 `#pomodoro-pin`、`#pomodoro-close`、`#pomodoro-decrease`、`#pomodoro-increase` 上的静态 `title="..."` 属性，避免原生 Tooltip 重叠。
     - 为 `#pomodoro-tooltip` 声明 `popover="manual" role="tooltip"`（移除 `aria-hidden="true"`，或在打开时关联 `aria-describedby`）。
  3. 修改 [`src/pomodoro.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pomodoro.css)：
     - 使用 CSS Anchor Positioning：`position: fixed; position-anchor: --pomodoro-tooltip-anchor; position-area: block-end; position-try-fallbacks: flip-block; inset: auto; margin: 6px 0;`。
     - 遵循 `animate-to-from-top-layer`：使用 `:popover-open`、`@starting-style`、`transition-property: opacity, transform, display, overlay;` 与单独声明的 `transition-behavior: allow-discrete;`，并补充 `@media (prefers-reduced-motion: reduce)` 降级规则。
  4. 修改 [`src/pomodoroWindow.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pomodoroWindow.js)：
     - 删除 `getBoundingClientRect()`、`offsetHeight`、`isUpperHalf` 等全部几何测算与强制回流代码。
     - 绑定 `mouseenter` / `mouseleave` / `focusin` / `focusout` 及 `keydown (Escape)`，将被激活按钮设为 `target.style.anchorName = '--pomodoro-tooltip-anchor'` 并调用 `tooltipEl.showPopover?.()`。
- **Acceptance criteria**：
  - [x] [`src/pomodoroWindow.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pomodoroWindow.js) 中不再调用 `getBoundingClientRect()` 或 `offsetHeight` 触发同步回流。
  - [x] 鼠标悬停或键盘 Tab 聚焦在置顶、关闭、时间增减按钮上时，水墨风提示框正常淡入，在窗口底部自动向上翻转（`flip-block`），且无系统原生 `title` 提示框重叠。
  - [x] 按下 `Escape` 键可立即关闭当前显示的提示框（符合 WCAG 1.4.13 Dismissible 要求）。
- **Verification**：
  - [x] `node --test test/pomodoroWindow.test.js` 测试通过。
  - [x] 运行 `npm run dev` 手动打开“苍穹静修”（番茄钟），测试顶部与底部按钮悬停、点击置顶文案动态切换及键盘聚焦。
- **Dependencies**：None
- **Files likely touched**：
  - `src/pomodoro.html`
  - `src/pomodoro.css`
  - `src/pomodoroWindow.js`
  - `src/utils/windowI18n.js`
  - `test/pomodoroWindow.test.js`
  - `CHANGELOG.md`
- **Estimated scope**：S（4-5 个文件，逻辑集中）

---

#### Task 2 (P2)：皮肤选择器离屏列表渲染降耗（`content-visibility: auto`）

- **优先级**：P2（低侵入、减少长列表离屏卡片渲染开销）
- **依据指南**：`defer-rendering-heavy-content` / `css`
- **Description**：
  在 [`src/skin-selector.html`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/skin-selector.html) 的 `.skin-gallery` 中，包含多套动态 WebP 皮肤卡片。
  > **避坑修正（遵循 `defer-rendering-heavy-content` 强制规范）**：
  > 指南明确要求：*"DO NOT apply this property to elements within the initial, above-the-fold viewport. Doing so forces the browser to evaluate visibility boundaries before rendering, which paradoxically delays critical page load performance."*
  > 皮肤选择器窗口默认高度为 480px，首屏网格固定可见前 2 行（每行 2–3 张卡片，共前 6 张）。因此**严禁对所有 `.skin-card` 无差别施加 `content-visibility: auto`**，而应使用 `.skin-card:nth-child(n + 7)` 仅针对首屏折线以下（Below the fold）的卡片开启延迟渲染，同时避免禁用按钮在 `:hover` 时误触发浮动样式（遵循 `css` 指南 `button:hover:not(:disabled)`）。
- **Implementation Details**：
  1. 修改 [`src/skin-selector.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/skin-selector.css)：
     ```css
     /* 仅对首屏视口（前 6 张卡片）以外的离屏卡片启用延迟渲染 */
     .skin-card:nth-child(n + 7) {
       content-visibility: auto;
       contain-intrinsic-size: auto none auto 182px;
     }
     ```
  2. 将 `.skin-card:hover` 收窄为 `.skin-card:hover:not(:disabled)`，防止加载锁定期（`disabled`）悬停时仍然触发上浮阴影。
  3. 遵循 `defer-rendering-heavy-content` 的 **MANDATORY Accessibility Verification**，验证键盘 `Tab` 键跨离屏边界顺序导航无焦点丢失。
- **Acceptance criteria**：
  - [x] `.skin-card:nth-child(n + 7)` 具备 `content-visibility: auto` 与 `contain-intrinsic-size: auto none auto 182px`，首屏前 6 张卡片不受额外可见性边界评估拖累。
  - [x] 皮肤画廊上下滚动时无布局跳变（CLS），键盘连续 `Tab` 聚焦可顺畅遍历所有皮肤卡片。
- **Verification**：
  - [x] `node --test test/skinSelectorWindow.behavior.test.js test/skinGallery.test.js` 通过。
- **Dependencies**：None
- **Files likely touched**：
  - `src/skin-selector.css`
  - `test/skinSelectorWindow.behavior.test.js`
  - `CHANGELOG.md`
- **Estimated scope**：XS（2-3 个文件）

---

#### Task 3 (P3)：全局主题色彩现代化（CSS Relative Color Syntax / `color-mix`）

- **优先级**：P3（建立单一色彩数据源，消除硬编码派生 RGBA 变量）
- **依据指南**：`css` / `color`
- **Description**：
  在 [`src/index.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.css#L42-L75) 中，当前硬编码了大量如 `--color-jade-glow: rgba(110, 198, 160, 0.45);` 的派生变量。利用 Chromium 原生支持的 CSS 相对颜色语法（`rgb(from var(...) r g b / alpha)`）或 `color-mix(in srgb, ...)`，统一由基准玉色/金色/丹砂/墨色变量自动派生半透明变量。
  > **避坑修正（遵循 `color` 指南规范）**：
  > 1. `color` 指南指出：*"Before generating tints dynamically, check if you can use an existing, predefined, design token... DO NOT just adjust the lightness channel in oklch/oklab... browsers do not yet implement gamut mapping."* 因此**保留设计师手工精调的实色 Token**（如 `--color-jade-deep`、`--color-shenjiu-light`），**仅对纯 Alpha 通道透明度派生变量**（`--color-jade-glow`、`--color-jade-mist`、`--color-gold-glow`、`--color-crimson-soft`、`--color-ink-faint`、`--shadow-glow-jade`、`--shadow-glow-gold`）采用 `rgb(from var(--color-*) r g b / <alpha>)` 语法，确保在 sRGB 空间下与原 `rgba()` 达到 100% 字节级色彩等价。
- **Implementation Details**：
  1. 修改 [`src/index.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.css)：将 `--color-jade-glow`、`--color-jade-mist`、`--color-gold-glow`、`--color-crimson-soft`、`--color-ink-faint` 及发光阴影改写为基于 `--color-jade`、`--color-gold`、`--color-crimson`、`--color-ink` 的相对颜色语法 `rgb(from var(...) r g b / <alpha>)`。
  2. 在 [`test/indexCss.test.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/test/indexCss.test.js) 中新增对衍生色彩 Token 关联基准变量的断言。
- **Acceptance criteria**：
  - [x] 透明度衍生 Token 全部通过 `rgb(from var(--color-*) r g b / ...)` 动态派生，无硬编码重复 RGB 数值。
  - [x] 现有仙侠面板与特效视觉 100% 像素级一致。
- **Verification**：
  - [x] `node --test test/indexCss.test.js` 测试通过。
- **Dependencies**：None
- **Files likely touched**：
  - `src/index.css`
  - `test/indexCss.test.js`
  - `CHANGELOG.md`
- **Estimated scope**：S（3 个文件）

---

### Checkpoint 1：独立子窗口与全局样式验证
- [x] `node --test test/pomodoroWindow.test.js test/skinSelectorWindow.behavior.test.js test/indexCss.test.js` 全部绿灯。
- [x] 运行 `npm test`，确保无全局样式断言损坏。

---

### Phase 2：主窗口核心浮层与动效升级（高收益、需关注透明穿透）

---

#### Task 4 (P4)：对话气泡出入场动效现代化（`@starting-style` + `getAnimations()` 退场协调）

- **优先级**：P4（消除级联双 `setTimeout` 定时器与 CSS `@keyframes` 割裂）
- **依据指南**：`animate-element-entry-exit` / `motion`
- **Description**：
  在 [`src/ui/DialogBubble.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/ui/DialogBubble.js#L38-L55) 与 [`src/pet/PetRenderer.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pet/PetRenderer.js#L506-L510) 中，每个气泡使用了两个级联的 `setTimeout`（`fadeTimer` 在 `duration - 500ms` 添加淡出类，`removeTimer` 在 `duration` 销毁 DOM）。
  本任务依据 `animate-element-entry-exit` 指南第 2 节（*Animating DOM Insertion and Removal*），改用 `@starting-style` 处理 DOM 插入入场过渡，并在退场时通过切换退出状态 + `getAnimations()` 等待动画完成后安全移除节点（同时对 Node 单测 Fake DOM 环境保持向后兼容）。
- **Implementation Details**：
  1. 修改 [`src/dialog-bubble.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/dialog-bubble.css)：
     - 使用 `@starting-style` 声明 `.dialog-bubble` 初次挂载时的起始样式（`opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.9);`）。
     - 为 `.dialog-bubble--fade-out` 定义退场过渡目标状态（`opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.9);`），并按 `motion` 指南补充 `@media (prefers-reduced-motion: reduce)` 规则（禁用位移缩放、缩短过渡时长）。
  2. 修改 [`src/ui/DialogBubble.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/ui/DialogBubble.js) 与 [`src/pet/PetRenderer.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pet/PetRenderer.js)：
     - 保持 `activeBubbleTimers` 的清晰生命周期管理，当 `fadeTimer` 触发 `.dialog-bubble--fade-out` 后，若环境支持 `bubble.getAnimations()` 且存在活动动画，则通过 `Promise.allSettled(animations.map(a => a.finished))` 联动 `removeTimer` 兜底清理；若立即调用 `remove(petId)` 则同步清理定时器与 DOM 节点，确保 [`test/dialogBubble.test.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/test/dialogBubble.test.js) 中的同步断言与防抖逻辑 100% 兼容。
- **Acceptance criteria**：
  - [x] [`src/dialog-bubble.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/dialog-bubble.css) 包含 `@starting-style` 入场规则与 `@media (prefers-reduced-motion: reduce)` 无障碍减动效支持。
  - [x] 快速连续触发对话或双宠互动时，旧气泡干净移除，无幽灵定时器泄露。
- **Verification**：
  - [x] `node --test test/dialogBubble.test.js test/petRenderer.test.js` 测试通过。
- **Dependencies**：None
- **Files likely touched**：
  - `src/dialog-bubble.css`
  - `src/ui/DialogBubble.js`
  - `src/pet/PetRenderer.js`
  - `test/dialogBubble.test.js`
  - `CHANGELOG.md`
- **Estimated scope**：S（4 个文件）

---

#### Task 5 (P5)：宠物右键互动菜单 ContextMenu 升级原生 Top Layer Popover

- **优先级**：P5（消灭 `z-index: 9999` 与强制回流测量，引入 `@starting-style` 离散过渡与键盘 `Escape` 关闭）
- **依据指南**：`viewport-aware-dropdowns` / `animate-to-from-top-layer` / `accessibility`
- **Description**：
  重构 [`src/ui/ContextMenu.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/ui/ContextMenu.js) 与 [`src/context-menu.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/context-menu.css)，将 `#context-menu` 升级为 Top Layer Popover。
  > **关键架构约束（Electron 透明穿透与多屏边界兼容）**：
  > 1. **为何使用 `popover="manual"` 而非纯依赖 `popover="auto"` 的桌面 Light Dismiss**：当鼠标移出宠物与菜单区域后，主窗口恢复 `setIgnoreMouseEvents(true, { forward: true })`，用户在透明桌面背景上的点击会穿透给操作系统底层软件，Chromium 不会收到点击事件。因此必须保留窗口级 `mousedown` / `blur` / `Escape` 监听与 `ContextMenu.hide()` 显式控制，同时通过 `showPopover()` / `hidePopover()` 将菜单提升至浏览器原生 Top Layer（彻底淘汰 `z-index: 9999`）。
  > 2. **保留多屏工作区安全定位**：继续使用 [`ContextMenu.resolvePosition`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/ui/ContextMenu.js#L56-L89) 处理跨显示器 `walkArea` 边界夹紧（保障 [`test/contextMenuPosition.test.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/test/contextMenuPosition.test.js) 契约），但优化 `measureMenuSize` 消除隐式强制回流抖动（在 `showPopover()` 后直接读取或使用缓存尺寸）。
  > 3. **遵循 `viewport-aware-dropdowns` 与 `accessibility` 强制规范**：
  >    - *"This pattern explicitly models a button group revealed inside a popover rather than a true ARIA menu. Do not apply `role="menu"` or `role="menuitem"`"*：将 `#context-menu` 内的 `<div class="menu-item">` 语义化升级为原生 `<button type="button" class="menu-item">`，并使用 `aria-disabled="true"` 表达忙碌禁用态（遵循 `accessibility` 指南：*"`aria-disabled="true"` keeps the element focusable so users can land on it and learn it's disabled"*）。
  >    - 遵循 `accessibility` 指南（*"DON'T use `touch-action: none` for custom gestures"*），修正 `.context-menu` 上的冗余 `touch-action` 样式。
  > 4. **同步维护状态契约**：在 `show()` / `hide()` 中同步调用 `showPopover()` / `hidePopover()` 并维护 `.hidden` 类（或提供统一的 `isOpen()` 状态），确保 [`src/pet/PetRenderer.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pet/PetRenderer.js#L170) 的 `mouseleave` 穿透判断与 [`test/contextMenuBehavior.test.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/test/contextMenuBehavior.test.js) 无缝衔接。
- **Implementation Details**：
  1. 修改 [`src/index.html`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.html)：
     - 为 `#context-menu` 添加 `popover="manual"`。
     - 将 5 个 `<div class="menu-item" ...>` 升级为 `<button type="button" class="menu-item" ...>`，天然支持键盘 Tab 聚焦与 Enter/Space 激活。
  2. 修改 [`src/context-menu.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/context-menu.css)：
     - 移除 `z-index: 9999`，重置 Popover 默认 `margin: 0; inset: auto;`。
     - 使用 `:popover-open`、`@starting-style`、`transition-property: opacity, transform, display, overlay;` 及单独声明的 `transition-behavior: allow-discrete;` 实现水墨展开与收起过渡，补充 `@media (prefers-reduced-motion: reduce)`。
     - 为 `button.menu-item` 重置按钮默认边框与字体继承（`width: 100%; border: 0; background: transparent; font: inherit; text-align: left;`），支持 `:focus-visible` 轮廓高亮。
  3. 修改 [`src/ui/ContextMenu.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/ui/ContextMenu.js)：
     - 在 `show()` 中调用 `this.menuEl.showPopover?.()`，在 `hide()` 中调用 `this.menuEl.hidePopover?.()`。
     - 忙碌禁用时同步设置 `item.setAttribute('aria-disabled', 'true')`，并在键盘点击（`click`）与指针按下（`pointerdown`）中拦截 `disabled` 项，新增 `Escape` 键关闭菜单支持。
- **Acceptance criteria**：
  - [x] `#context-menu` 位于 Top Layer（无需 `z-index: 9999`），具备 `@starting-style`、`overlay` 与 `transition-behavior: allow-discrete` 过渡。
  - [x] 菜单项为原生 `<button type="button">`，支持键盘聚焦、`Escape` 关闭以及忙碌状态下的 `aria-disabled="true"` 标记。
  - [x] 菜单显示与关闭时，主窗口透明穿透状态与 [`PetRenderer.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pet/PetRenderer.js) 严格同步，绝不锁死桌面点击。
- **Verification**：
  - [x] `node --test test/contextMenuBehavior.test.js test/contextMenuCss.test.js test/contextMenuPosition.test.js` 全部通过。
- **Dependencies**：Task 3 (样式基础)
- **Files likely touched**：
  - `src/index.html`
  - `src/context-menu.css`
  - `src/ui/ContextMenu.js`
  - `test/contextMenuBehavior.test.js`
  - `test/contextMenuCss.test.js`
  - `CHANGELOG.md`
- **Estimated scope**：M（5-6 个文件，需严守穿透边界）

---

### Checkpoint 2：主窗口交互与点击穿透验收
- [x] 全量跑通 `test/dialogBubble.test.js`、`test/contextMenu*.test.js`、`test/petRenderer.test.js`。
- [x] 手动验证或通过 `npm run qa:electron:smoke` 验证双宠闲聊气泡、右键菜单、拖拽与点击穿透一切正常。

---

### Phase 3：无障碍语义化打磨与文档收口

---

#### Task 6 (P6)：状态面板度量条无障碍语义与动效偏好合规升级（ARIA `meter` + `prefers-reduced-motion`）

- **优先级**：P6（0 视觉破坏增强无障碍树语义，保留弹簧过渡与顶部流光伪元素）
- **依据指南**：`accessibility` / `motion`
- **Description**：
  在 [`src/statusWindow.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/statusWindow.js#L62-L85) 中，当前 `.stat-bar` 仅由纯 `<div>` 构成，辅助技术无法获知进度条含义及数值关联。
  > **避坑修正**：
  > 原计划直接替换为 `<meter>` 标签会导致 Chromium Shadow DOM 吞掉 `.stat-bar-fill::after` 的水墨顶部流光（[`src/stat-bar.css#L22-L28`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/stat-bar.css#L22-L28)）以及 `width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)` 弹簧过渡，并破坏 [`test/statBarCss.test.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/test/statBarCss.test.js) 的样式契约断言。
  > 遵循 **Simplicity First** 与 `accessibility` 指南第 2/3 节（*ARIA roles and states* / *Prefer `aria-labelledby` over `aria-label` when a visible label exists*），在 `.stat-bar` 容器上赋予标准 `role="meter"`、`aria-valuemin="0"`、`aria-valuemax="100"`、`aria-valuenow="${value}"`，并通过唯一 ID 用 `aria-labelledby` 关联同行可见的 `.stat-label`，同时在 [`src/stat-bar.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/stat-bar.css) 中补充 `@media (prefers-reduced-motion: reduce)` 规则。
- **Implementation Details**：
  1. 修改 [`src/statusWindow.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/statusWindow.js)：
     - 为每个 `labelEl` 生成唯一 ID（如 `stat-label-${pet.id}-${key}`）。
     - 为 `bar`（`.stat-bar`）设置 `role="meter"`、`aria-valuemin="0"`、`aria-valuemax="100"`、`aria-valuenow="${value}"`、`aria-labelledby="stat-label-${pet.id}-${key}"`。
  2. 修改 [`src/stat-bar.css`](file:///Users/huihui/Documents/qijiu-desktop-pet/src/stat-bar.css)：
     - 保留 `.stat-bar`、`.stat-bar-fill` 及 `.stat-bar-fill::after` 全部现有样式。
     - 遵循 `motion` 指南，在 `.stat-bar-fill` 中补充 `@media (prefers-reduced-motion: reduce)` 缩短或关闭宽度回弹过渡。
- **Acceptance criteria**：
  - [x] 视觉、弹簧过渡动画、顶部流光高光与原本进度条 100% 相同，[`test/statBarCss.test.js`](file:///Users/huihui/Documents/qijiu-desktop-pet/test/statBarCss.test.js) 原有契约全部保留。
  - [x] 屏幕阅读器可通过 `role="meter"` 与 `aria-labelledby` 准确朗读每项属性名称与当前数值。
- **Verification**：
  - [x] `node --test test/statBarCss.test.js test/statusWindowRegression.test.js` 通过。
- **Dependencies**：None
- **Files likely touched**：
  - `src/statusWindow.js`
  - `src/stat-bar.css`
  - `test/statBarCss.test.js`
  - `CHANGELOG.md`
- **Estimated scope**：S（3-4 个文件）

---

#### Task 7 (P7)：架构文档更新与 ADR-048 归档收口

- **优先级**：P7（收尾——系统级记录现代 Web 范式选型与浏览器基线策略）
- **依据指南**：`documentation-and-adrs`
- **Description**：
  在完成上述优化后，同步更新项目架构文档与设计决策记录。
  > **编号修正**：当前 `docs/decisions/` 下最新 ADR 为 `ADR-047-pet-scale-setting.md`（`ADR-013` 已被占用），因此新增 ADR 编号定为 **`ADR-048-modern-web-standards-adoption.md`**。
- **Implementation Details**：
  1. 新增 `docs/decisions/ADR-048-modern-web-standards-adoption.md`（包含标准必需章节：`# ADR-048: ...`、`## Status`、`## Date`、`## Context`、`## Decision`、`## Alternatives Considered`、`## Consequences`），记录在 Electron 42+ 环境下采纳 Popover API、CSS Anchor Positioning、Relative Color Syntax、`content-visibility` 及 `@starting-style` 的架构依据与无 Polyfill 策略。
  2. 更新 [`docs/decisions/README.md`](file:///Users/huihui/Documents/qijiu-desktop-pet/docs/decisions/README.md) 索引表与 [`docs/structure.md`](file:///Users/huihui/Documents/qijiu-desktop-pet/docs/structure.md) 中的 UI 层渲染规范说明。
  3. 更新 [`AGENTS.md`](file:///Users/huihui/Documents/qijiu-desktop-pet/AGENTS.md) 补充 **Browser Support Policy**（明确 Electron 现代 Chromium 基线、免 Polyfill 原则），方便后续 AI Agent 查阅。
  4. 审查并整理 [`CHANGELOG.md`](file:///Users/huihui/Documents/qijiu-desktop-pet/CHANGELOG.md) 中 `Unreleased` 下的变更记录，确保标题无重复。
- **Acceptance criteria**：
  - [x] `ADR-048-modern-web-standards-adoption.md` 完整归档，并通过 `node --test test/check_adrs.test.js` 及 `node scripts/check_adrs.js` 校验。
  - [x] `docs/structure.md` 与 `AGENTS.md` 准确反映当前渲染层技术选型与 Browser Support Policy。
  - [x] `CHANGELOG.md` 格式规范、无重复分类标题。
- **Verification**：
  - [x] `npm test` 全量单元测试 100% 通过。
- **Dependencies**：Tasks 1–6
- **Files likely touched**：
  - `docs/decisions/ADR-048-modern-web-standards-adoption.md`
  - `docs/decisions/README.md`
  - `docs/structure.md`
  - `AGENTS.md`
  - `CHANGELOG.md`
- **Estimated scope**：S（4-5 个文档文件）

---

## 5. Risks and Mitigations (风险与兜底措施)

| 潜在风险点 | 风险等级 | 防御与兜底策略 |
| :--- | :---: | :--- |
| **Electron 透明穿透与 Popover Light Dismiss 死锁** | **高** | 主窗口 `#context-menu` 采用 `popover="manual"` 结合显式 `showPopover()` / `hidePopover()`，保留多屏 `resolvePosition` 与 `.hidden` 状态同步，防止桌面点击被穿透后菜单无法关闭或吞掉桌面图标点击。 |
| **首屏元素误用 `content-visibility: auto` 拖慢首帧** | **中** | 严格遵循 `defer-rendering-heavy-content` 规范，使用 `.skin-card:nth-child(n + 7)` 仅对首屏折线以下的离屏卡片启用延迟渲染，并配对 `contain-intrinsic-size: auto none auto 182px`。 |
| **单测 Fake DOM 环境缺少现代 Web API** | **中** | 项目单测（如 `test/contextMenuBehavior.test.js`、`test/dialogBubble.test.js`）运行在 Node.js 手写桩对象上，调用 `showPopover`、`hidePopover`、`getAnimations` 时统一使用可选链或类型守卫（`typeof el.showPopover === 'function'`）。 |
| **`<meter>` Shadow DOM 破坏自定义流光伪元素** | **低** | Task 6 采用 `role="meter"` + `aria-valuenow` + `aria-labelledby` 原地升级 `.stat-bar`，100% 保留 `.stat-bar-fill::after` 水墨高光与弹簧过渡。 |

---

## 6. 全量验证命令速查表

```bash
# 1. 运行核心 UI 关联单元测试
node --test test/pomodoroWindow.test.js test/skinSelectorWindow.behavior.test.js test/indexCss.test.js test/dialogBubble.test.js test/contextMenuBehavior.test.js test/contextMenuCss.test.js test/contextMenuPosition.test.js test/statBarCss.test.js test/statusWindowRegression.test.js

# 2. 运行 ADR 文档格式与完整性校验
node --test test/check_adrs.test.js

# 3. 运行全量单元测试套件
npm test
```

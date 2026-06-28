# 🎨 前端 UI 工程审查 — 岳七 & 沈九桌宠

> 整体评价：这个项目的 UI 工程质量**相当高**。设计系统完整（自定义属性、语义化变量）、动画细腻、代码组织清晰。下面按优先级列出可改进的点。

---

## ✅ 做得好的地方

| 维度 | 亮点 |
|------|------|
| 设计系统 | 完整的 CSS 自定义属性体系（颜色、间距、圆角、阴影），面板样式高度复用 `--panel-*` |
| 主题一致性 | 水墨仙侠美学贯穿始终，jade/gold/crimson/ink 色调和谐 |
| 动画 | walkBounce、sleepBreath、interactJoy 等动画各具性格，cubic-bezier 选型考究 |
| 性能 | `translate3d` + `scale` 避免 layout thrashing，`will-change` 使用克制 |
| 渲染优化 | `PetRenderer.update()` 用脏标志 `_renderedState` 跳过无变更帧 |
| 可访问性 | pomodoro.html 用了 `aria-live`、`aria-pressed`、`role="progressbar"` |
| 动效减弱 | `effects.css` 有 `prefers-reduced-motion: reduce` 处理 |

---

## 🔶 建议改进（按优先级排序）

### P1 — 可访问性 (Accessibility)

#### 1. 右键菜单缺少键盘导航和 ARIA 角色

[ContextMenu.js](file:///Users/huihui/Documents/qijiu-desktop-pet/src/ui/ContextMenu.js) 和 [index.html](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.html) 中，context menu 使用的是纯 `div`，没有 `role="menu"` / `role="menuitem"`，也没有键盘导航（方向键、Escape 关闭）。

```diff
 <!-- index.html -->
-<div id="context-menu" class="context-menu hidden">
-  <div class="menu-header" id="menu-header">角色名</div>
-  <div class="menu-item" data-action="feed" ...>🍎 喂食</div>
+<div id="context-menu" class="context-menu hidden" role="menu" aria-label="宠物菜单">
+  <div class="menu-header" id="menu-header" role="presentation">角色名</div>
+  <div class="menu-item" data-action="feed" role="menuitem" tabindex="-1" ...>🍎 喂食</div>
```

JS 侧需要添加：
- **Escape** 关闭菜单
- **↑/↓** 在菜单项间移动焦点
- 菜单打开时将焦点移到第一个可用菜单项

> 虽然桌宠的目标用户群可能不需要严格的无障碍支持，但键盘导航（尤其 Escape 关闭）是基本 UX 预期。

#### 2. 状态面板关闭按钮缺少 `aria-label`

[index.html L36](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.html#L36):
```diff
-<button id="status-close" class="status-close">✕</button>
+<button id="status-close" class="status-close" aria-label="关闭状态面板">✕</button>
```

#### 3. `focus-visible` 样式不完整

[pomodoro.css](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pomodoro.css#L257-L264) 和 [city-setting.css](file:///Users/huihui/Documents/qijiu-desktop-pet/src/city-setting.css#L222-L227) 有 `focus-visible` 样式，但主窗口的 [index.css](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.css) 中完全没有。`.status-close` 按钮没有 focus 样式。

```css
/* index.css — 建议添加 */
.status-close:focus-visible {
  outline: 2px solid rgba(110, 198, 160, 0.7);
  outline-offset: 2px;
}
```

---

### P2 — CSS 架构与一致性

#### 4. `update-progress.css` 脱离了设计系统

[update-progress.css](file:///Users/huihui/Documents/qijiu-desktop-pet/src/update-progress.css) 使用了硬编码颜色（`#202124`、`#fbfbf8`、`#e3e6df`），没有引用 `index.css` 的自定义属性。和其他面板（pomodoro、status、city-setting）的视觉风格完全不同。

**建议**：像其他子窗口一样引入 `index.css`，并复用 `--panel-*` 和 `--color-*` 变量。

#### 5. `status.css` 与 `index.css` 中存在重复的状态面板样式

[index.css L254-L475](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.css#L254-L475) 定义了一套 `.status-panel`、`.stat-row`、`.stat-bar` 等样式（用于主窗口内嵌面板）。[status.css](file:///Users/huihui/Documents/qijiu-desktop-pet/src/status.css) 则为独立窗口重新定义了这些相同的选择器。

> 两者的 `.stat-bar-fill--*` 渐变色是一样的，但 `.status-panel` 定位方式不同（fixed vs relative）。

**建议**：
- 将共享的 stat-bar 组件样式（`.stat-row`、`.stat-bar`、`.stat-bar-fill`、`.stat-value`）提取到一个 `components/stat-bar.css` 中
- 两个文件都引用它，各自只写差异部分

#### 6. 面板装饰样式（`::before` / `::after`）重复 4 次

`pomodoro.css`、`status.css`、`city-setting.css`、`index.css` 中都有几乎一模一样的面板装饰伪元素代码（`::before` 用 `inset: 9px` 画内框，`::after` 画上下分隔线）。

**建议**：抽出一个 `.xianxia-panel` 基类：

```css
/* 共用面板基础装饰 */
.xianxia-panel {
  position: relative;
  overflow: hidden;
  background: var(--panel-bg);
  border: var(--panel-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--panel-shadow);
}
.xianxia-panel::before { /* ... */ }
.xianxia-panel::after  { /* ... */ }
.xianxia-panel > * { position: relative; z-index: 1; }
```

---

### P3 — 渲染与性能

#### 7. `DialogBubble` 的 `setTimeout` 泄漏风险

[DialogBubble.js](file:///Users/huihui/Documents/qijiu-desktop-pet/src/ui/DialogBubble.js) 中 `show()` 里的 fade/remove timer 管理是正确的（通过 `activeBubbleTimers` Map 追踪并在 `remove()` 中清除）。但 [PetRenderer.js L371-L372](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pet/PetRenderer.js#L371-L372) 中的 `showOverlayBubbles` 用的是裸 `setTimeout`，没有任何清理机制：

```js
setTimeout(() => el.classList.add('dialog-bubble--fade-out'), duration - 500);
setTimeout(() => el.remove(), duration);
```

如果在 timer 到期前调用 `hideOverlay()`，这些定时器仍然会尝试操作已移除的元素。虽然不会 crash（`el.remove()` 幂等），但更稳健的做法是：

```js
// 保存 timer 引用，hideOverlay 时 clearTimeout
```

#### 8. SpriteView 中 `_resolveSpriteKey` 和 `_resolveResource` 逻辑重复

[SpriteView.js L123-L133](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pet/SpriteView.js#L123-L133) 的 `_resolveSpriteKey()` 和 [L135-L171](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pet/SpriteView.js#L135-L171) 的 `_resolveResource()` 有大量相同的状态映射逻辑（hungry → idle、night → sleeping、walking → direction 等）。

**建议**：统一为一个 `_resolveVisualState(pet)` 返回规范化的状态 key，两个方法都调用它。

---

### P4 — HTML 结构 & 语义化

#### 9. `index.html` 使用 `<script>` 标签加载 18 个文件，无模块系统

[index.html L41-L59](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.html#L41-L59) 按顺序加载 18 个 `<script>`，依赖全局变量作为模块间通信方式（`class ContextMenu` 暴露为 `window.ContextMenu`）。

> 这在 Electron 项目中是可行的，但有几个实际问题：
> - 加载顺序错误会导致运行时错误，且难以排查
> - 没有 tree-shaking，所有代码都会被加载
> - cache busting 靠手动 `?v=N`

**建议（低优先级）**：如果未来有精力，可以引入简单的打包工具（如 esbuild 单文件打包），用 `import`/`export` 替代全局变量。这不是当务之急。

#### 10. `<html lang>` 在子窗口中硬编码为 `zh-CN`

[pomodoro.html](file:///Users/huihui/Documents/qijiu-desktop-pet/src/pomodoro.html#L2), [status.html](file:///Users/huihui/Documents/qijiu-desktop-pet/src/status.html#L2), [city-setting.html](file:///Users/huihui/Documents/qijiu-desktop-pet/src/city-setting.html) 都写死了 `lang="zh-CN"`，而主窗口 [index.html](file:///Users/huihui/Documents/qijiu-desktop-pet/src/index.html#L2) 是 `lang="zh"`（且 `applyI18n()` 会动态更新它）。

子窗口的 JS 初始化时应该也同步设置 `document.documentElement.lang`。

---

### P5 — 小细节

#### 11. `context-menu.css` 中 `.menu-item:active` 有 `transform: scale(0.98)` 但缺少 `transition`

```css
.menu-item:active {
  background: rgba(110, 198, 160, 0.2);
  transform: scale(0.98);  /* 没有 transition，是瞬间跳到 0.98 */
}
```

在 `.menu-item` 的 `transition` 属性中已有 `padding-left 0.2s`，但没有 `transform`。建议添加：

```diff
 .menu-item {
   transition:
     background 0.2s ease,
     color 0.2s ease,
-    padding-left 0.2s ease;
+    padding-left 0.2s ease,
+    transform 0.1s ease;
 }
```

#### 12. `status-footer` 颜色为白色半透明 `rgba(255, 255, 255, 0.9)`

[status.css L197](file:///Users/huihui/Documents/qijiu-desktop-pet/src/status.css#L197) — 在浅色面板背景上，白色文字几乎不可见。这看起来是有意为之（隐蔽水印），如果确实如此则无需修改。

#### 13. 缺少全局 `prefers-color-scheme` 处理

`effects.css` 对 `prefers-reduced-motion` 做了处理 ✅，但没有对暗色模式做任何处理。在 Electron 桌宠这个场景下可能不需要（透明背景），但如果子窗口（pomodoro、status）在深色系统主题下显示，可能会不协调。

---

## 🎯 推荐行动排序

| 优先级 | 改进项 | 预估工作量 |
|--------|--------|-----------|
| 🔴 P1 | 右键菜单键盘导航 + ARIA | 约 1 小时 |
| 🔴 P1 | 状态面板关闭按钮 `aria-label` | 5 分钟 |
| 🔴 P1 | 主窗口 `focus-visible` 样式 | 15 分钟 |
| 🟡 P2 | `update-progress.css` 接入设计系统 | 30 分钟 |
| 🟡 P2 | 提取共享面板装饰基类 | 45 分钟 |
| 🟢 ~~P3~~ | ~~overlay bubble 定时器清理~~ | ✅ 已完成 |
| 🟢 ~~P3~~ | ~~SpriteView 状态映射去重~~ | ✅ 已完成 |
| ⚪ P4 | 子窗口 lang 属性同步 | 10 分钟 |
| ⚪ P5 | 菜单项 active 过渡动画 | 5 分钟 |

> [!TIP]
> 整体 UI 工程质量很好。上面的大多数改进是"锦上添花"。如果要从中选最值得做的 **3 件事**，我推荐：**右键菜单键盘导航**、**提取面板装饰基类（减少重复）**、**overlay bubble 定时器清理**。

需要我动手实现其中的任何改进吗？

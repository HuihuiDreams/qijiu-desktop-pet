# ADR-027: 修仙状态窗口宽度自动增大修复

## Status
Accepted

## Date
2026-05-27

## Context
有 Windows 用户反馈，修仙状态窗口打开后宽度会持续自动变宽，最终撑到很宽。视频复现截图可以清晰看到窗口在每次数据刷新后都比上次宽一点点。

根因是一个渲染→调整→渲染的反馈循环（feedback loop）：

1. `renderStatus()` 在渲染完宠物数据后，于 `requestAnimationFrame` 回调里读取 `.status-panel` 的 `getBoundingClientRect().width`，再加 20px（body padding 补偿）后通过 IPC 发给主进程。
2. 主进程调用 `statusWindow.setContentSize(width, height)` 扩大窗口内容区。
3. `.status-panel` 的 CSS 是 `width: 100%`，所以窗口变宽后 panel 也随之变宽。
4. 下次 `renderStatus()` 触发时，`getBoundingClientRect().width` 就比上次大，循环重复。

```
renderStatus()
  → getBoundingClientRect().width   ← 跟随窗口宽度，并非内容固有宽度
      → + 20px padding 补偿
        → setContentSize(更大的宽度)
            → panel width:100% 撑满更大的内容区
                → 下次 getBoundingClientRect() 又更大
                    → ∞ 增大
```

这个循环在 macOS 上不易复现，因为 macOS 的 `setContentSize` 在值接近时会内部去重；而 Windows 每次调用都会真实触发 resize 事件，导致循环被稳定驱动。

## Decision
将 `.status-panel` 的 CSS 宽度从 `width: 100%` 改为 `width: max-content`（加 `min-width: 320px` / `max-width: 480px` 兜底），并在 JS 中改为读取 `panel.scrollWidth` 而不是 `getBoundingClientRect().width`。

### 为什么 `max-content + scrollWidth` 能打断循环

- **`width: max-content`**：panel 的宽度由内容的固有尺寸决定，而不是由父容器（即 Electron 内容区）决定。无论 `setContentSize()` 将窗口调整到多宽，panel 本身的宽度只取决于文字和布局，保持稳定。
- **`scrollWidth`**：返回元素的内容固有宽度（滚动宽度），不受 `overflow: hidden` 和父容器尺寸约束。只要内容没有变化，`scrollWidth` 在每次 resize 后都返回相同的值。

对比：

| 属性 | 含义 | 循环风险 |
|---|---|---|
| `getBoundingClientRect().width` | 元素实际渲染宽度，受父容器限制 | `width: 100%` 时跟随窗口增大 ❌ |
| `scrollWidth` | 内容固有宽度，不受父容器限制 | `width: max-content` 时与窗口宽度无关 ✅ |

高度方向继续使用 `contentEl.scrollHeight` 加固定 padding 常量自动适应，因为高度不存在同样的反馈问题（窗口高度不会影响行内流式布局的高度）。

### min-width / max-width 的作用

- `min-width: 320px`：防止在极端情况（字体加载失败、内容为空）下窗口过窄。
- `max-width: 480px`：防止长宠物名或异常内容导致窗口失控地宽。

## Alternatives Considered

### 硬编码固定宽度（如 `width: 360px`）

- 优点：彻底断开宽度反馈循环，完全可预测。
- 缺点：不同系统的 fallback 字体（`KaiTi` → 系统 cursive）渲染宽度不同；多语言（英/日）下宠物名字长度不同；Windows DPI 缩放（125% / 150%）会让文字实际占用更多像素，可能造成内容在固定宽度内换行或溢出。
- 结论：拒绝。字体自适应比固定值更健壮。

### 在 JS 中一次性测量，之后不再 resize

- 优点：避免周期性调用。
- 缺点：如果语言切换或内容更新导致尺寸变化，窗口不会跟着更新，体验更差。
- 结论：拒绝。每次内容更新后都应同步调整窗口尺寸。

### 在主进程侧对 resize 请求做去抖或幂等判断

- 优点：不需要改 CSS 和测量方式，只在主进程拦截重复的 resize。
- 缺点：治标不治本；如果内容每次渲染都发来不同的宽度（即便差值很小），去抖窗口会影响正常的高度自适应。
- 结论：拒绝。根因在渲染侧的测量逻辑，应在那里修复。

### 不使用 `requestAnimationFrame`，直接同步测量

- 优点：减少一帧延迟。
- 缺点：DOM 更新后同步读取尺寸，此时浏览器可能还没有完成布局，读到旧值。
- 结论：拒绝。保留 `requestAnimationFrame` 确保布局已经稳定。

## Consequences
- 修仙状态窗口宽度在内容不变时保持稳定，不再在 Windows 上持续自动增大。
- 窗口宽度会根据实际字体渲染尺寸自适应（320px–480px 范围内），在不同系统字体和 DPI 缩放下都能正常显示内容。
- 语言切换后，如果多语言文案的宽度不同，窗口会重新适配，不会出现内容溢出或过窄。
- **注意**：新增 UI 元素到 `.status-panel` 时，应保证其不会在 `min-width: 320px` 下换行，也不会在 `max-width: 480px` 下溢出。

## 涉及文件 (Files Changed)

| 文件 | 修改内容 |
|---|---|
| `src/status.css` | `.status-panel` 从 `width: 100%` 改为 `width: max-content; min-width: 320px; max-width: 480px` |
| `src/statusWindow.js` | `renderStatus()` 改为读取 `panel.scrollWidth`（内容固有宽度）代替 `getBoundingClientRect().width`，并附有注释说明循环原理 |

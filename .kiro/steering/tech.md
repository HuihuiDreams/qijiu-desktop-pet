---
inclusion: always
---

# 技术栈

- Electron 45+(Chromium 156+),Node >= 22.12.0
- 渲染进程使用原生 JavaScript 与标准 CSS,无打包器、无框架
- 依赖:`electron-store`、`electron-log`、`electron-updater`
- 测试:Node 内置 test runner(`test/`)与 Playwright(E2E / Electron 冒烟)
- 打包:`electron-builder`(Windows NSIS x64;macOS dmg/zip,x64 与 arm64)

# 常用命令

| 目的 | 命令 |
| --- | --- |
| 单元测试 | `npm test` |
| 集成测试 | `npm run test:integration` |
| 全部测试 | `npm run test:all` |
| ADR 检查 | `npm run check:adrs` |
| Electron 冒烟 | `npm run qa:electron:smoke` |
| 提交并推送(含预检) | `./push.sh`(Windows 用 `.\push.ps1`) |

`npm run dev`、`npm run test:e2e` 等长时间运行或带窗口的命令由用户自己在终端执行,不要在 agent 的 shell 中直接启动。

# 浏览器与 Web 标准策略

1. 渲染代码直接面向现代 Chromium 标准,不引入 polyfill、外部组件库或 CDN 脚本/样式,保持严格 CSP 与零依赖的渲染层。
2. 优先使用原生标准:
   - Popover API(`popover="manual"`、`showPopover()`、`hidePopover()`)实现顶层提升,避免 `z-index` 竞争
   - CSS Anchor Positioning 实现 tooltip
   - CSS Relative Color Syntax 生成派生透明色与发光阴影
   - `@starting-style`、`overlay`、`transition-behavior: allow-discrete` 实现顶层元素进出场过渡
   - `content-visibility: auto` 配合 `contain-intrinsic-size` 处理长列表(如皮肤图库)
   - 标准 ARIA 语义(`role="meter"` 配 `aria-labelledby`、`aria-disabled="true"`)与 `@media (prefers-reduced-motion: reduce)`
3. 单元测试使用轻量 fake-DOM。渲染代码里所有现代 Web API 调用必须做特性检测或可选链(如 `el.showPopover?.()`、`typeof el.showPopover === 'function'`),并提供回退定时器,保证 fake-DOM 下不报错。

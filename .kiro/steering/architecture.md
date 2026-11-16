---
inclusion: always
---

# 架构边界

1. 主进程(`main.js`):系统任务、原生窗口管理、托盘、IPC 路由、`electron-store`。
2. Preload(`preload.js` 及各子窗口 preload):通过 `window.electronAPI` 暴露安全 API。
3. 渲染进程(`src/`):游戏循环、各系统与 UI 渲染。渲染代码中不得直接使用 Node API。
4. IPC 安全边界:换肤、受保护资源加载、文件系统访问等敏感操作,必须在主进程 IPC handler 中校验并授权。限制 sender ID 时,保留并暴露 E2E QA 入口(如 `app.openSkinSelectorForQA`),避免冒烟测试死锁。IPC 约定见 `ipcContracts.js`。

# 运行时约束

## 游戏循环与时间跳变(`src/app.js`)
- 每步迭代用 `try/catch` 包裹,渲染进程异常不能拖垮整个应用。
- 在过渡帧同步精灵朝向,避免视觉闪烁。
- 计算帧间耗时或问候语时,要防范系统睡眠/唤醒造成的时间跳变(macOS Dark Wake、通宵睡眠),对最大时间增量做钳制或校验。
- 解析外部 API 指标(如天气坐标、温度)时,严格使用有限数校验(`firstFiniteNumber`),避免 `Number(null)` 隐式变成 `0`。

## 窗口管理(macOS 与 Windows)
- 修改窗口状态(`alwaysOnTop`、全屏或空间切换时的可见性,包括番茄钟等子窗口)时,要考虑 macOS 的空间隔离与全屏窗口重排,避免窗口被困在某个空间或被隐藏。

## 输入与拖拽
- 默认 `setIgnoreMouseEvents(true, { forward: true })`。
- 仅在悬停可交互元素时切换为 `false`。
- 拖拽期间设置 `isDragging = true`,并暂停 `MovementSystem` 与 `InteractionSystem`。

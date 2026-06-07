# ADR-014: Electron 安全加固 (Security Hardening)

## Status
Accepted

## Date
2026-05-01

## Context
随着桌宠应用功能的完善，我们认识到作为一个基于 Electron (^33.0.0) 的桌面级应用，安全隔离是重中之重。默认情况下，Electron 允许所有的权限请求，且没有限制窗口导航或新窗口的打开。如果发生了 XSS 攻击，桌宠可能会被用作攻击向量。

## Decision
我们决定严格按照官方的 [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security) 进行安全加固：
1. **拦截未授权权限请求**：在 `session.defaultSession.setPermissionRequestHandler` 中拦截并默认拒绝 (`callback(false)`) 一切权限请求，因为纯净的桌宠不需要摄像头、麦克风等系统权限。
2. **禁用新窗口与导航**：通过 `webContents.setWindowOpenHandler` 返回 `deny` 拦截新窗口，并通过监听 `will-navigate` 事件调用 `event.preventDefault()` 彻底封锁应用的页面导航能力。
3. **内容安全策略 (CSP)**：在 `index.html` 中引入严格的 CSP `<meta>` 标签：`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;`。

## Alternatives Considered
- **不进行任何拦截**: 由于应用是本地静态资源驱动的桌宠，被攻击的可能性相对较低。
  - *Rejected*: 为了遵循最佳实践并防止未知的 XSS 向量，仍需采取基本的防御措施。

## Consequences
- **大幅提升安全性**：全面消除了基于导航和资源加载的潜在安全隐患。
- **限制功能扩展**：未来若需要桌宠展示外部网页、拉取远程资源，必须显式修改安全拦截策略。

## 补充：IPC 边界输入校验 (2026-06-04)

随着 renderer 通过 `window.electronAPI` 触达的主进程能力增多，IPC 本身也成为安全边界的一部分。即使当前 renderer 代码可信，也应避免把 renderer 传入值直接交给主进程窗口管理、鼠标穿透、皮肤切换等系统行为。

本次补充采用以下约束：

1. **主进程边界校验**：新增 `ipcContracts.js`，在主进程 IPC handler 入口归一化或拒绝 renderer 提供的参数。
2. **只允许明确值域**：macOS 窗口迁移方向只接受 `left`、`right`、`top`、`bottom`；皮肤切换只接受 `scanAvailableSkins()` 扫描到的皮肤 ID。
3. **限制可转发选项**：鼠标穿透请求只保留支持的 `forward` 和 `leaseMs` 字段，并限制 lease 时长，避免 renderer 传入任意 Electron options。
4. **订阅生命周期一致**：`preload.js` 中暴露的 `window.electronAPI.on*` 订阅统一返回 cleanup 函数，减少重复初始化或窗口重建时的监听器泄漏风险。

这些调整不改变既有 renderer 调用方式，但让 preload/main 的边界更难误用。未来新增 IPC 时也应优先在边界处定义并测试输入合约。

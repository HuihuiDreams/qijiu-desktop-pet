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

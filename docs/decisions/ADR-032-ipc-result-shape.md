# ADR-032: IPC 返回形状统一

## Status
Accepted

## Date
2026-06-04

## Context
`window.electronAPI` 暴露给渲染进程的 IPC 调用长期按各自场景返回不同形状：

- `saveData()` 返回 `true` 或 `false`。
- `loadData()` 返回具体值或 `null`。
- `setLocale()` 返回 `{ success, locale? }`。
- `setAutoLaunch()` 和 `getAutoLaunch()` 返回更丰富的状态对象。

这些形状都能被既有调用方理解，但它们会让新增 IPC 更难推理：调用方需要记住每个方法的失败语义，测试也难以复用同一套成功/失败断言。随着主进程 IPC 同时承担窗口管理、系统设置、皮肤选择和持久化等职责，新的 IPC contract 应该更一致，也要避免一次性破坏已有 renderer 调用点。

## Decision
新增或迁移后的 `ipcMain.handle` 优先返回轻量结果对象：

```js
{
  success: true,
  data: value
}
```

失败时返回：

```js
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input'
  }
}
```

在 `ipcContracts.js` 中维护 `createIpcSuccess(data)` 和 `createIpcFailure(code, message)` helper，避免每个 handler 手写结果对象。新增 IPC handler 默认使用该形状；既有 IPC 在有计划迁移前保持向后兼容。

首个迁移片选择 `set-current-skin`：

- 调用面窄，只有 renderer 皮肤切换会主动调用。
- 主进程已经通过 `isAllowedSkinId()` 做白名单校验。
- 从 `ipcMain.on` / `ipcRenderer.send` 迁移到 `ipcMain.handle` / `ipcRenderer.invoke` 后，可以返回统一结果对象。
- 渲染进程现有调用点仍可继续调用 `window.electronAPI.setCurrentSkin(nextSkinId)`，不要求立即消费返回值。

`saveData()`、`loadData()`、`setLocale()`、`setAutoLaunch()` 和 `getAutoLaunch()` 暂不改变返回形状。它们覆盖面更广，应等调用方可以一起更新和测试时再迁移，必要时在 `preload.js` 中提供兼容包装。

## Alternatives Considered
### 继续维持每个 IPC 自定义返回形状

- Pros: 不需要迁移，完全避免短期改动风险。
- Cons: 新增调用点仍要记住各自语义，错误处理无法统一。
- Rejected: 这会把当前不一致继续固化到后续 IPC。

### 一次性迁移所有既有 IPC

- Pros: 最快得到全局一致的返回契约。
- Cons: `saveData()`、`loadData()` 等调用面广，直接改变返回值会带来不必要的 renderer 回归风险。
- Rejected: 不符合渐进迁移和向后兼容要求。

### 只在文档中约定，不提供 helper

- Pros: 代码改动更少。
- Cons: handler 容易手写出细微不一致的结果对象，测试也缺少聚焦入口。
- Rejected: helper 很小，能降低后续误用成本。

## Consequences
- 新增或迁移后的 IPC handler 有统一成功/失败语义。
- `ipcContracts.js` 既负责边界输入归一化，也承载轻量结果对象 helper。
- 每迁移一个既有 IPC handler，都应补充聚焦测试，覆盖成功结果和结构化失败。
- 宽接口迁移需要单独计划，不能因为 helper 已存在就顺手改变现有 renderer 行为。
- `docs/plan/ipc-result-shape-plan.md` 继续记录迁移批次和完成状态，本 ADR 记录长期契约决策。

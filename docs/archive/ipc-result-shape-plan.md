# IPC 返回形状统一计划

> 状态：首个迁移片已实现
> 最后更新：2026-06-04
> 决策记录：[ADR-032: IPC 返回形状统一](../decisions/ADR-032-ipc-result-shape.md)

## 背景

当前 `window.electronAPI` 桥接层暴露的 IPC 调用使用了几种不同的返回约定：

- `saveData()` 返回 `true` 或 `false`。
- `loadData()` 返回具体值或 `null`。
- `setLocale()` 返回 `{ success, locale? }`。
- `setAutoLaunch()` 和 `getAutoLaunch()` 返回更丰富的状态对象。

这些形状单独看都能理解，但会让新的渲染进程调用点更难推理。后续 IPC API 应该更难误用，也更容易在不破坏既有调用方的前提下迁移。

## 建议方向

新增 IPC handler 优先使用轻量结果对象：

```js
{
  success: true,
  data: value
}
```

失败时使用：

```js
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input'
  }
}
```

既有 IPC 方法在渲染进程调用方可以被有计划迁移前，应保持向后兼容。因为其他原因触碰既有方法时，优先考虑在 `preload.js` 中增加兼容包装，而不是在同一次修改里直接改变渲染进程行为。

## 候选迁移顺序

1. 在 `main.js` 或一个小型 IPC 工具模块中，增加 success/failure 结果对象 helper。
2. 新增 IPC handler 先使用统一结果形状。
3. 迁移调用面较窄、风险较低的既有 handler，例如 `setCurrentSkin`。
4. `saveData`、`loadData` 这类覆盖面较广的数据持久化调用，等调用方可以一起更新和测试时再迁移。

## 已实现内容

- 在 `ipcContracts.js` 中新增 `createIpcSuccess(data)` 和 `createIpcFailure(code, message)`，作为后续 IPC handler 的统一结果对象 helper。
- 将 `set-current-skin` 从单向 `ipcMain.on` / `ipcRenderer.send` 迁移为 `ipcMain.handle` / `ipcRenderer.invoke`。
- `set-current-skin` 成功时返回 `{ success: true, data: { skinId } }`；非法皮肤 ID 返回 `VALIDATION_ERROR`；内部异常返回 `INTERNAL_ERROR`。
- 渲染进程现有调用点仍可继续调用 `window.electronAPI.setCurrentSkin(nextSkinId)`，不要求同步迁移业务行为。
- `saveData()`、`loadData()`、`setLocale()`、`setAutoLaunch()` 和 `getAutoLaunch()` 暂不改变返回形状，等待调用方可以一起更新和测试时再迁移。

## 验证

- 为每个迁移后的 IPC handler 添加聚焦测试。
- 每迁移一个 handler 后运行 `npm test`。
- 除非迁移任务明确包含渲染进程调用点，否则保持 renderer 行为不变。

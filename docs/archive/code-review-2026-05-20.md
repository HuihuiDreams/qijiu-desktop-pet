# 代码审查结果 - 2026-05-20 (Code Review Findings - 2026-05-20)

范围：对 Electron 桌面宠物应用进行全项目审查。

## 审查结果

### 1. 保存的零坐标未被正确恢复

文件：`src/systems/TimeSystem.js`

`deserializePet()` 中通过 `data.x || pet.x` 和 `data.y || pet.y` 恢复 `x` 和 `y`。保存的坐标 `0` 在桌面左边缘或上边缘是合法的，但 `||` 会将其视为缺失，从而保留上一次的默认位置。

影响：保存在屏幕左边缘或上边缘的宠物在重启应用后可能会发生非预期的坐标移动。

建议修复：使用空值合并运算符（nullish coalescing）或数值有效性验证，例如 `Number.isFinite(data.x) ? data.x : pet.x`。并为 `x: 0` 和 `y: 0` 添加回归测试。

### 2. 窗口卸载时的最终保存未被等待

文件：`src/app.js`

`beforeunload` 事件监听器调用了 `saveCurrentState()`，但未等待异步 IPC 保存操作完成。

影响：快速关闭应用可能会丢失最新的宠物位置、数值状态或最近选择的皮肤。

建议修复：将最终的保存操作移入由主进程控制的关闭/退出流中，或者在渲染进程中显式阻塞卸载（unload）事件，直至保存的 Promise 成功解析。

### 3. 在自定义皮肤系统扩展前，应加固动态 HTML 渲染以防范安全隐患

文件：
- `src/ui/ContextMenu.js`
- `src/statusWindow.js`

这两个文件都是利用宠物的图片/名称数据通过 `innerHTML` 构建 UI。虽然当前这些数据的来源主要是本地配置，且有内容安全策略（CSP）降低了潜在风险，因此这在目前并非紧急阻碍上线的生产问题。但在未来，如果允许自定义皮肤或外部元数据定义名称、表情、图片路径或状态负载，风险就会增加。

影响：未来的自定义内容可能会引入 HTML 注入路径。

建议修复：使用 DOM API 渲染这些节点，通过 `textContent` 赋值文本，并直接设置图片属性。

## 已执行的验证

- `npm test`：76 个测试通过。
- `node --check`：项目 JavaScript 文件通过语法检查。
- `npm run build`：Windows NSIS 构建成功完成。
- `node scripts/verify-installer.js`：安装程序环境验证通过。

## 未完成的事项

未执行 `npm audit --omit=dev --audit-level=high` 命令。由于该命令会将依赖项元数据发送至外部 npm 审计服务，此项外部信息公开在本次审查中未获得明确授权。

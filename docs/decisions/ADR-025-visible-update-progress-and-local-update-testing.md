# ADR-025: 更新进度弹窗与本地打包更新测试

## Status
Accepted; update progress window implementation superseded by ADR-014/ADR-029 hardening

## Date
2026-05-22

## Updates
- 2026-06-09: 本 ADR 中“更新进度窗口使用 `data:` URL 和生成 HTML”的实现方案已被后续安全加固取代。当前进度窗口由 `main.js` 加载本地 `src/update-progress.html`，配合 `src/update-progress.css`、`src/update-progress.js` 和 `updateProgressPreload.js`，通过 IPC 接收进度 payload，不再使用 `data:text/html`、内联脚本或 `webContents.executeJavaScript()`。这次替代记录在 [ADR-014](./ADR-014-electron-security-hardening.md) 与 [ADR-029](./ADR-029-security-audit-and-local-hardening.md) 的补充段落中。本 ADR 的“可见更新进度”和“本地 packaged 更新测试”目标仍然有效。

## Context
有用户反馈点击“检查更新”之后看起来没有反应。实际更新检查已经触发，但即时状态只体现在托盘菜单文案里。用户点击菜单项后通常会关闭托盘菜单，因此很容易错过“正在检查更新”的状态反馈。

下载阶段也有类似问题：用户确认下载新版本后，下载状态主要显示在托盘菜单和任务栏进度里。当前桌宠主窗口是透明桌面窗口，任务栏进度不一定明显或可靠，因此需要一个更直观的屏幕内反馈。

同时，自动更新必须在打包态验证。开发态被 `app.isPackaged` 明确拦截，`npm run dev` 不能覆盖 `electron-updater` 的真实检查、下载和安装流程。但为了日常验证，又不希望每次都发布真实 GitHub Release。

## Decision
新增一个由主进程管理的轻量更新进度窗口，并让 `updateManager.js` 通过注入式 `updateProgressUi` 适配器驱动它。

更新流程调整为：

1. 用户手动检查更新后，立即显示“正在检查更新”的独立窗口，并使用不确定进度条。
2. 发现新版本时，先关闭检查窗口，再显示原有“是否下载”的确认弹窗。
3. 用户确认下载后，重新显示进度窗口，切换为带百分比的下载进度条。
4. 收到 `download-progress` 事件时，同时更新进度窗口和原有主窗口进度。
5. 无可用更新、更新失败或下载完成时，先关闭进度窗口，再显示原有结果弹窗。

进度窗口在 `main.js` 中实现，使用一个加载 `data:` URL 的小型 `BrowserWindow`。窗口启用 `contextIsolation` 和 `sandbox`，禁用 Node 集成，并在生成 HTML 前转义动态文本。这样可以把 UI 细节留在主进程，同时让 `updateManager.js` 只依赖可注入接口，继续保持单元测试友好。

为了在不发布 GitHub Release 的情况下测试 packaged 更新流程，新增两个 electron-builder 测试配置：

- `docs/archive/electron-builder.update-test-old.yml`：构建当前版本的测试旧包。
- `docs/archive/electron-builder.update-test-new.yml`：通过 `extraMetadata.version` 构建一个伪装的新版本。

两个测试配置都使用独立的 `appId`、`productName`、`extraMetadata.name` 和安装包文件名，避免和正式安装版、正式更新缓存相互污染。测试更新源使用 generic provider，并指向 `http://localhost:8765/`。

`dist-update-test/` 是一次性测试构建输出，因此加入 `.gitignore`。

## Alternatives Considered
### 继续只使用托盘菜单状态
- 优点：实现最简单，不新增窗口。
- 缺点：用户已经明确错过了托盘里的状态变化；菜单点击后会关闭，无法解决“没反应”的感知问题。
- 结论：拒绝。问题本身就是缺少可见反馈。

### 只使用系统原生弹窗
- 优点：实现简单，用户熟悉。
- 缺点：Electron `dialog.showMessageBox` 无法显示真正的下载进度条；下载过程中用阻塞式“正在下载”弹窗也不适合长耗时操作。
- 结论：拒绝。它无法提供用户预期的进度体验。

### 把进度 UI 放到 renderer 主窗口里
- 优点：可以复用前端样式。
- 缺点：更新是主进程职责；桌宠窗口可能被隐藏、透明、点击穿透或不适合作为更新状态载体。这样还会增加 IPC 表面积。
- 结论：拒绝。由主进程拥有独立进度窗口更简单、更稳定。

### 用草稿或私有 GitHub Release 测试
- 优点：更接近正式发布环境。
- 缺点：流程慢，需要上传发布资产，并且有误暴露测试版本或干扰真实用户的风险。
- 结论：不作为日常验证方式。正式发布前仍可用 GitHub Release 做最终验证，但本地 generic provider 更适合作为快速测试路径。

## Consequences
- 用户点击“检查更新”后会立即看到屏幕内反馈。
- 下载进度在托盘菜单关闭后仍然清晰可见。
- `updateManager.js` 通过注入式 `updateProgressUi` 保持可测试，不直接依赖 Electron 窗口实现。
- 主进程新增一个小型 `BrowserWindow`，因此生命周期清理变得重要。当前实现会在无更新、发现更新、失败和下载完成路径关闭该窗口。
- 本地更新验证需要构建并安装测试包，但不需要发布真实 Release。
- 某些 Windows 环境中，`127.0.0.1:8765` 可能被本机软件占用或拦截。本机测试中 `127.0.0.1` 返回 `ERR_EMPTY_RESPONSE`，因此测试配置使用 `localhost:8765`。

## 验证 (Verification)
- `npm test` 已通过，覆盖了检查中 UI、开始下载、下载进度更新和进度窗口关闭。
- 已手动验证本地 packaged 更新流程：
  - `npm run build -- --config docs/archive/electron-builder.update-test-old.yml`
  - `npm run build -- --config docs/archive/electron-builder.update-test-new.yml`
  - 在 `dist-update-test/feed` 中运行 `py -m http.server 8765`
  - 安装 `dist-update-test/old/qijiu-update-test-setup-0.3.1.exe`
  - 触发检查更新，并下载伪新版本 `0.3.2`

## 涉及文件 (Files Changed)
| 文件 | 用途 |
|---|---|
| `updateManager.js` | 增加可注入的进度 UI 适配器和生命周期调用。 |
| `main.js` | 实现更新进度 `BrowserWindow`。 |
| `src/data/i18n.js` | 增加进度窗口标题的多语言文案。 |
| `test/updateManager.test.js` | 覆盖更新进度 UI 流程。 |
| `docs/archive/electron-builder.update-test-old.yml` | 构建本地测试旧版本。 |
| `docs/archive/electron-builder.update-test-new.yml` | 构建本地测试伪新版本。 |
| `.gitignore` | 忽略一次性输出目录 `dist-update-test/`。 |

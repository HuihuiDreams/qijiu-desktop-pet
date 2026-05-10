# 版本升级与检查更新 - 实施规划

> 状态：Proposed（已提议，待实施）  
> 最后更新：2026-05-05

---

## 一、背景与精炼 (Background & Refinement)

### 问题陈述
当前桌面宠物已经计划提供 Windows 安装包，但应用内尚无版本检查与升级入口。用户如果想升级，只能手动获取新版安装包，这对普通用户不够友好。

### Objective（目标）
在系统托盘菜单中增加“检查更新”菜单项。用户点击后，应用主动检查是否存在新版本：

1. 如果当前已经是最新版，提示用户无需升级。
2. 如果发现新版本，先询问用户是否下载并升级。
3. 用户确认后下载更新包。
4. 下载完成后，再询问用户是否立即重启并安装。
5. 用户拒绝时不自动下载、不自动退出、不打断当前使用。

### 核心决策

- 使用 `electron-updater` 配合 `electron-builder` 的 NSIS 更新能力。
- 第一版使用“手动检查更新”，不做启动时自动弹窗检查。
- 设置 `autoUpdater.autoDownload = false`，确保发现新版本后先询问用户。
- 版本检查和下载逻辑放在 Electron 主进程 `main.js` 中。
- 托盘菜单只触发检查动作，不在 renderer 中直接调用 updater API。

---

## 二、功能规格 (Functional Specification)

### 用户体验

托盘菜单新增：

```text
检查更新
```

交互流程：

```text
用户点击“检查更新”
        |
        v
显示“正在检查更新...”
        |
        v
发现新版本？
        |
        +-- 否 -> 提示“当前已是最新版”
        |
        +-- 是 -> 弹窗询问“发现新版本 x.y.z，是否下载并安装？”
                    |
                    +-- 取消 -> 结束
                    |
                    +-- 确认 -> 下载更新
                                  |
                                  v
                              下载完成
                                  |
                                  v
                      询问“是否立即重启并安装？”
                                  |
                                  +-- 稍后 -> 结束
                                  |
                                  +-- 立即安装 -> quitAndInstall()
```

### 成功标准（可测试）

- [ ] 托盘菜单中出现“检查更新”菜单项。
- [ ] 点击后会触发一次更新检查。
- [ ] 已是最新版时，弹窗提示用户当前已是最新版。
- [ ] 有新版本时，先询问用户是否下载更新。
- [ ] 用户取消时不会下载更新。
- [ ] 用户确认后开始下载，并能反馈下载状态。
- [ ] 下载完成后，询问用户是否立即重启安装。
- [ ] 用户确认后调用 `autoUpdater.quitAndInstall()`。
- [ ] 开发态不会因为缺少更新配置导致主流程崩溃。

### 状态模型

主进程维护以下更新状态，避免重复点击导致并发检查：

```javascript
{
  checking: false,
  updateAvailable: false,
  downloading: false,
  downloaded: false,
  latestVersion: null,
  error: null
}
```

规则：

- `checking` 为 `true` 时，再次点击“检查更新”只提示“正在检查更新”。
- `downloading` 为 `true` 时，再次点击只提示“更新正在下载”。
- 下载完成后再次点击可直接询问是否立即安装。
- 出错时记录错误并给用户一个简短可理解的提示，详细错误写入日志。

---

### 技术方案 (Technical Scheme)

### Tech Stack

| 层 | 工具 | 说明 |
|----|------|------|
| 更新客户端 | `electron-updater` | 检查、下载、安装更新 |
| 打包 | `electron-builder` | 生成 NSIS 安装包和更新元数据 |
| 安装格式 | NSIS | Windows 下支持自动更新 |
| 用户提示 | Electron `dialog` | 主进程弹窗确认 |
| 日志 | `electron-log`（可选） | 记录更新失败原因，便于排查 |

### 发布源选择

推荐优先选择一种发布源：

- GitHub Releases：适合开源或公开发布；`electron-builder` 可生成并上传安装包与 `latest.yml`。
- Generic HTTPS Server：适合自己托管；需要手动上传安装包和 `latest.yml`。

第一版建议使用 GitHub Releases，原因是配置少、流程清晰、和 `electron-builder` 集成度高。

### 关键依赖

需要新增**运行时依赖**（必须放在 `dependencies`，不是 `devDependencies`，否则打包后找不到模块）：

```bash
npm install electron-updater --save
```

推荐新增日志依赖（便于排查用户机器上的更新失败）：

```bash
npm install electron-log --save
```

### `package.json` 配置方向

需要补充 `publish` 配置，并确认 Windows 目标仍为 NSIS。

GitHub Releases 示例：

```json
{
  "build": {
    "appId": "com.deskpet.yueqi-shenjiu",
    "productName": "DeskPet",
    "win": {
      "target": "nsis"
    },
    "publish": [
      {
        "provider": "github",
        "owner": "OWNER_NAME",
        "repo": "REPO_NAME"
      }
    ]
  }
}
```

Generic Server 示例：

```json
{
  "build": {
    "publish": [
      {
        "provider": "generic",
        "url": "https://example.com/desktop-pet/releases/"
      }
    ]
  }
}
```

### 主进程设计

在 `main.js` 中新增更新模块逻辑：

- 导入 `autoUpdater`。
- 设置 `autoUpdater.autoDownload = false`。
- 封装 `checkForUpdatesFromTray()`。
- 监听 updater 事件：
  - `checking-for-update`
  - `update-available`
  - `update-not-available`
  - `download-progress`
  - `update-downloaded`
  - `error`
- 在 `buildTrayMenu()` 中新增“检查更新”菜单项。

第一版可以直接写在 `main.js`，如果后续逻辑变多，再抽到 `src/main/updateManager.js` 或根目录 `updateManager.js`。

### 开发态保护

`electron-updater` 在非打包态调用 `checkForUpdates()` 会抛错。必须使用 `app.isPackaged` 判断：

```javascript
function checkForUpdatesFromTray() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ message: '开发模式下不支持检查更新' });
    return;
  }
  autoUpdater.checkForUpdates();
}
```

### 网络错误分类处理

`error` 事件中需要区分常见错误场景，给用户可理解的提示：

| 错误场景 | 判断方式 | 用户提示 |
|----------|----------|----------|
| 网络不可达 | `error.code === 'ENOTFOUND'` 或 `'ENETUNREACH'` | "请检查网络连接后重试" |
| 服务端 404 | `error.statusCode === 404` | "更新服务暂不可用" |
| 下载中断 | `error.code === 'ECONNRESET'` 等 | "下载失败，请稍后重试" |
| 其他未知错误 | fallback | "检查更新失败，详情已记录日志" |

所有错误都应通过 `electron-log` 记录完整错误信息，便于远程排查。

### 用户确认策略

- 检查更新由用户主动触发，不自动弹窗。
- 发现新版本后，使用 `dialog.showMessageBox()` 询问是否下载。
- 下载完成后，再使用 `dialog.showMessageBox()` 询问是否立即重启安装。
- 下载过程中不强制阻塞应用，可用弹窗或菜单状态提示。

### 下载进度展示

第一版推荐方案：

- 使用 `mainWindow.setProgressBar(percent)` 在 Windows 任务栏显示下载进度，成本极低但体验提升明显。
- 下载开始和下载完成时各弹窗提示一次。
- 不在渲染进程中嵌入复杂进度 UI。

```javascript
autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.setProgressBar(progress.percent / 100);
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.setProgressBar(-1); // 清除进度条
  }
});
```

---

## 四、涉及文件

```text
desktop-pet/
├── main.js                <- 修改：托盘菜单、更新检查、下载和安装确认
├── package.json           <- 修改：新增依赖与 publish 配置
├── package-lock.json      <- 修改：安装依赖后自动更新
├── CHANGELOG.md           <- 修改：每次发布附带变更说明
└── docs/
    └── plan/
        └── version-upgrade-plan.md
```

可选 / 后续：

```text
desktop-pet/
├── updateManager.js              <- 如果 main.js 逻辑变重，可抽出更新管理模块
├── preload.js                    <- 如果后续要在渲染进程展示下载进度，需暴露新 IPC channel
└── .github/workflows/release.yml <- 如果使用 GitHub Releases，CI 自动构建发布是最佳实践
```

---

## 三、任务分解 (Task Breakdown)

### 依赖图

```text
[1] 确认发布源与版本号策略
        |
        v
[2] 安装 electron-updater 并补充 package.json publish 配置
        |
        v
[3] 在 main.js 实现更新检查与事件处理
        |
        v
[4] 在托盘菜单中加入“检查更新”
        |
        v
[5] 构建两个版本并做端到端升级验证
```

---

### Phase 0：发布源与版本策略确认

#### Task 0：确认更新发布源
**Description：** 明确更新包托管在哪里，以及版本号如何递增。

**Acceptance criteria：**
- [ ] 确认使用 GitHub Releases 或 Generic HTTPS Server。
- [ ] 确认 `package.json.version` 是唯一版本来源。
- [ ] 确认每次发布新版本必须递增 semver 版本号，例如 `0.1.0 -> 0.1.1`。
- [ ] 确认发布产物包含安装包和 `latest.yml`。

**Dependencies：** None  
**Files:** `package.json`, 发布平台配置  
**Estimated scope:** S

---

### Phase 1：安装依赖与打包配置

#### Task 1：添加 `electron-updater`
**Description：** 安装更新检查所需依赖，并补充 `electron-builder` 的 `publish` 配置。

**Acceptance criteria：**
- [ ] `dependencies` 中存在 `electron-updater`。
- [ ] `build.publish` 配置与发布源一致。
- [ ] Windows target 仍为 `nsis`。
- [ ] 构建后 `dist/` 中存在更新元数据文件，如 `latest.yml`。

**Verification：**
- [ ] `npm install electron-updater` 成功。
- [ ] `npm run build` 成功生成安装包和更新元数据。

**Dependencies：** Task 0  
**Files:** `package.json`, `package-lock.json`  
**Estimated scope:** S

---

### Phase 2：实现更新检查逻辑

#### Task 2：在主进程封装更新管理
**Description：** 在主进程中集成 `autoUpdater`，实现手动检查、用户确认下载、下载完成后确认安装。

**Acceptance criteria：**
- [ ] `autoUpdater.autoDownload = false`。
- [ ] 点击检查时调用 `autoUpdater.checkForUpdates()`。
- [ ] **开发态使用 `app.isPackaged` 判断，非打包态给出友好提示而不是抛错。**
- [ ] `update-available` 事件中弹窗询问是否下载。
- [ ] 用户确认后调用 `autoUpdater.downloadUpdate()`。
- [ ] `update-not-available` 事件中提示当前已是最新版。
- [ ] `update-downloaded` 事件中询问是否立即重启安装。
- [ ] 用户确认后调用 `autoUpdater.quitAndInstall()`。
- [ ] `error` 事件中**分类处理常见错误**（网络不可达、404、下载中断），并通过 `electron-log` 记录详细错误。
- [ ] 下载过程中使用 `mainWindow.setProgressBar()` 在任务栏显示进度。

**Verification：**
- [ ] 开发态点击不会导致应用崩溃（`app.isPackaged` guard 生效）。
- [ ] 打包态可正确触发更新检查。
- [ ] 更新状态不会因为重复点击进入并发检查。
- [ ] 断网状态下点击检查更新给出"请检查网络连接"提示而非未处理异常。

**Dependencies：** Task 1  
**Files:** `main.js` 或 `updateManager.js`  
**Estimated scope:** M

---

### Phase 3：托盘菜单集成

#### Task 3：新增“检查更新”菜单项
**Description：** 在 `buildTrayMenu()` 中增加“检查更新”菜单项，点击后触发主进程更新检查。

**Acceptance criteria：**
- [ ] 托盘菜单中出现“检查更新”。
- [ ] 菜单项点击后调用 `checkForUpdatesFromTray()`。
- [ ] 检查中或下载中时，重复点击给出友好提示。
- [ ] 菜单重建后，该菜单项仍存在。

**Verification：**
- [ ] `npm run dev` 可看到菜单项。
- [ ] 打包安装后，菜单项可触发真实检查。

**Dependencies：** Task 2  
**Files:** `main.js`  
**Estimated scope:** XS

---

### Phase 4：端到端升级验证

#### Task 4：用两个版本验证升级链路
**Description：** 构建并发布旧版本与新版本，验证旧版本可以检查到新版本，并完成下载与安装。

**建议流程：**

1. 构建并安装 `0.1.0`。
2. 将 `package.json.version` 升到 `0.1.1`。
3. 构建 `0.1.1` 并发布安装包与 `latest.yml`。
4. 打开已安装的 `0.1.0`。
5. 点击托盘菜单“检查更新”。
6. 确认下载并安装。
7. 重启后确认应用版本为 `0.1.1`。

**Acceptance criteria：**
- [ ] 旧版本能发现新版本。
- [ ] 用户取消时不会下载。
- [ ] 用户确认后能完成下载。
- [ ] 下载完成后可选择立即安装。
- [ ] 安装后版本号更新。
- [ ] 用户数据不丢失。

**Dependencies：** Task 3  
**Files:** 构建产物与发布平台  
**Estimated scope:** M

---

## 四、验证清单 (Verification)

- [ ] `npm run dev` 启动后，托盘菜单显示“检查更新”。
- [ ] 开发态点击检查更新不会崩溃（`app.isPackaged` guard 生效）。
- [ ] `npm run build` 生成 NSIS 安装包。
- [ ] 构建产物包含更新元数据（`latest.yml`）。
- [ ] 安装版点击“检查更新”可连接发布源。
- [ ] 已是最新版时提示正确。
- [ ] 有新版本时先询问用户。
- [ ] 下载过程中任务栏显示进度条。
- [ ] 下载完成后再询问是否立即安装。
- [ ] 立即安装后版本号更新。
- [ ] 断网状态下点击检查更新给出友好提示。
- [ ] 原有托盘菜单项、隐藏/显示、退出功能不受影响。
- [ ] `electron-updater` 位于 `dependencies`（非 `devDependencies`）。

---

## 五、风险与缓解 (Risks & Mitigation)

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 没有发布源或缺少 `latest.yml`，导致检查更新失败 | 高 | Phase 0 先确认发布源，Phase 1 验证构建产物包含元数据 |
| 开发态无法真实模拟自动更新 | 中 | 开发态使用 `app.isPackaged` guard，只验证菜单和错误处理，真实升级必须用安装版验证 |
| 用户误触导致自动下载或重启 | 中 | 设置 `autoDownload = false`，下载和安装都需要用户确认 |
| 未签名安装包触发 SmartScreen 或更新校验问题 | 中 | MVP 阶段记录风险，后续考虑代码签名 |
| GitHub 私有仓库或限流导致更新不可用 | 中 | 若面向普通用户，优先使用公开 Releases 或 Generic HTTPS Server |
| 更新过程中用户数据丢失 | 高 | 升级前后验证 `electron-store` 数据路径和存档兼容性 |
| `latest.yml` 中 sha512 hash 与安装包不匹配 | 高 | 更新会静默失败；发布时必须确保 `latest.yml` 与安装包同步生成，不手动修改 |
| `electron-updater` 不支持版本降级 | 中 | 只能检测更高版本；如新版有严重 bug，用户需手动下载旧版覆盖安装。在发布说明中提供历史版本下载链接 |
| 网络异常导致更新检查/下载失败 | 中 | `error` 事件中分类处理（离线 / 404 / 下载中断），给用户可理解的提示 |

---

## 六、开放问题 (Open Questions)

- [ ] 更新发布源使用 GitHub Releases 还是 Generic HTTPS Server？**→ 建议 GitHub Releases，项目已托管在 GitHub，配置最少、集成度高。**
- [ ] 项目是否准备使用公开仓库发布更新？**→ 如果面向外部用户分发，必须公开 repo 或改用 Generic HTTPS Server。**
- [ ] 是否需要在“关于/状态”位置显示当前版本号？**→ 建议做，`app.getVersion()` 即可获取，实现成本极低。**
- [x] ~~是否需要下载进度提示？~~ **→ 第一版使用 `mainWindow.setProgressBar()` 在任务栏显示进度 + 开始/完成弹窗提示。**
- [x] ~~是否需要启动时静默检查更新？~~ **→ 第一版不做，只保留用户手动检查，避免冷启动变慢和用户反感。**
- [x] ~~是否引入 `electron-log` 记录更新日志？~~ **→ 引入。更新失败是远程排查最困难的问题之一，日志必不可少。**

---

## 九、参考资料

- electron-builder Auto Update: https://www.electron.build/auto-update.html
- electron-updater API: https://www.electron.build/electron-updater/

---

*生成时间：2026-05-05 | 状态：Proposed，待实施*

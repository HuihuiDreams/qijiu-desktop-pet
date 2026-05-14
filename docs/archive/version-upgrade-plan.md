# 版本升级与检查更新 - 实施规划

> 状态：Proposed（已提议，待实施）  
> 最后更新：2026-05-11

---

## 一、背景与目标

当前桌面宠物已经具备 Windows NSIS 安装包能力，但应用内尚无版本检查与升级入口。用户如果想升级，只能手动获取新版安装包，对普通用户不够友好。

本计划为第一版自动更新能力增加一个系统托盘菜单项：

```text
检查更新
```

用户点击后，应用主动检查 GitHub Releases 中是否存在新版本：

1. 如果当前已经是最新版，提示用户无需升级。
2. 如果发现新版本，先询问用户是否下载。
3. 用户确认后下载更新包。
4. 下载完成后，再询问用户是否立即重启并安装。
5. 用户拒绝时不自动下载、不自动退出、不打断当前使用。

### 已确认决策

- 第一版只支持 Windows NSIS 自动更新。
- 发布源固定为 **GitHub Releases**。
- 使用 `electron-updater` 配合 `electron-builder` 生成和读取 `latest.yml`。
- 设置 `autoUpdater.autoDownload = false`，发现新版本后先询问用户。
- 更新逻辑拆到根目录 `updateManager.js`；`main.js` 只负责初始化、托盘菜单接入和传入必要上下文。
- 下载反馈固定为 **托盘菜单状态 + 主进程弹窗提示**。
- 不做 renderer 进度 UI，不在 renderer 中直接调用 updater API。
- 当前主窗口设置了 `skipTaskbar: true`，因此 `mainWindow.setProgressBar()` 只作为可选增强，不作为第一版验收标准。
- 第一版不做启动时静默检查，只保留用户手动检查，避免冷启动变慢和打扰用户。
- `electron-log` 是必需依赖，用于记录用户机器上的更新失败原因。

---

## 二、功能规格

### 用户流程

```text
用户点击托盘菜单“检查更新”
        |
        v
托盘菜单进入“正在检查更新...”状态，并避免重复触发
        |
        v
发现新版本？
        |
        +-- 否 -> 弹窗提示“当前已是最新版”
        |
        +-- 是 -> 弹窗询问“发现新版本 x.y.z，是否下载？”
                    |
                    +-- 取消 -> 结束，恢复菜单状态
                    |
                    +-- 确认 -> 开始下载，托盘菜单显示“正在下载更新...”
                                  |
                                  v
                              下载完成
                                  |
                                  v
                      弹窗询问“是否立即重启并安装？”
                                  |
                                  +-- 稍后 -> 结束，保留已下载更新
                                  |
                                  +-- 立即安装 -> autoUpdater.quitAndInstall()
```

### 成功标准

- [x] 托盘菜单中出现“检查更新”菜单项。
- [x] 点击后只触发一次更新检查，重复点击不会发起并发检查。
- [x] 开发态点击不会因为缺少更新配置导致主流程崩溃。
- [x] 已是最新版时，弹窗提示用户当前已是最新版。
- [x] 有新版本时，先询问用户是否下载更新。
- [ ] 用户取消时不会下载更新。
- [x] 用户确认后开始下载，并通过托盘菜单状态和弹窗反馈下载状态。
- [x] 下载完成后，询问用户是否立即重启安装。
- [x] 用户确认后调用 `autoUpdater.quitAndInstall()`。
- [x] 断网、404、下载中断等错误会给用户可理解的提示，并写入日志。

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

状态规则：

- `checking` 为 `true` 时，再次点击“检查更新”只提示“正在检查更新”。
- `downloading` 为 `true` 时，再次点击只提示“更新正在下载”。
- `downloaded` 为 `true` 时，再次点击可直接询问是否立即安装。
- 出错时清理检查/下载中的状态，记录错误，并恢复托盘菜单可用状态。

---

## 三、技术方案

### Tech Stack

| 层 | 工具 | 说明 |
|----|------|------|
| 更新客户端 | `electron-updater` | 检查、下载、安装更新 |
| 打包 | `electron-builder` | 生成 NSIS 安装包、`.blockmap` 和 `latest.yml` |
| 发布源 | GitHub Releases | tag 发布后托管安装包和更新元数据 |
| 安装格式 | NSIS | Windows 下支持自动更新 |
| 用户提示 | Electron `dialog` | 主进程弹窗确认 |
| 日志 | `electron-log` | 记录更新失败原因，便于排查 |

### 依赖与打包配置

新增运行时依赖，必须放在 `dependencies`，不是 `devDependencies`：

```bash
npm install electron-updater electron-log --save
```

`package.json` 中补充 GitHub Releases 发布配置，并保持 Windows target 为 NSIS。`owner` 和 `repo` 使用实际 GitHub 仓库名：

```json
{
  "build": {
    "appId": "com.deskpet.yueqi-shenjiu",
    "productName": "七九爱宠",
    "win": {
      "target": "nsis",
      "icon": "src/assets/icon.ico",
      "signAndEditExecutable": false
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

GitHub Releases 必须对目标用户可访问。面向普通用户分发时，仓库或 Release 资产应公开；私有仓库更新不作为第一版普通用户分发方案。

### CI 发布闭环

当前 `.github/workflows/build-installer.yml` 只上传 artifact，不能作为自动更新源。需要升级为 tag release 构建：

- `permissions.contents` 从 `read` 改为 `write`。
- tag 触发仍使用 `v*`，例如 `v0.1.8`。
- 构建发布命令改为：

```yaml
- name: Build and publish release
  run: npx electron-builder --publish onTag
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

发布完成后，GitHub Release 中必须包含：

```text
desktop-pet-setup-0.1.8.exe
desktop-pet-setup-0.1.8.exe.blockmap
latest.yml
```

如果保留 artifact 上传步骤，只能作为调试辅助，不能替代 Release 发布。

### 更新管理模块

新增根目录 `updateManager.js`，职责如下：

- 导入 `autoUpdater` 和 `electron-log`。
- 设置 `autoUpdater.logger = log`。
- 设置 `autoUpdater.autoDownload = false`。
- 维护更新状态对象。
- 暴露初始化函数，例如 `initUpdateManager({ app, dialog, getMainWindow, refreshTrayMenu })`。
- 暴露托盘点击函数，例如 `checkForUpdatesFromTray()`。
- 暴露菜单状态读取函数，例如 `getUpdateMenuState()`，供 `main.js` 构建托盘菜单。
- 监听 updater 事件：
  - `checking-for-update`
  - `update-available`
  - `update-not-available`
  - `download-progress`
  - `update-downloaded`
  - `error`

`main.js` 只做接入：

- 引入 `dialog`。
- 初始化 `updateManager`。
- 在 `buildTrayMenu()` 中新增“检查更新”菜单项。
- 根据 `getUpdateMenuState()` 显示“检查更新 / 正在检查更新... / 正在下载更新...”并控制重复点击。

### 开发态保护

非打包态不做真实更新检查，避免 `electron-updater` 因缺少打包配置抛错：

```javascript
function checkForUpdatesFromTray() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ message: '开发模式下不支持检查更新，请使用安装版验证自动更新。' });
    return;
  }
  autoUpdater.checkForUpdates();
}
```

开发态只验收菜单接入、状态变化和友好提示；真实升级必须使用安装版验证。

### 错误处理

`error` 事件中区分常见错误场景，给用户可理解的提示：

| 错误场景 | 判断方式 | 用户提示 |
|----------|----------|----------|
| 网络不可达 | `error.code === 'ENOTFOUND'` 或 `'ENETUNREACH'` | 请检查网络连接后重试 |
| 服务端 404 | `error.statusCode === 404` | 更新服务暂不可用 |
| 下载中断 | `error.code === 'ECONNRESET'` 等 | 下载失败，请稍后重试 |
| 其他未知错误 | fallback | 检查更新失败，详情已记录日志 |

所有错误都通过 `electron-log` 记录完整错误信息。

### 下载反馈

第一版使用托盘菜单状态和弹窗：

- 检查中：菜单项显示“正在检查更新...”，重复点击只提示当前状态。
- 下载中：菜单项显示“正在下载更新...”，重复点击只提示当前状态。
- 下载开始：弹窗提示“开始下载更新”。
- 下载完成：弹窗询问是否立即重启并安装。
- 下载失败：弹窗提示失败原因，并写入日志。

`mainWindow.setProgressBar(progress.percent / 100)` 可以作为可选增强，但当前主窗口 `skipTaskbar: true`，任务栏进度可能不可见，因此不纳入第一版验收标准。

---

## 四、涉及文件

```text
desktop-pet/
├── main.js                         <- 修改：初始化更新管理、托盘菜单接入
├── updateManager.js                <- 新增：更新检查、下载、安装确认、状态与日志
├── package.json                    <- 修改：新增依赖与 GitHub publish 配置
├── package-lock.json               <- 修改：安装依赖后自动更新
├── .github/workflows/build-installer.yml
│                                    <- 修改：tag release 发布闭环
├── CHANGELOG.md                    <- 修改：每次发布附带变更说明
└── docs/plan/version-upgrade-plan.md
```

本次计划不要求修改 `preload.js`，因为第一版不做 renderer 进度 UI。

---

## 五、任务分解

### 依赖图

```text
[1] 固定 GitHub Releases 发布策略和版本号策略
        |
        v
[2] 安装 electron-updater / electron-log 并补充 package.json publish 配置
        |
        v
[3] 升级 GitHub Actions 为 tag release 发布闭环
        |
        v
[4] 新增 updateManager.js 实现更新检查与事件处理
        |
        v
[5] 在托盘菜单中接入“检查更新”和状态显示
        |
        v
[6] 构建 0.1.7 -> 0.1.8 两个版本并做端到端升级验证
```

### Phase 0：发布源与版本策略

#### Task 0：确认 GitHub Releases 发布策略

**Description：** 固定 GitHub Releases 为自动更新发布源，并确认版本号和 tag 规则。

**Acceptance criteria：**

- [x] 发布源固定为 GitHub Releases。
- [x] `package.json.version` 是应用版本的唯一来源。
- [x] 每次发布新版本必须递增 semver 版本号；当前验证示例为 `0.1.7 -> 0.1.8`。
- [x] Git tag 使用 `v${package.json.version}` 格式，例如 `v0.1.8`。
- [x] GitHub Release 中包含安装包、`.blockmap` 和 `latest.yml`。
- [x] Release 对目标用户可访问；私有仓库不作为第一版普通用户分发方案。

**Dependencies：** None  
**Files:** `package.json`, `.github/workflows/build-installer.yml`  
**Estimated scope:** S

### Phase 1：依赖与打包配置

#### Task 1：添加更新依赖与 GitHub publish 配置

**Description：** 安装更新所需运行时依赖，并让 `electron-builder` 知道默认 auto-update provider。

**Acceptance criteria：**

- [x] `dependencies` 中存在 `electron-updater`。
- [x] `dependencies` 中存在 `electron-log`。
- [x] `build.publish` 配置为 GitHub provider，并填写实际 `owner` / `repo`。
- [x] Windows target 保持 `nsis`。
- [x] 保留现有 `productName: "七九爱宠"`、图标、NSIS 配置和 `afterPack` 配置。
- [x] `artifactName` 使用 ASCII 文件名，例如 `desktop-pet-setup-${version}.${ext}`，确保 `latest.yml` 引用的文件名与 Release 资产一致。

**Verification：**

- [x] `npm install electron-updater electron-log --save` 成功。
- [x] `npm run build` 成功生成 NSIS 安装包。
- [x] `dist/` 中存在 `latest.yml` 和 `.blockmap`。

**Dependencies：** Task 0  
**Files:** `package.json`, `package-lock.json`  
**Estimated scope:** S

### Phase 2：CI 发布闭环

#### Task 2：升级 GitHub Actions release 工作流

**Description：** 将现有安装包构建 workflow 从 artifact 输出升级为 tag release 发布源，确保自动更新客户端能读取 Release 资产。

**Acceptance criteria：**

- [x] `.github/workflows/build-installer.yml` 的 `permissions.contents` 为 `write`。
- [x] tag `v*` 触发时运行 `npx electron-builder --publish onTag`。
- [x] workflow 设置 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`。
- [x] 发布后的 GitHub Release 包含 `.exe`、`.blockmap`、`latest.yml`。
- [x] artifact 上传如果保留，明确只是调试辅助。

**Verification：**

- [x] 推送 tag `v0.1.8` 后 workflow 成功。
- [x] GitHub Release 页面能看到安装包、blockmap 和 `latest.yml`。
- [x] 本地 `latest.yml` 中的版本号、文件名、sha512 与构建产物匹配。

**Dependencies：** Task 1  
**Files:** `.github/workflows/build-installer.yml`  
**Estimated scope:** S

### Phase 3：更新管理模块

#### Task 3：新增 `updateManager.js`

**Description：** 在主进程侧封装更新状态、事件监听、用户确认、下载和安装逻辑。

**Acceptance criteria：**

- [x] 设置 `autoUpdater.autoDownload = false`。
- [x] 设置 `autoUpdater.logger = electron-log`。
- [x] 开发态使用 `app.isPackaged` guard，非打包态给出友好提示而不是抛错。
- [x] `update-available` 事件中弹窗询问是否下载。
- [x] 用户确认后调用 `autoUpdater.downloadUpdate()`。
- [x] `update-not-available` 事件中提示当前已是最新版。
- [x] `update-downloaded` 事件中询问是否立即重启安装。
- [x] 用户确认后调用 `autoUpdater.quitAndInstall()`。
- [x] `error` 事件中分类处理常见错误，并通过 `electron-log` 记录详细错误。
- [x] 状态模型能防止重复点击进入并发检查或并发下载。

**Verification：**

- [x] 开发态点击检查更新不会崩溃。
- [x] 单测模拟重复点击/忙碌状态时，只出现当前状态提示，不会发起多次检查。
- [x] 单测覆盖断网状态下点击检查更新给出“请检查网络连接后重试”一类提示。
- [x] 单测覆盖错误通过 `electron-log` 记录完整详情。

**Dependencies：** Task 2  
**Files:** `updateManager.js`  
**Estimated scope:** M

### Phase 4：托盘菜单集成

#### Task 4：新增“检查更新”菜单项与状态显示

**Description：** 在 `buildTrayMenu()` 中增加“检查更新”菜单项，并根据更新状态显示检查中/下载中反馈。

**Acceptance criteria：**

- [x] 托盘菜单中出现“检查更新”。
- [x] 菜单项点击后调用 `checkForUpdatesFromTray()`。
- [x] 检查中显示“正在检查更新...”。
- [x] 下载中显示“正在下载更新...”。
- [x] 检查中或下载中重复点击给出友好提示。
- [x] 菜单重建后，该菜单项仍存在，且状态正确。
- [x] 原有托盘菜单项、隐藏/显示、暂停/恢复、开机自启动、退出功能不受影响。

**Verification：**

- [x] `npm run dev` 可看到菜单项。
- [x] 开发态点击显示“开发模式下不支持检查更新”。
- [x] 打包安装后，菜单项可触发真实检查。

**Dependencies：** Task 3  
**Files:** `main.js`  
**Estimated scope:** XS

### Phase 5：端到端升级验证

#### Task 5：用 `0.1.7 -> 0.1.8` 验证升级链路

**Description：** 构建并发布当前版本和下一版本，验证已安装旧版本可以检查到新版本，并完成下载与安装。

**建议流程：**

1. 确认当前旧版安装包版本为 `0.1.7`，构建并安装旧版本。
2. 将 `package.json.version` 升到 `0.1.8`。
3. 更新 `CHANGELOG.md`。
4. 创建并推送 tag `v0.1.8`。
5. 等待 GitHub Actions 发布 Release 资产。
6. 打开已安装的 `0.1.7`。
7. 点击托盘菜单“检查更新”。
8. 确认发现 `0.1.8`，选择下载并安装。
9. 重启后确认应用版本为 `0.1.8`。

**Acceptance criteria：**

- [x] 旧版本能发现新版本。
- [ ] 用户取消时不会下载。
- [x] 用户确认后能完成下载。
- [x] 下载完成后可选择立即安装或稍后安装。
- [x] 立即安装后版本号更新。
- [x] 用户数据不丢失。
- [x] 未签名 Windows 安装包在目标机器上完成自动更新验证，或记录明确失败原因。
- [ ] SmartScreen / 未签名提示如出现，记录为发布风险并更新 README 或发布说明。

**Dependencies：** Task 4  
**Files:** 构建产物与 GitHub Release  
**Estimated scope:** M

---

## 六、验证清单

### 文档与配置验证

- [x] 任务分解中不再存在未决发布源。
- [x] 发布源固定为 GitHub Releases。
- [x] 当前版本验证示例与 `package.json.version = 0.1.8` 一致。
- [x] 下载进度不再把任务栏进度当成唯一成功标准。
- [x] 章节编号连续，无重复“四、”。

### 开发态验证

- [x] `npm run dev` 启动后，托盘菜单显示“检查更新”。
- [x] 开发态点击检查更新不会崩溃。
- [x] 开发态点击时提示“开发模式下不支持检查更新，请使用安装版验证自动更新”。
- [x] 原有托盘菜单项、隐藏/显示、暂停/恢复、开机自启动、退出功能不受影响。

### 构建与发布验证

- [x] `npm run build` 生成 NSIS 安装包。
- [x] 构建产物包含 `latest.yml` 和 `.blockmap`。
- [x] 推送 tag 后 GitHub Release 包含 `.exe`、`.blockmap`、`latest.yml`。
- [x] 本地 `latest.yml` 版本号和 sha512 与构建产物匹配。
- [x] `latest.yml` 中的安装包文件名与 `dist/` 资产文件名一致。
- [x] `electron-updater` 位于 `dependencies`。
- [x] `electron-log` 位于 `dependencies`。

### 安装版升级验证

- [x] 已安装 `0.1.7` 能检查到 `0.1.8`。
- [x] 已是最新版时提示正确。
- [x] 有新版本时先询问用户。
- [x] 用户取消下载后不会下载更新。
- [x] 下载中重复点击不会发起并发下载。
- [x] 下载完成后再询问是否立即安装。
- [x] 立即安装后版本号更新。
- [x] 断网状态下点击检查更新给出友好提示。
- [x] 未签名安装包自动更新场景经过人工验证。
- [x] 用户数据升级后不丢失。

---

## 七、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| GitHub Release 缺少 `latest.yml` 或 `.blockmap`，导致检查更新失败 | 高 | CI 使用 `electron-builder --publish onTag`，发布后验证 Release 资产完整 |
| GitHub 仓库或 Release 资产不可访问 | 高 | 第一版要求 Release 对目标用户可访问；私有仓库不作为普通用户分发方案 |
| 当前 workflow 只上传 artifact，不能作为自动更新源 | 高 | 将 workflow 升级为 tag release 发布，`contents: write` 并设置 `GH_TOKEN` |
| 开发态无法真实模拟自动更新 | 中 | 开发态只验证菜单和 guard，真实升级必须用安装版验证 |
| 用户误触导致自动下载或重启 | 中 | 设置 `autoDownload = false`，下载和安装都需要用户确认 |
| 当前窗口 `skipTaskbar: true` 导致任务栏进度不可见 | 中 | 第一版使用托盘状态和弹窗反馈，`setProgressBar()` 仅作为可选增强 |
| 未签名安装包触发 SmartScreen 或更新校验问题 | 中 | Phase 5 必测未签名自动更新；如失败或体验差，记录并后续接入代码签名 |
| 更新过程中用户数据丢失 | 高 | 升级前后验证 `electron-store` 数据路径和存档兼容性 |
| `latest.yml` 中 sha512 与安装包不匹配 | 高 | 不手动修改 `latest.yml`；发布后核对版本、文件名和 sha512 |
| `electron-updater` 不支持版本降级 | 中 | 只能检测更高版本；严重 bug 需发布更高修复版本，历史版本只作为手动下载入口 |
| 网络异常导致更新检查或下载失败 | 中 | `error` 事件中分类处理离线、404、下载中断，并记录完整日志 |

---

## 八、已关闭问题

- [x] 更新发布源：使用 GitHub Releases。
- [x] 下载进度提示：第一版使用托盘菜单状态 + 主进程弹窗，不做 renderer 进度 UI。
- [x] 启动时静默检查更新：第一版不做。
- [x] 更新日志：引入 `electron-log`，作为必需依赖。
- [x] 更新逻辑位置：新增根目录 `updateManager.js`，避免继续膨胀 `main.js`。

---

## 九、参考资料

- electron-builder Auto Update: https://www.electron.build/auto-update.html
- electron-builder Publish: https://www.electron.build/publish.html
- electron-updater API: https://www.electron.build/electron-updater/

---

*最后更新：2026-05-11 | 状态：Proposed，待实施*

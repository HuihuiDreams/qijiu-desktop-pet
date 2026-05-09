# 安装包与自动启动 - 功能规划

> 本文档经由 idea-refine -> spec-driven-development -> planning-and-task-breakdown 流程生成。  
> 状态：待审批，尚未动工实现

---

## 一、想法精炼（idea-refine）

### 问题陈述（How Might We）
> HMW: 让普通 Windows 玩家无需任何命令行知识，就能一键安装桌面宠物，并让它随开机自动运行？

### 核心假设（在规划前需明确）

| # | 假设 | 风险等级 | 验证方式 |
|---|------|----------|----------|
| 1 | 不需要单独安装 Node.js。Electron 打包时已将运行时捆绑进可执行文件，终端用户无需关心 | 低 | 查看 electron-builder 输出 |
| 2 | 当前目标平台仅 Windows，且 `package.json` 已配置 `win.target: nsis` | 低 | 已确认 |
| 3 | 自动启动实现使用 Electron 内置 `app.setLoginItemSettings()`，不依赖第三方自启动库 | 低 | 官方文档 |
| 4 | 自动启动偏好持久化使用 `electron-store`，并以 store 为用户偏好的真源 | 低 | 已有 `initStore` |
| 5 | 托盘菜单已有基础结构，可在 `main.js` 的 `buildTrayMenu()` 中扩展 | 低 | 已确认 |

### 排除的方向（Not Doing）
- 不做 macOS / Linux 支持，本次仅面向 Windows。
- 不要求用户单独安装 Node.js，Electron 打包产物应自带运行时。
- 不做 NSIS 深度 UI 定制，默认安装界面对 MVP 足够。
- 不做自动更新（auto-update），留待后续独立迭代。

---

## 二、功能规格（spec-driven-development）

### Objective（目标）
为桌面宠物提供一个 `setup.exe` 安装包，实现：

1. 用户双击即可安装，自动创建桌面快捷方式和开始菜单条目。
2. 安装后首次运行时，默认开启开机自启动。
3. 用户可通过系统托盘菜单切换自动启动开关。
4. 该设置跨重启持久化。

### 状态模型（必须先明确）

- `electron-store` 中的 `autoLaunch` 是用户偏好的真源。
- 应用启动时读取 `store.autoLaunch`，再调用 `app.setLoginItemSettings()` 将系统状态同步到期望值。
- 若 `store.autoLaunch` 不存在，则视为首次启动，默认写入 `true`，并同步系统自启动。
- 托盘菜单勾选状态优先反映当前期望状态；必要时可结合 `app.getLoginItemSettings()` 做诊断和兜底。

### 成功标准（可测试）
- [ ] 在一台没有安装任何开发工具的 Windows 机器上，双击 `setup.exe` 可正常完成安装。
- [ ] 安装完成后，存在桌面快捷方式和开始菜单条目。
- [ ] 安装后首次运行时，自启动默认为开启。
- [ ] 重启系统后桌宠可自动启动。
- [ ] 托盘菜单中显示“开机自动启动”复选框。
- [ ] 取消勾选后，重启系统时不再自动启动。
- [ ] `electron-store` 中持久化 `autoLaunch` 键。

### Tech Stack（技术栈）

| 层 | 工具 | 说明 |
|----|------|------|
| 打包 | `electron-builder` v25 | 输出 NSIS `.exe` |
| 安装格式 | NSIS | 已在 `package.json` 中配置 |
| 自动启动 API | `app.setLoginItemSettings()` | Electron 内置，无需额外依赖 |
| 自动启动状态读取 | `app.getLoginItemSettings()` | 用于诊断和状态核对 |
| 设置持久化 | `electron-store` | 保存 `autoLaunch: boolean` |
| 渲染层桥接 | `preload.js` | 暴露 `setAutoLaunch` / `getAutoLaunch` 等接口 |

### Commands（命令）

```bash
# 开发运行
npm run dev

# 构建安装包（输出到 dist/ 目录）
npm run build

# 查看构建产物
ls dist/
```

### Project Structure（涉及文件）

```text
desktop-pet/
├── main.js                <- 修改：自启动逻辑、托盘菜单、IPC handler
├── preload.js             <- 修改：向 renderer 暴露自启动相关桥接
├── package.json           <- 修改：补全 electron-builder / NSIS 配置
├── src/
│   └── index.html         <- 通常无需改动
└── docs/
    └── plan/
        └── installer-plan.md
```

### Boundaries（边界）

- Always:
  - 修改 `main.js` 前先确认 IPC 命名不冲突。
  - 先完成开发态联调，再进行安装包验证。
  - 所有 Electron 主进程 API 仅在主进程调用。
- Ask first:
  - 修改 `package.json` 中现有 `appId`。
  - 将 `productName` 从现值改为中文名。
  - 新增代码签名证书配置。
- Never:
  - 不删除现有 IPC handlers。
  - 不在 renderer 中直接调用 `app.setLoginItemSettings()`。
  - 不把开发态观察结果当作最终验收依据。

---

## 三、任务分解（planning-and-task-breakdown）

### 依赖图

```text
[1] 补全 electron-builder 配置
        |
        v
[2] 实现自启动核心逻辑（main.js + preload.js）
        |
        v
[3] 托盘菜单加入“开机自动启动”开关
        |
        v
[4] 本地联调验证
        |
        v
[5] 构建 setup.exe 并手动安装验证
```

### Phase 0：前置条件

#### Task 0：补齐构建所需静态资源与命名决策
**Description：** 在正式实现前，确认图标资源和安装包显示名称，避免中途改构建元数据导致返工。

**Acceptance criteria：**
- [ ] 提供 `assets/icon.png`，建议至少 256x256，优先 1024x1024。
- [ ] 确认安装包和应用展示名是否从当前 `DeskPet` 改为 `七九桌面爱宠`。
- [ ] 若使用中文展示名，确认桌面快捷方式、卸载项和安装器显示名统一。

**Verification：**
- [ ] 仓库中存在 `assets/icon.png`。
- [ ] 文档与 `package.json` 的命名保持一致。

**Dependencies：** None  
**Files:** `assets/icon.png`, `package.json`, `docs/plan/installer-plan.md`  
**Estimated scope:** XS

---

### Phase 1：打包基础配置

#### Task 1：补全 electron-builder NSIS 配置
**Description：** 在 `package.json` 的 `build` 字段中补全 NSIS 安装包所需配置，确保可生成可安装的 `setup.exe`。

**Acceptance criteria：**
- [ ] `build.nsis.oneClick` 设为 `false`。
- [ ] `build.nsis.allowToChangeInstallationDirectory` 设为 `true`。
- [ ] `build.nsis.createDesktopShortcut` 设为 `true`。
- [ ] `build.nsis.createStartMenuShortcut` 设为 `true`。
- [ ] `build.win.icon` 指向有效图标资源。
- [ ] `build.productName` 与已确认的展示名一致。
- [ ] `build.nsis.uninstallDisplayName` 与展示名一致。
- [ ] 如需卸载时清理注册表残留，补充自定义 NSIS 脚本。

**Verification：**
- [ ] `npm run build` 无报错。
- [ ] `dist/` 目录生成 `.exe` 安装包。

**Dependencies：** Task 0  
**Files:** `package.json`  
**Estimated scope:** XS

---

### Phase 2：自动启动核心逻辑

#### Task 2：在主进程实现自启动设置与读取
**Description：** 使用 `app.setLoginItemSettings()` 和 `app.getLoginItemSettings()`，在应用启动时根据 `electron-store` 中的偏好同步系统自启动状态。

**Acceptance criteria：**
- [ ] 启动时读取 `store.get('autoLaunch')`。
- [ ] 若 `autoLaunch` 不存在，则写入默认值 `true`，并开启系统自启动。
- [ ] 若 `autoLaunch` 已存在，则以 store 中的值为准同步系统状态。
- [ ] 添加主进程 IPC handler `set-auto-launch`，接受 `boolean` 参数并完成设置与持久化。
- [ ] 添加主进程 IPC handler 或辅助方法用于读取当前偏好，供托盘或调试使用。

**Verification：**
- [ ] `npm run dev` 下可手动触发 `set-auto-launch(true/false)`，且不会报错。
- [ ] store 中 `autoLaunch` 值与切换结果一致。
- [ ] 打包版本中，自启动行为与 store 设定一致。

**Dependencies：** Task 1  
**Files:** `main.js`  
**Estimated scope:** S

#### Task 2.1：在 preload 中暴露自启动桥接接口
**Description：** 为 renderer / DevTools 调试暴露安全、最小化的桥接接口，避免文档中的验证方式与真实代码结构脱节。

**Acceptance criteria：**
- [ ] `preload.js` 暴露 `setAutoLaunch(boolean)`。
- [ ] 如有需要，暴露 `getAutoLaunch()` 或等价查询接口。
- [ ] 不暴露 Electron 主进程对象本身，仅暴露受控 IPC 方法。

**Verification：**
- [ ] DevTools 中可调用 `window.electronAPI.setAutoLaunch(false)`。
- [ ] 调用后返回结果可用于判断是否设置成功。

**Dependencies：** Task 2  
**Files:** `preload.js`  
**Estimated scope:** XS

---

### Phase 3：托盘菜单集成

#### Task 3：在托盘菜单中添加“开机自动启动”开关
**Description：** 在 `buildTrayMenu()` 中增加一个 checkbox 菜单项，点击时切换自启动状态，并在菜单重建时保持勾选状态正确。

**Acceptance criteria：**
- [ ] 托盘菜单中出现“开机自动启动” checkbox 项。
- [ ] checkbox 的默认勾选状态与当前期望状态一致。
- [ ] 点击后立即生效，并持久化到 store。
- [ ] 菜单重建后仍显示正确勾选状态。

**Verification：**
- [ ] `npm run dev` 启动后右键托盘图标，可见菜单项。
- [ ] 点击切换后，store 状态与 UI 同步变化。
- [ ] 重启应用后，菜单勾选状态与上次保存一致。

**Dependencies：** Task 2, Task 2.1  
**Files:** `main.js`  
**Estimated scope:** XS

---

### Checkpoint：Phase 1-3 完成标准

- [ ] 开发态下所有功能可联调，不报错。
- [ ] 自启动开关可在托盘菜单中切换并持久化。
- [ ] `electron-store` 中的 `autoLaunch` 与 UI 状态一致。
- [ ] 人工审查通过后，才进入安装包验证。

---

### Phase 4：构建与验证

#### Task 4：构建 setup.exe 并在干净环境测试
**Description：** 运行 `npm run build` 生成安装包，并在没有开发环境依赖的 Windows 机器或虚拟机上做端到端验证。

**Acceptance criteria：**
- [ ] 成功生成 `dist/*.exe` 安装包。
- [ ] 安装包在干净 Windows 环境可正常安装。
- [ ] 安装后存在桌面快捷方式和开始菜单条目。
- [ ] 首次运行后，自启动默认开启。
- [ ] 重启系统后，应用自动启动。
- [ ] 托盘菜单功能完整可用。

**Verification：**
- [ ] 在虚拟机或第二台 PC 完成安装测试。
- [ ] 验证路径包含中文字符时安装与运行正常。
- [ ] 记录安装结果或截图。

**Dependencies：** Phase 1-3 Checkpoint  
**Files:** 无代码修改，仅测试  
**Estimated scope:** M

---

### 最终验收

- [ ] 所有 Task Acceptance criteria 满足。
- [ ] 干净环境测试通过。
- [ ] 如项目流程要求，更新 `CHANGELOG.md`。

---

## 四、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| Windows Defender / SmartScreen 对未签名 `.exe` 给出警告 | 中 | MVP 阶段属正常现象，可在 README 中说明，后续再接入代码签名 |
| `app.setLoginItemSettings()` 在开发态与打包态行为不一致 | 中 | 以打包版本验收，不以 `npm run dev` 结果作为最终结论 |
| 安装路径包含中文字符时出现异常 | 低 | 在 Phase 4 中显式覆盖中文路径测试 |
| 文档假设和实际桥接接口不一致，导致验证步骤失效 | 中 | 将 `preload.js` 纳入正式改动范围，并把验证步骤与接口定义保持一致 |
| 图标资源缺失导致构建回退为默认 Electron 图标 | 中 | 将 `assets/icon.png` 设为前置条件，不满足则不进入构建验收 |

---

## 五、开放问题（待确认 / 待落实）

- [ ] 应用图标：当前仓库中尚未发现 `assets/icon.png`，实现前需补齐。
- [ ] 安装包显示名称：当前 `package.json` 的 `productName` 仍为 `DeskPet`，需确认是否改为 `七九桌面爱宠`。
- [ ] 卸载时是否必须清理自启动注册项：若要求“卸载即彻底清理”，则需要自定义 NSIS 脚本。
- [x] 安装模式：使用 `oneClick: false`，允许用户选择安装路径。

---

*最后更新：2026-05-05*

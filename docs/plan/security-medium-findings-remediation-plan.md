# 两项 Medium 安全发现修复计划

## 状态

已实施并验证通过 (2026-07-21)。

## 背景与范围

2026-07-21 的全仓安全扫描确认了两项 Medium 级别发现。本计划只覆盖以下问题：

1. `RAW-IPC-MOUSE-PASSTHROUGH`：未经主进程发件方授权的鼠标穿透 IPC。
2. `RAW-BUILD-POWERSHELL-PATH`：Windows 打包钩子通过裸 `powershell.exe` 名称启动进程。

不在本计划内的 Low 级发现应单独评估，避免将互不相关的安全改动混入同一修复。

### 扫描证据与受影响位置

| 发现 | 当前证据 | 风险说明 |
| --- | --- | --- |
| `RAW-IPC-MOUSE-PASSTHROUGH` | `preload.js:12` 暴露 `setIgnoreMouseEvents`；`src/main/windows/PetWindow.js:24` 注册 `set-ignore-mouse-events`；`PetWindow.js:50` 将请求传入 `setPetWindowMousePassthrough` | 任意可取得该 channel 的 renderer 都能请求 `ignore: false`，使常驻最顶层透明窗口拦截鼠标事件；当前 handler 未验证 `event.sender`，且 `ignore: false` 在未携带租约时可持续生效。 |
| `RAW-BUILD-POWERSHELL-PATH` | `package.json:76` 配置 Windows `afterPack`；`scripts/afterPack.js:20` 调用 `spawnSync('powershell.exe', ...)` | Windows 进程搜索会受当前目录与 `PATH` 影响。构建工作区或环境已被污染时，可能启动同名的非系统 PowerShell 程序。 |

相关既有实现和测试也应作为改动依据，而非重写：

- `src/main/ipcContracts.js` 已限制鼠标穿透参数：只保留 `forward: true`，并把 lease 限制在 30 秒内。
- `src/main/windows/PetWindow.js` 已在 `setPetWindowMousePassthrough` 内实现“临时禁用穿透后自动恢复”的定时器；该语义必须完整保留。
- `src/main/services/activeWindowProvider.js` 已有系统 PowerShell 路径构造模式，可参考其 Windows 路径解析思想，但构建脚本不应依赖运行时活动窗口服务。
- 现有回归入口包括 `test/mainMousePassthrough.test.js`、`test/ipcContracts.test.js`、`test/playwrightElectronSmoke.test.js`、`test/macosPackaging.test.js` 与 `test/activeWindowProvider.test.js`；当前没有专门覆盖 `afterPack` 的 Windows 路径测试文件。

## 目标

- 只允许主透明宠物窗口调用鼠标穿透 IPC；拒绝缺少、已销毁或不匹配的发件方。
- 保持默认鼠标穿透、悬停交互，以及临时禁用穿透后的自动恢复租约行为不变。
- 保留既有 E2E QA 入口，避免测试因新的 IPC 授权边界而死锁。
- Windows 打包仅从受信任的系统路径启动 Windows PowerShell，避免受构建环境 `PATH` 或当前目录影响。
- 为两个边界补充可在非 Windows 环境运行的确定性自动化测试。

## 概览（原计划结构保留）

按安全边界由运行时到构建时的顺序完成修复：先授权鼠标穿透 IPC，再固定 Windows 构建时 PowerShell 的可信可执行文件路径。两项修复各自完成独立的“实现 → 聚焦测试 → 全量测试 → 文档”闭环，不能只在最后统一验证。

原计划采用的架构选择如下：

1. 以一个可复用的主进程 IPC 发件方授权帮助函数实施最小白名单。
2. 不修改鼠标穿透的 lease、默认 `forward: true` 行为或 QA/E2E 入口。
3. 打包脚本独立复用“绝对系统 PowerShell 路径”这一思路，不从运行时服务导入代码。
4. 对 IPC 授权与构建路径选择分别建立确定性测试，不将 Windows 特有行为完全留给人工发布验证。

## 决策与约束

### IPC 发件方授权

主进程是 IPC 的最终安全边界。`set-ignore-mouse-events` 的处理器应比较
`event.sender` 与 `windowManager.mainWindow.webContents`；任一对象不存在、窗口已销毁或发件方不一致时，直接返回且不改变窗口鼠标事件状态。

授权逻辑应提取为小型可复用帮助函数，而不是在每个 handler 中复制判断。当前只实现主窗口白名单，不提前抽象为通用角色或权限注册表。专供 QA 的主进程调用入口（例如 `app.openSkinSelectorForQA`）不经过该 renderer IPC 授权判断，必须保持可用。

这项授权是“通道级”的：它只收紧 `set-ignore-mouse-events`，不改变 preload 暴露的 API 名称、调用参数、IPC 合约或其他窗口的正常主进程控制流。授权失败必须静默 fail closed（不执行窗口状态变更），并且不得清除、替换或延长既有的穿透恢复定时器。

### Windows PowerShell 路径

`scripts/afterPack.js` 应按 Windows 的 `SystemRoot`（回退 `windir`）解析：

```text
<SystemRoot>\\System32\\WindowsPowerShell\\v1.0\\powershell.exe
```

该路径避免 Windows 进程搜索顺序选择构建目录或 `PATH` 中同名可执行文件。若无法得到可信的绝对系统路径，打包应失败并给出明确错误，而不是回退到裸命令名。macOS 的可执行文件重写分支保持原样。

路径选择只发生在 Windows 分支。非 Windows 平台不需要也不应尝试寻找 Windows PowerShell；`afterPack` 当前的 macOS 处理和其他平台的提前返回保持不变。

## 实施前检查

开始任何代码改动前，确认以下前提：

1. 工作区的未提交变更不与 `PetWindow.js`、`scripts/afterPack.js`、相关测试或文档重叠；若重叠，先界定所有权并避免覆盖用户改动。
2. 读取当前 `PetWindow.js` 的 `ipcMain.on('set-ignore-mouse-events', ...)` 和 `setPetWindowMousePassthrough`，确认 handler 注册与窗口销毁清理顺序。
3. 读取 `preload.js` 的 API 暴露、`ipcContracts.js` 的参数规范化，以及 Playwright smoke 中实际使用的 QA 入口，确保授权不会误当作 renderer IPC 限制。
4. 读取 `scripts/afterPack.js`、`package.json` 的 `afterPack` 配置和 `test/macosPackaging.test.js`，确认图标脚本调用的现有参数、错误传播和 macOS 回归断言。

## 实施任务

### 1. 新增 IPC 发件方授权帮助函数

建议文件：

- `src/main/services/IpcSenderAuthorization.js`
- `test/ipcSenderAuthorization.test.js`

实现一个只回答“该 Electron WebContents 是否为当前主窗口”的纯粹帮助函数。它必须在以下情形返回拒绝：主窗口不存在、主窗口已销毁、`webContents` 不存在或已销毁、`event.sender` 缺失、发件方不匹配。

建议测试矩阵：

| 场景 | 预期 |
| --- | --- |
| `event.sender` 与活动 `mainWindow.webContents` 为同一对象 | 允许。 |
| `event` 或 `event.sender` 缺失 | 拒绝。 |
| `mainWindow` 不存在或 `isDestroyed()` 为真 | 拒绝。 |
| `mainWindow.webContents` 缺失或已销毁 | 拒绝。 |
| 另一 BrowserWindow 的 `webContents` | 拒绝。 |

不以可伪造的 URL、窗口标题或 renderer 传入的 ID 作为授权依据；主进程仅信任 Electron 提供的实际 `WebContents` 对象关系。

验收：

```bash
node --test test/ipcSenderAuthorization.test.js
```

### 2. 限制鼠标穿透 IPC 的调用者

建议文件：

- `src/main/windows/PetWindow.js`
- `test/mainMousePassthrough.test.js`

在 `set-ignore-mouse-events` handler 处理任何参数前调用任务 1 的授权函数。仅获准的主窗口发件方可继续进入既有的 `normalizeMousePassthroughRequest`、`setPetWindowMousePassthrough` 和租约恢复逻辑。

新增或调整测试以证明：

- 主窗口能启用和临时禁用鼠标穿透；
- 其他窗口或缺失发件方的请求不会调用 `setIgnoreMouseEvents`；
- 非法请求不会覆盖正在运行的自动恢复租约；
- 默认 `true, { forward: true }` 行为未变化；
- QA 相关入口仍能被 Playwright smoke 测试调用。

实现约束：

- 保持 `ipcMain.on` 的 channel 名称为 `set-ignore-mouse-events`，不迁移为新的 invoke/handle 协议。
- 保持 `normalizeMousePassthroughRequest` 是参数有效性的唯一判断入口；发件方授权只决定“谁能调用”，不重复实现参数校验。
- 保持未传入有效 `leaseMs` 时的既有永久状态语义；此次只消除未授权 renderer 改变该状态的能力。
- 不删除或收紧主进程 QA 函数；它们用于 E2E 初始化或专用窗口测试，与 renderer 发送 IPC 是不同的调用边界。

验收：

```bash
node --test test/mainMousePassthrough.test.js test/ipcContracts.test.js
node --test test/playwrightElectronSmoke.test.js
```

完成本任务后先运行完整测试，再开始构建脚本修复：

```bash
npm test
```

#### 检查点 A：IPC 修复完成条件

只有同时满足以下条件，才能进入 PowerShell 路径修复：

1. 新的授权帮助函数测试和鼠标穿透测试通过。
2. 参数契约测试确认 `forward: true` 与最大 30 秒 lease 限制未回归。
3. `npm test` 通过。
4. 若 Electron 运行环境可用，执行 `npm run qa:electron:smoke`，确认 QA 入口和交互流程没有被阻断。
5. 更新 `CHANGELOG.md` 的 `Unreleased` / `Fixed`（中文）以及 `docs/structure.md` 中相应的主进程 IPC 安全边界说明；只描述已经实际完成并验证的 IPC 修复。

### 3. 让 afterPack 使用受信任的 PowerShell 路径

建议文件：

- `scripts/afterPack.js`
- `test/afterPackWindowsPowerShell.test.js`

在 `afterPack` 内部以绝对系统路径替代 `spawnSync('powershell.exe', ...)`。可复用现有 `activeWindowProvider.js` 中的路径构造思路，但不要让打包脚本依赖运行时活动窗口模块。将路径解析函数导出，以便单元测试直接验证。

建议将路径解析设计成可注入平台和环境的窄函数，以便测试无需修改实际 `process.platform` 或主机环境。Windows 分支依次读取 `SystemRoot`、`windir`，验证结果是绝对目录，再以 `path.join` 拼接 `System32/WindowsPowerShell/v1.0/powershell.exe`。没有可信根目录时抛出描述性错误；不可返回 `'powershell.exe'`、相对路径或从 `PATH` 取得的结果。

测试应通过注入或替换 `spawnSync`，断言 Windows 分支：

- 传给 `spawnSync` 的第一个参数为系统目录下的绝对 `powershell.exe` 路径；
- `-NoProfile`、`-ExecutionPolicy Bypass`、固定的图标脚本路径和现有参数均保留；
- 无可信路径时抛出或返回失败，不会执行裸 `powershell.exe`；
- macOS 分支仍只执行原有可执行文件重写行为。

验收：

```bash
node --test test/afterPackWindowsPowerShell.test.js test/macosPackaging.test.js
rg -n "spawnSync\\('powershell\\.exe'" scripts/afterPack.js
```

最后一条命令应无匹配结果。

#### 检查点 B：构建脚本修复完成条件

1. Windows 路径解析测试覆盖 `SystemRoot`、`windir` 回退和无可信根目录的失败分支。
2. `spawnSync` mock 断言第一参数为绝对系统路径，且参数序列、`encoding: 'utf8'`、`stdio: 'inherit'` 等现有行为不变。
3. `test/macosPackaging.test.js` 通过，确保 macOS 手动更新可执行文件重写未被 Windows 修复影响。
4. 完整 `npm test` 通过。
5. 在可用的 Windows CI 或发布机额外执行一次真实打包；Linux/WSL 的单元测试不能替代 Windows 上的实际进程启动验证。
6. 更新 `CHANGELOG.md` 的 `Unreleased` / `Fixed`（中文）以及 `docs/structure.md` 对打包脚本职责的说明；只描述已经实际完成并验证的构建修复。

### 4. 集成验证与文档同步

按项目的“每个原子修复独立验证”规则，在 IPC 修复和打包修复各自完成后分别运行对应的聚焦测试与 `npm test`。不要把两项代码改动合并后才开始测试或补写文档。完成两项后再进行一次整体复核：

```bash
npm test
npm run qa:electron:smoke
```

若代码行为发生变化，更新 `CHANGELOG.md` 的 `Unreleased` 下 `Fixed` 条目，并更新 `docs/structure.md` 中主进程服务或打包脚本的职责说明。此计划文档本身不代表已修复，不应提前在变更日志中声称漏洞已经解决。

整体复核还应包含以下人工检查：

- 搜索 `scripts/afterPack.js`，确认不再存在裸 `spawnSync('powershell.exe', ...)` 调用。
- 审查 `PetWindow.js`，确认授权位于改变任何鼠标穿透状态之前，且失败分支没有副作用。
- 审查新增测试，确认它们断言可观察行为或调用参数，不依赖源文件的具体行号或字符串排列。
- 确认变更不触及 renderer 直接 Node API、皮肤选择 IPC 的专属授权逻辑或与本计划无关的窗口状态代码。

## Verification（原计划的验证部分，完整保留）

本节不以“建议”替代实际验收。实施时每个命令都必须执行、记录结果；若某项因环境不具备而未执行，必须明确记录原因，不可默认视为通过。

### 验证 1：IPC 发件方授权帮助函数

```bash
node --test test/ipcSenderAuthorization.test.js
```

应验证主窗口 `webContents` 被允许，其他窗口、缺失 sender、已销毁窗口和已销毁 `webContents` 全部被拒绝。

### 验证 2：鼠标穿透 IPC 与参数契约

```bash
node --test test/mainMousePassthrough.test.js test/ipcContracts.test.js
```

应验证：

- 授权主窗口可以正常请求 `set-ignore-mouse-events`；
- 未授权 sender 的请求不会触发 `mainWindow.setIgnoreMouseEvents`；
- 未授权请求不会影响既有 lease 的恢复定时器；
- 默认行为仍是 `setIgnoreMouseEvents(true, { forward: true })`；
- 无效 `ignore`、`options` 或超出范围的 lease 仍由既有契约逻辑拒绝或归一化；
- 合法的临时 `ignore: false` 请求到期后仍自动恢复到 `true, { forward: true }`。

### 验证 3：E2E QA 入口与 Electron smoke

```bash
node --test test/playwrightElectronSmoke.test.js
npm run qa:electron:smoke
```

第一条确认 smoke 脚本的契约测试；第二条在 Electron、Playwright 和显示环境可用时执行真实 smoke。应确认 `app.openSkinSelectorForQA` 等主进程 QA 入口仍可驱动测试，不会因 renderer IPC 的 sender 授权而死锁。

### 验证 4：Windows PowerShell 可信路径

```bash
node --test test/afterPackWindowsPowerShell.test.js
```

应验证：

- `SystemRoot` 存在时解析到 `<SystemRoot>\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`；
- `SystemRoot` 缺失时可使用 `windir`；
- 任一环境值不是绝对路径，或两个值都不可用时，Windows 打包分支明确失败；
- `spawnSync` 的第一个参数为可信绝对路径，绝不为裸 `'powershell.exe'`；
- PowerShell 既有参数 `-NoProfile`、`-ExecutionPolicy Bypass`、`-File`、`-ExePath` 和 `-IconPath` 不变；
- `encoding: 'utf8'` 与 `stdio: 'inherit'` 等既有调用选项不变。

### 验证 5：macOS 打包回归与裸命令静态检查

```bash
node --test test/macosPackaging.test.js
rg -n "spawnSync\\('powershell\\.exe'" scripts/afterPack.js
```

macOS 测试必须证明可执行文件重写分支没有因 Windows 改动而改变。第二条命令必须无输出；有任何匹配即表示构建脚本仍可能通过搜索路径启动 PowerShell。

### 验证 6：每个原子修复后的全量回归

在任务 2 完成后执行一次，在任务 3 与任务 4 完成后再执行一次：

```bash
npm test
```

不应因为第二项修复尚未完成而跳过 IPC 修复后的全量回归。这样可以定位两项独立变更各自引入的回归。

### 验证 7：Windows 实机/CI 打包

Linux 或 WSL 只能验证路径构造和进程调用参数，无法证明 Windows 真实进程搜索链已被绕开。因此在具备 Windows 环境时，执行项目既有 Windows 打包或发布预检流程，并确认 `afterPack` 成功运行且未从构建目录或 `PATH` 选择同名程序。

### 最终完成判定

只有以下全部成立，两个 Medium 发现才能标记为已修复：

- 两项新增或调整的聚焦测试通过；
- 两次要求的 `npm test` 均通过；
- 可运行时，Electron smoke 通过；无法运行时有明确环境说明；
- Windows 实机或 CI 打包验证通过，或明确作为待补的发布前阻塞项；
- `CHANGELOG.md` 的 `Unreleased` / `Fixed` 用中文记录已完成的实际修复；
- `docs/structure.md` 已反映主进程 IPC 授权边界与构建脚本职责的变化；
- 对修复 diff 进行最终人工审查，确认没有未授权 sender 可到达的鼠标事件状态变更路径，也没有裸 PowerShell 命令路径残留。

## 风险与缓解

| 风险 | 缓解方式 |
| --- | --- |
| 发件方限制使自动化测试无法打开或控制窗口 | 仅保护目标 renderer IPC；保留主进程 QA 入口，并执行 Playwright smoke 测试。 |
| 授权函数被过度设计，扩大改动面 | 只实现当前主窗口白名单和 fail-closed 判断。 |
| `SystemRoot` 变量缺失导致 Windows 打包不可用 | 同时支持 `SystemRoot` 与 `windir`，并在无法得到绝对路径时明确失败。 |
| Linux/WSL 不能复现 Windows 的进程搜索顺序 | 用路径解析和 `spawnSync` 参数单测覆盖逻辑；在 Windows CI 或发布机完成一次实际打包验证。 |

## 推荐执行顺序

1. 完成任务 1 并运行授权帮助函数测试。
2. 完成任务 2，运行 IPC 聚焦测试和 `npm test`。
3. 完成任务 3，运行 Windows 打包路径与 macOS 打包回归测试。
4. 完成任务 4，执行完整回归与可选的 Electron smoke 测试。

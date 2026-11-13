# 2026-11-13 审核复核问题修复计划

依据 [code-review-audit-verification-2026-11-13.md](../code-review-audit-verification-2026-11-13.md)（基线 `main@ea5e163`）逐项修复。

分工约定：

- 在 macOS 上能完成修复与自动化验证的条目，直接修复并勾选。
- 需要 Windows 实机或 Windows CI 才能确认的部分，标记为 **【Windows 待验证】**，集中列在文末清单，换到 Windows 机器后按清单逐项处理。
- 每个任务单独提交，提交内含测试、本计划勾选和 `CHANGELOG.md`。

---

## P1

- [x] **Task H1：启动阶段已保存的皮肤被写回 `default`**
  - [x] `SkinService` 新增 `restoreConfirmedSkinFromStore(store)`，`AppLifecycle.initCoreServices()` 在 store 就绪后、渲染进程可调用 `save-data` 之前调用。放在 `initCoreServices` 而非审核报告建议的 `initSubWindowsAndIpc`，这样托盘、番茄钟等所有主进程消费方从一开始就读到正确皮肤。
  - [x] 回归测试：非默认皮肤 + 首次 `save-data` 先于 `applySkinById`，落盘 `skinId` 不变（`test/storageIpcAuthorization.test.js`），另有 `test/skinService.test.js` 与 `test/appLifecycle.behavior.test.js` 的单元覆盖。
- [x] **Task H2：拖拽结束后无条件恢复鼠标穿透**
  - [x] macOS 上完成修复与 fake-DOM 单元测试：`PetRenderer` 的 `finishDrag` 三条恢复路径（100ms 延迟、watchdog、`blur`）统一走 `restoreMousePassthroughIfIdle()`，指针仍在宠物上（`:hover`）或右键菜单打开时不恢复。
  - [x] 复核补修：拖拽期间下发的 `leaseMs: 1000` 租约会在主进程计时，到期把窗口改回穿透。`:hover` 分支现在额外发送一次不带 `leaseMs` 的 `setIgnoreMouseEvents(false)` 取消该租约；菜单已打开时仍不发送，避免取消 `ContextMenu` 自己的 10 秒租约。`mouseleave` 的菜单判断同步改用 `isContextMenuOpen()`（菜单元素不存在时不再被当作"已打开"）。`test/petWindow.test.js` 补主进程租约取消/到期测试。
  - [ ] 【Windows 待验证】真机拖拽后原地单击，确认不穿透（步骤见文末清单）。macOS 真机同样建议手动确认一次。
- [ ] **Task H3：Windows 前台窗口坐标口径不确定**（本轮未改代码）
  - [ ] 【Windows 待验证】先在 Windows 采集原始 bounds，确认口径后再改代码。该功能只在 Windows 启用（macOS 不支持窗口边缘行走），无法在 macOS 上复现，步骤见文末清单。

## P2

- [x] **Task M1：首个 `screen-info` 丢失后无补偿**
  - [x] `src/app.js` 在第一个 `await` 之前订阅 `onScreenInfo` 并缓存，系统就绪后回放，不新增 IPC 拉取接口。
  - [x] 不提前 `onSaveBeforeQuit`：状态未加载时保存会用默认值覆盖存档，与审核报告"可随 M1 提前"的建议不同，理由见 `docs/structure.md`。
- [x] **Task M2：更新包完整性校验失败无提示、无日志**
  - [x] 校验失败写日志并弹出 `updateErrIntegrity` 错误对话框（三语），`verifyDownloadedPackageIntegrity` 的 `catch` 记录异常；`state.error` 仍为稳定标识 `integrity-check-failed`，保持 ADR-025 约定。
- [x] **Task M3：更新进度窗口加载期间进度被初始载荷覆盖**
  - [x] `UpdateProgressWindow.js` 记录 `latestPayload`，`did-finish-load` 补发最新值；`closed` 回调只清理仍指向自己的引用；`close()` 同时重置 `latestPayload`。新增 `test/updateProgressWindow.behavior.test.js`。
- [x] **Task M4：主窗口关闭时未关闭体型调节窗口**
  - [x] `PetWindow` 的 `closed` 回调补关体型调节窗口（走窗口自身 `close` 监听器回滚未确认预览）与更新进度窗口，`getPetSubWindows()` 保持不变。
- [x] **Task M5：互动覆盖层重复 ID**
  - [x] 采用审核报告的第二种方案：`hideOverlay` 开始渐隐前先释放旧节点的 `id`，保留渐隐动画，不在 `showOverlay` 里直接移除旧节点。
- [x] **Task M6：Release Preflight 权限过宽**（工作流改动，【CI 待验证】见文末清单）
  - [x] 顶层权限降为 `contents: read`；版本号同步拆成只在 `workflow_dispatch` 运行的 `sync-version` 作业（唯一 `contents: write`），Windows 预检作业 `needs: sync-version` 并在手动触发时检出分支最新提交。新增 `test/releasePreflightWorkflow.test.js` 静态断言权限边界。
  - [x] macOS 预检作业新增 `npm run test:integration`（本机 <1 秒，19 个用例通过）。
  - [x] 复核补修：`preflight-mac` 补上与 Windows 预检一致的 `needs: sync-version`、`if: always() && (…)` 与 `workflow_dispatch` 时的 checkout `ref`，`test/releasePreflightWorkflow.test.js` 增加对称断言。
  - [ ] 【Windows 待验证】Windows 预检作业暂未接入 `test:integration`，等在 Windows 本机跑通后再加。`test:e2e` 与 `qa:electron:smoke` 需要显示环境，本轮不接入 CI。
- [x] **Task M7：Windows 构建创建 draft release 缺少竞态兜底**（pwsh 步骤，【Windows 待验证】）
  - [x] Windows 上传步骤在 `gh release create` 失败后再执行一次 `gh release view`，两者都失败才抛错，与 macOS 作业一致。新增 `test/buildInstallerWorkflow.test.js` 静态断言。
  - [ ] 【Windows 待验证】需要在真实 tag 推送上观察一次，见文末清单。
- [x] **Task M8：macOS 手动更新弹窗硬编码中文**
  - [x] 新增 `updateMacManualCurrentVersion` / `updateMacManualLatestVersion`（带 `{version}` 占位符，三语）。没有实现审核报告建议的"版本号缺失时省略对应行"：macOS 分支只在 `isNewerVersion(latest, current)` 为真后进入，两个版本号必然存在，`null` 字面值不会出现，省略分支是死代码。

## P3

- [x] **Task L1：`PetVisibilityService` 补 `isDestroyed()` 守卫**
- [x] **Task L2–L4：`SkinService` 小问题**
  - [x] L2：确认皮肤时等待中的加载被取消或被取代，返回 `STALE_REQUEST` 而不是 `LOAD_FAILED`。
  - L3：**不修复**。首次安装没有 `petState` 时由随后 `switch-skin` 的 `persist: true` 让渲染进程保存完整 `petState`；若主进程改写一个只有 `skinId` 的残缺 `petState`，渲染进程启动读取时会拿到缺少养成数值的存档，风险高于收益。
  - [x] L4：移除 `appRoot: __dirname` 无效配置；`manifestNotFound` 粘滞缓存**不修复**，`test/protectedAssetLoader.test.js` 明确把"负缓存保持到显式清理"作为设计行为。
- [x] **Task L5：托盘保留 `idleResetMinutes` 原值**
- [x] **Task L6：久坐提醒 `deferTimer` 清理与时钟回拨**
- [x] **Task L7：天气同步数值校验与响应上限**
- [x] **Task L8：`ContextMenu.hide()` 淡出期间恢复穿透**（**不修复**）
  - 菜单关闭后立即恢复穿透符合"菜单已关闭"的语义。若改成等 `getAnimations()` 结束（最长约 250ms）再恢复，用户在淡出期间点到仍可见的菜单项还可能重复触发动作，风险大于收益。
  - 相关的真实风险是 H2 同类问题：右键菜单覆盖在宠物上，选完项后指针可能停在宠物上而穿透已恢复。`hide()` 当下指针在菜单上，`pet.element.matches(':hover')` 恒为假，无法像 H2 那样在此处判断，需要实机复现后再设计。已加入文末 H2 验证步骤。
- [x] **Task L9–L10：番茄钟提示字体与 `sweep` 动画**
  - [x] L9：番茄钟提示框改用 `--font-body`。
  - [x] L10：`sweep` 关键帧改为 `transform: translateX()`（百分比按 38% 填充宽度换算）。动画观感需要目测一次，见文末清单。
- [x] **Task L11：`protect-assets` 清理残留 `.dat`**
- [x] **Task L12：`push.sh` 工具链问题**
  - [x] `push.sh` 提交失败原先 `exit $?` 返回的是 `echo` 的状态（0），推送失败后脚本也以 0 结束；现在两种失败都以 1 退出。`push.ps1` 同样补上推送失败的 `exit 1`。新增 `test/pushScript.test.js` 在临时仓库里实跑 `push.sh`（pre-commit 钩子拒绝、无 `origin` 两种场景）。
  - [x] **不修改**：`git add .`（脚本契约就是提交全部改动，已有敏感目录拦截）、固定推送 `origin main`（文档约定的主干工作流）、本地 `sync:cp --verify` 内部的 `npm ci`（隔离 worktree 验证的必要步骤，[ADR-049](../decisions/ADR-049-main-to-cp-auto-sync.md)），这些是流程取舍，不是缺陷。
  - [x] 【Windows 已验证】`push.ps1` 的 `exit 1` 无法在 macOS 上执行；已在 Windows 上运行 `node --test test/pushScript.test.js`，确认 "push.ps1 parses in Windows PowerShell" 与 "push.ps1 reports a failed push through its exit code" 均通过（`push.sh` 用例按平台跳过）。
- [x] **Task L13：ADR 校验退出码与 `check:adrs` 脚本**
  - [x] `check_adrs.js` 发现缺失章节时退出码为 1；新增 `npm run check:adrs`；补齐 [ADR-049](../decisions/ADR-049-main-to-cp-auto-sync.md) 缺失的 `Alternatives Considered`（内容全部取自该 ADR 已有的 Context/Decision 理由）。`test/check_adrs.test.js` 增加对全部 ADR 的检查，因此 `npm test`（CI 已运行）会拦截今后的格式缺失。
- [x] **Task L14：失效文档链接**
  - [x] `docs/structure.md`、`ADR-031`、`CHANGELOG.md` 改指向 `docs/archive/`；CHANGELOG 里同一批归档的 `code-review-report` 与 `code-review-fix-plan` 两条链接一并修正；本计划文件里一处缺少 `../` 的 ADR 链接也已修正。新增 `test/docLinks.test.js` 检查 `docs/*.md`、`docs/decisions/`、`docs/plan/` 的相对链接。
  - 其余未处理的失效链接（不在 L14 范围，历史记录）：`CHANGELOG.md` 中指向已归档或不存在的 `docs/plan/*-plan.md` 四处、`AGENTS.md` 里的 `ADR-xxx.md` 示例占位符、`docs/performance/` 基线报告里指向未提交 `raw/` 采样文件的链接。
- [x] **Task L15–L16：死代码清理**
  - [x] 删除 `PetRenderer.update()` 里只更新缓存字段的 `_renderedDirection` 判断块及其初始化（仓库内无其他引用）；删除 `SkinSelectorWindow.js` 中没有调用方也未导出的 `isValidSkinSelectorSender`（选肤窗口的 sender 校验由 `SkinService.isSkinSelectorRequest` 承担）。无行为变化，不新增测试，由现有全量测试覆盖。
- [x] **Task L17：托盘模板图标从打包中排除**
  - [x] `build.files` 增加 `!src/assets/iconTemplate*.png`。已在 macOS 用 `electron-builder --mac --dir --arm64`（输出到临时目录）实际打包验证：`app.asar` 里不再有这两个文件，`icon.png/ico/icns` 保留；测试和 CP 同步白名单仍引用的源文件留在仓库。
  - [x] 额外发现已处理：本机未跟踪的 `backups/` 目录（`.gitignore` 已忽略，但 electron-builder 不读取 `.gitignore`）此前会把其中的明文皮肤 WebP 打进 `app.asar`。`build.files` 增加 `!backups/**`，`scripts/verify-package-contents.js` 的禁止路径增加 `backups`，打包后检查会拦截；`test/packageContentsSecurity.test.js` 补断言。CI 上没有这个目录，不受影响。
  - [ ] 【Windows 待验证】Windows 打包同样走 `build.files`，下次在 Windows 上 `npx electron-builder --win --dir` 后，用 `npm run verify:package` 并确认 `app.asar` 不含 `iconTemplate`。
- [x] **Task L18：调试工具门控**
  - [x] `src/debug.js` 的控制台辅助函数由路径含 `/app.asar/` 改为按主进程下发的开关启用：`PetWindow` 在 `!app.isPackaged` 时通过 `additionalArguments` 传 `--deskpet-debug-tools`，`preload.js` 暴露 `electronAPI.debugToolsEnabled`。
  - [x] **刻意保留** `app.js` 挂载的 `window.__DEBUG_*` 数据对象：`tools/performance/scenarios.js` 在打包版上用 `__DEBUG_WEATHER/PETS/MOVEMENT` 做性能基线，门控它们会破坏这套测量；这一点审核报告没有提到。它们只存在于渲染进程主世界，不暴露任何 Node 能力，CSP 也限制了脚本来源。
  - [x] 已在 macOS 实机验证：开发模式 `debugToolsEnabled=true` 且 `testInteraction` 可用；`electron-builder --mac --dir` 的打包版 `debugToolsEnabled=false`、`testInteraction` 未定义、`__DEBUG_PETS/__DEBUG_WEATHER` 仍可用。
  - [ ] 【Windows 待验证】Windows 打包版同样需要确认一次，见文末清单。

---

## 【Windows 待验证】清单

换到 Windows 机器后按此清单处理，处理完成后回到本文件勾选。

| 编号 | 需要什么环境 | 要做什么 |
| --- | --- | --- |
| H3 | Windows 实机，125%/150% 缩放及混合 DPI 多屏 | 采集原始坐标，确认口径后再修复（唯一尚未改代码的 P1） |
| H2 | Windows 与 macOS 实机 | 拖拽后原地单击、右键，确认不穿透 |
| M6 | GitHub Actions | 手动触发与 PR 各跑一次 Release Preflight |
| M7 | GitHub Actions（Windows runner） | 下次推 `v*` tag 时观察 draft release 步骤 |
| L12（已完成） | Windows | `node --test test/pushScript.test.js` 确认 `push.ps1` 可解析（Windows 实跑通过：2 pass, 0 fail, 2 win32 skip） |
| L17 | Windows | Windows 打包后确认 `app.asar` 不含 `iconTemplate` |
| L18 | Windows | Windows 打包版确认 `debugToolsEnabled === false` |
| L10 | 任一平台 | 目测"检查更新"进度动画 |
| M6 补充 | Windows | 本机跑通 `npm run test:integration` 后，把该步骤加入 Windows 预检作业 |

### H3 Windows 前台窗口坐标口径

**背景**：`activeWindowProvider.js` 里常驻的 `powershell.exe` 子进程用 P/Invoke 调 `GetWindowRect`，脚本没有设置 DPI awareness，返回值是物理像素还是被系统虚拟化的逻辑坐标，取决于 `powershell.exe` 自身的清单设置。两个消费方的假设不一致：`PresentationGuard` 在 win32 上先做 `screenToDipRect` 再比较，`getActiveWindowPlatformRelativeToBounds` 直接把原始值当 DIP 使用。至少有一个是错的。**在确认口径之前不要套用 `screenToDipRect`，否则可能转换两次。**

**采集步骤**（每种环境各做一次：单屏 100%、单屏 125%、单屏 150%、混合 DPI 双屏，窗口分别放在两块屏上）：

1. 把记事本最大化，使其铺满一块屏；再还原并放到一个已知位置（例如屏幕左上附近）。
2. 在 `src/main/services/WindowAwarenessService.js` 收到采样结果的位置临时打印 `payload.bounds`（不要提交），`npm run dev` 启动，在终端里记录记事本成为前台窗口时的原始 `bounds`。
3. 在宠物窗口 DevTools 里执行 `window.__DEBUG_SCREEN()`，记录 `displays` 的 `bounds`、`scaleFactor`，再执行 `await window.probeWindowAwareness()` 看 `main` 与 `renderer` 里的平台矩形。
4. 判断口径：把记事本最大化后，原始 `bounds.width` 如果约等于显示器的**物理**宽度（例如 150% 缩放的 3840×2160 屏上约 3840），说明是物理像素；如果约等于**逻辑**宽度（约 2560），说明是被虚拟化的坐标。
5. 在 125%、150% 下把记事本放在屏幕上沿，观察宠物"站在窗口顶边"的位置是否与窗口上沿对齐；混合 DPI 下重复，记录偏移量。

**确认口径之后的修复方向**（沿用审核报告的建议）：

- 在脚本里调用 `SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`，把坐标统一为物理像素。
- 主进程收到 payload 时只做一次 `screenToDipRect`，两个消费方共用转换后的结果，并删除 `PresentationGuard` 里单独的转换。
- 补充 `test/activeWindowAwareness.test.js`、`test/presentationGuard.test.js` 里的 DPI 场景。

### H2 拖拽后原地单击不应穿透

代码已在 macOS 修复并有单元测试覆盖，但 `:hover` 在透明窗口 + `setIgnoreMouseEvents(true, { forward: true })` 下的真实行为需要实机确认。

1. `npm run dev` 启动，等宠物出现。
2. 按住宠物拖到屏幕中间，松手后鼠标不动。
3. 在宠物身上单击一次、再右键一次。预期：右键菜单正常弹出，下层应用窗口没有收到点击（可先在宠物下方放一个浏览器或记事本窗口观察）。
4. 把鼠标移出宠物，再点击宠物下方的应用。预期：点击正常落到下层应用（穿透已恢复）。
5. 拖拽时按住不动超过 1.2 秒（触发 watchdog）再松手，重复第 3、4 步。
6. （L8 相关）右键宠物弹出菜单，选一项或按 `Escape` 关闭，鼠标不动，再在宠物身上右键一次。预期菜单能再次弹出；如果这次右键穿透到了下层应用，说明 `ContextMenu.hide()` 也需要类似 H2 的指针判断，请记录复现条件后再处理。

### M6 Release Preflight 工作流拆分（GitHub Actions 实跑）

本机只能做静态校验（`test/releasePreflightWorkflow.test.js`），需要在 GitHub 上各跑一次：

1. 在 GitHub Actions 手动运行 `Release Preflight`，版本填一个与 `package.json` 不一致的值（例如当前版本 +0.0.1，跑完后手动回滚该版本提交），确认 `sync-version` 推送了提交，且 `preflight` 检出的是含该提交的最新版本、"Validate release metadata" 通过。
2. 再用与 `package.json` 一致的版本手动运行一次，确认 `sync-version` 打印 "already match" 后成功退出，`preflight` 正常继续。
3. 开一个触碰 `src/**` 的 PR，确认 `sync-version` 显示为 skipped，`preflight` 与 `preflight-mac` 仍然运行，且日志里的 `GITHUB_TOKEN` 权限为 `Contents: read`。
4. 确认 `preflight-mac` 的 "Run integration tests" 步骤通过。

### M7 Windows draft release 竞态兜底（pwsh 步骤）

pwsh 对原生命令退出码的处理无法在 macOS 上复现，需要在 Windows runner 上确认：

1. 下一次正式发布推送 `v*` tag 时，观察 `Build NSIS installer` 作业的 "Upload Windows release assets" 步骤日志：如果 `gh release create` 因为 macOS 作业抢先创建而失败，应继续并成功上传；如果两个作业间没有竞争，行为与之前一致。
2. 也可以在 Windows 本机用 PowerShell 7 手动验证 `$LASTEXITCODE` 判断逻辑：对一个已存在的 tag 执行 `gh release create`（预期非零退出），确认随后的 `gh release view` 分支走通。

### L12 `push.ps1` 解析校验

在 Windows 上运行 `node --test test/pushScript.test.js`，确认 "push.ps1 parses in Windows PowerShell" 通过（本次只在失败分支加了 `exit 1`）。

### L17 Windows 打包确认

1. `npm run protect:assets`，再 `npx electron-builder --win --dir --config.win.signAndEditExecutable=false`。
2. `npm run verify:package` 通过。
3. `npx @electron/asar list dist\win-unpacked\resources\app.asar | findstr iconTemplate` 应无输出。

### L18 调试开关（Windows 打包版）

用 `npx electron-builder --win --dir --config.win.signAndEditExecutable=false` 打出未签名包，启动 `dist\win-unpacked\*.exe`，在 DevTools 或用 Playwright `electron.launch({ executablePath })` 检查：`window.electronAPI.debugToolsEnabled === false`、`typeof window.testInteraction === 'undefined'`、`window.__DEBUG_PETS` 存在。开发模式（`npm run dev`）下 `debugToolsEnabled === true`。

### L10 更新进度窗口"检查中"动画

macOS 或 Windows 任一平台目测即可（样式与平台无关）：在托盘点击"检查更新"，观察进度窗口的"检查中"状态，绿色条应当和修改前一样从左侧滑入、划过进度条、从右侧滑出，循环往复，没有跳变或溢出进度条圆角。


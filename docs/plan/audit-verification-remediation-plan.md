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
  - [ ] 【Windows 待验证】真机拖拽后原地单击，确认不穿透（步骤见文末清单）。macOS 真机同样建议手动确认一次。
- [ ] **Task H3：Windows 前台窗口坐标口径不确定**
  - [ ] 【Windows 待验证】需先在 Windows 采集原始 bounds，确认口径后再改代码。macOS 不启用该功能，本轮不改代码。

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
  - [ ] 【Windows 待验证】Windows 预检作业暂未接入 `test:integration`，等在 Windows 本机跑通后再加。`test:e2e` 与 `qa:electron:smoke` 需要显示环境，本轮不接入 CI。
- [ ] **Task M7：Windows 构建创建 draft release 缺少竞态兜底**（pwsh 步骤，【Windows 待验证】）
- [x] **Task M8：macOS 手动更新弹窗硬编码中文**
  - [x] 新增 `updateMacManualCurrentVersion` / `updateMacManualLatestVersion`（带 `{version}` 占位符，三语）。没有实现审核报告建议的"版本号缺失时省略对应行"：macOS 分支只在 `isNewerVersion(latest, current)` 为真后进入，两个版本号必然存在，`null` 字面值不会出现，省略分支是死代码。

## P3

- [ ] **Task L1：`PetVisibilityService` 补 `isDestroyed()` 守卫**
- [ ] **Task L2–L4：`SkinService` 小问题**
- [ ] **Task L5：托盘保留 `idleResetMinutes` 原值**
- [ ] **Task L6：久坐提醒 `deferTimer` 清理与时钟回拨**
- [ ] **Task L7：天气同步数值校验与响应上限**
- [ ] **Task L8：`ContextMenu.hide()` 淡出期间恢复穿透**
- [ ] **Task L9–L10：番茄钟提示字体与 `sweep` 动画**
- [ ] **Task L11：`protect-assets` 清理残留 `.dat`**
- [ ] **Task L12：`push.sh` 工具链问题**
- [ ] **Task L13：ADR 校验退出码与 `check:adrs` 脚本**
- [ ] **Task L14：失效文档链接**
- [ ] **Task L15–L16：死代码清理**
- [ ] **Task L17：托盘模板图标从打包中排除**
- [ ] **Task L18：调试工具门控**

---

## 【Windows 待验证】清单

换到 Windows 机器后按此清单处理，处理完成后回到本文件勾选。

### H2 拖拽后原地单击不应穿透

代码已在 macOS 修复并有单元测试覆盖，但 `:hover` 在透明窗口 + `setIgnoreMouseEvents(true, { forward: true })` 下的真实行为需要实机确认。

1. `npm run dev` 启动，等宠物出现。
2. 按住宠物拖到屏幕中间，松手后鼠标不动。
3. 在宠物身上单击一次、再右键一次。预期：右键菜单正常弹出，下层应用窗口没有收到点击（可先在宠物下方放一个浏览器或记事本窗口观察）。
4. 把鼠标移出宠物，再点击宠物下方的应用。预期：点击正常落到下层应用（穿透已恢复）。
5. 拖拽时按住不动超过 1.2 秒（触发 watchdog）再松手，重复第 3、4 步。

### M6 Release Preflight 工作流拆分（GitHub Actions 实跑）

本机只能做静态校验（`test/releasePreflightWorkflow.test.js`），需要在 GitHub 上各跑一次：

1. 在 GitHub Actions 手动运行 `Release Preflight`，版本填一个与 `package.json` 不一致的值（例如当前版本 +0.0.1，跑完后手动回滚该版本提交），确认 `sync-version` 推送了提交，且 `preflight` 检出的是含该提交的最新版本、"Validate release metadata" 通过。
2. 再用与 `package.json` 一致的版本手动运行一次，确认 `sync-version` 打印 "already match" 后成功退出，`preflight` 正常继续。
3. 开一个触碰 `src/**` 的 PR，确认 `sync-version` 显示为 skipped，`preflight` 与 `preflight-mac` 仍然运行，且日志里的 `GITHUB_TOKEN` 权限为 `Contents: read`。
4. 确认 `preflight-mac` 的 "Run integration tests" 步骤通过。

（随任务推进补充其余条目）

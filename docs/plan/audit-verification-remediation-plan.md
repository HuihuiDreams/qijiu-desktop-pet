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
- [ ] **Task H2：拖拽结束后无条件恢复鼠标穿透**
  - [ ] macOS 上完成修复与 fake-DOM 单元测试。
  - [ ] 【Windows 待验证】真机拖拽后原地单击，确认不穿透。
- [ ] **Task H3：Windows 前台窗口坐标口径不确定**
  - [ ] 【Windows 待验证】需先在 Windows 采集原始 bounds，确认口径后再改代码。macOS 不启用该功能，本轮不改代码。

## P2

- [ ] **Task M1：首个 `screen-info` 丢失后无补偿**
- [ ] **Task M2：更新包完整性校验失败无提示、无日志**
- [ ] **Task M3：更新进度窗口加载期间进度被初始载荷覆盖**
- [ ] **Task M4：主窗口关闭时未关闭体型调节窗口**
- [ ] **Task M5：互动覆盖层重复 ID**
- [ ] **Task M6：Release Preflight 权限过宽**（工作流改动，需在 GitHub Actions 上验证）
- [ ] **Task M7：Windows 构建创建 draft release 缺少竞态兜底**（pwsh 步骤，【Windows 待验证】）
- [ ] **Task M8：macOS 手动更新弹窗硬编码中文**

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

（随任务推进补充）

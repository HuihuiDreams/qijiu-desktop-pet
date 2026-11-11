# 质量审核问题修复计划 (Audit Remediation Plan)

本文档记录 2026-11 审核指出的 6 项稳定性与质量问题的修复进度与执行跟踪。

---

## 阶段规划

- [x] **Task 1: 退出保存与自动保存检查写盘返回值**
  - [x] 修改 `TimeSystem.save()`：检查 `saveData` 的布尔返回值，失败时返回 `false`。
  - [x] 修改 `preload.js`：`onSaveBeforeQuit` 根据 `save()` 返回值判定 `success`（`result !== false`）。
  - [x] 修改 `src/app.js`：为定期自动保存调用补上 `.catch(console.error)`。
  - [x] 补充单元测试：测试 `saveData` 返回 `false` 时 `save()` 返回 `false` 以及退出确认标记为 `false`。
  - [x] 文档同步与原子提交。

- [x] **Task 2: 离线时间戳校验与防卡死封顶**
  - [x] 修改 `TimeSystem.getOfflineTime()`：校验 `Number.isFinite` 且大于 0；封顶最大离线时长（如 7 天 = 604,800,000 ms）。
  - [x] 补充单元测试：`savedAt = 1`（大跨度）与 `savedAt = "bad"`（坏数据）等边界场景。
  - [x] 文档同步与原子提交。

- [x] **Task 3: 开机自启设置状态核验与错误回滚**
  - [x] 修改 `AutoLaunchService.js`：`setAutoLaunchPreference` 中比对系统真实状态与请求值；失败时回滚内存偏好并返回 `success: false`。
  - [x] 补充单元测试：测试 `app.setLoginItemSettings` 抛错时 `success` 为 `false`，状态正确回滚。
  - [x] 文档同步与原子提交。

- [x] **Task 4: macOS 窗口感知降低无意义 pmset 采样开销**
  - [x] 修改 `WindowAwarenessService.js`：在 macOS (`darwin`) 下优化采样器调度策略（增大采样间隔至 30 秒或配合守卫按需调度），减少子进程创建。
  - [x] 补充/更新对应测试：验证 darwin 与 win32 下采样器启动与配置行为。
  - [x] 文档同步与原子提交。

- [ ] **Task 5: 预发布版本号解析与语义化比较**
  - [ ] 修改 `updateManager.js`：优化 `isNewerVersion`，支持去除前导 `v`、解析 `-beta.x` 等预发布后缀，实现规范的 SemVer 核心比较。
  - [ ] 补充单元测试：覆盖预发布版本、纯版本号及带 `v` 前缀的升级比较场景。
  - [ ] 文档同步与原子提交。

- [ ] **Task 6: 清理无调用方的 select-skin IPC 通道**
  - [ ] 删除 `SkinService.js` 中无外部调用的 `select-skin` IPC 处理器（保留内部主进程 `selectSkin` 函数）。
  - [ ] 删除 `skinSelectorPreload.js` 中暴露的 `selectSkin` 方法。
  - [ ] 同步清理 `test/skinSelectorIntegration.test.js` 中关于该通道的陈旧断言。
  - [ ] 文档同步与原子提交。

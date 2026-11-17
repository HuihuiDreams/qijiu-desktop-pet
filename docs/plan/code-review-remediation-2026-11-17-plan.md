# 2026-11-17 代码审查复核修复计划

依据 2026-11-17 对外部代码审查结果的逐条复核（基线 `main@727fd53`）。只列复核后确认成立、需要优先处理的条目；其余条目的复核结论见本文末尾。

约定：每个任务完成测试与文档后再进入下一项；需要 Windows 实机或 CI 才能确认的部分标记 **【Windows 待验证】** / **【CI 待验证】**。

---

## 优先修复

- [x] **Task 1：离线检查更新弹两个相同的错误框**
  - [x] `updateManager.js` 的 `handleError` 按错误对象身份去重（`lastHandledError`）。electron-updater 6.8.11 在 `checkForUpdates`（`AppUpdater.js:271-272`）和 `downloadUpdate`（`AppUpdater.js:453/469`）失败时都先 `emit('error')` 再 reject 同一个对象。
  - [x] `test/updateManager.test.js` 覆盖检查失败、下载失败各只弹一次，以及不同错误对象仍分别提示。
  - [ ] 【Windows 待验证】打包版断网点「检查更新」只出现一个错误框。
- [x] **Task 2：发布流水线构建安装包前不跑测试**
  - [x] `build-installer.yml` 的 Windows 与 macOS 作业在 `npm ci` 后、`electron-builder` 前运行 `npm test` 与 `npm run test:integration`，与 `release-preflight.yml` 对齐；E2E 与安全审计仍只在预检中运行。
  - [x] `test/buildInstallerWorkflow.test.js` 断言两个作业的步骤顺序；`docs/git-workflow.md` 同步。
  - [ ] 【CI 待验证】下次运行 `Build Installers` 时确认两个平台的测试步骤通过。
- [x] **Task 3：右键菜单关闭后指针仍在宠物上时恢复点击穿透**
  - [x] `ContextMenu.hide()` 在 `document.querySelector('.pet:hover')` 命中时发送不带 `leaseMs` 的 `setIgnoreMouseEvents(false)`（取消菜单的 10 秒租约）并保留天气交互静音，交给宠物 `mouseleave` 恢复穿透；与 `PetRenderer` 拖拽结束的 `:hover` 守卫一致。
  - [x] `test/contextMenuBehavior.test.js` 覆盖指针仍在宠物上时保持可交互；[ADR-002](../decisions/ADR-002-mouse-clickthrough-strategy.md) 补充后续更新。
  - [ ] 未处理：菜单打开期间指针停在宠物上（不在菜单上）超过 10 秒，菜单租约到期后同样会恢复穿透。需要时单独处理。
  - [ ] 【macOS / Windows 待人工验证】右键宠物打开菜单，指针不动按 ESC，再左键点宠物：应触发宠物对话，而不是点到下层应用；随后移开指针，桌面恢复可点击。
- [x] **Task 4：屏保启动早于 `interactionOverlayActive` 声明时抛 TDZ 错误**
  - [x] `src/app.js` 把 `let interactionOverlayActive` 移到 `clearInteractionOverlay` 定义之前，早于 `screensaverSystem.init()`。复核结论：异常发生在 IPC 回调内，不会中断启动，后果是屏保缺少居中、粒子层和起始位置记录，用户输入后正常结束。
  - [x] `test/interactionOverlayFlagOrder.test.js` 断言声明先于所有引用与屏保订阅。
- [x] **Task 5：`PomodoroService` 缺少行为测试**
  - [x] 新增 `test/pomodoroService.test.js`（`mock.timers` 驱动 `setInterval` 与 `Date`）：完成后 ticker 自停、恢复宠物焦点并刷新托盘各一次；重复启动只保留一个 ticker；停止后不再推送；超范围分钟数归一化后落盘；窗口销毁时跳过推送。复核结论：此前 `appLifecycle.behavior.test.js` 把整个模块 mock 掉，实际覆盖为 0。
  - [x] 变异验证：删掉 `startPomodoroTicker` 开头的 `stopPomodoroTicker()` 或完成分支里的 `stopPomodoroTicker()`，对应用例都会失败。

## 顺手修（按用户要求合并为一个提交）

- [x] `TimeSystem.deserializePet` 只接受有限数值的属性（`test/timeSystem.test.js`）。复核结论：NaN 经 JSON 序列化为 `null`，重启后会回到默认值，并非永久损坏。
- [x] `OfflineReturnSystem` 唤醒结算与睡前存档两处不等待的 `saveCurrentState()` 补 `.catch`。`app.js` 的 `onSaveBeforeQuit` 已由 preload 包裹 `try/catch`，无需改动。
- [x] `WeatherAwarenessSystem.updateLocalTimePhase` 在时钟回拨（差值为负）时不再节流。
- [x] 选肤窗口按 `dataset.skinId` 比对卡片，不再把 skinId 拼进 CSS 选择器。
- [x] 番茄钟手输时长按 1–240 夹紧；空闲态下用户改过时长后，换肤、置顶等状态推送不再覆盖输入框，会话开始后复位。
- [x] `push.sh` / `push.ps1` 改为 `git add -u`；存在未暂存的未跟踪文件时列出并停止（`test/pushScript.test.js`）。
- [x] 删除只检查开发目录 5 个文件的 `scripts/verify-installer.js`、`verify:installer` 脚本与预检步骤，同步 README、技能与 `docs/`；历史 CHANGELOG 与归档文档保留原样。
- [x] 状态、选肤、更新进度、番茄钟窗口的顶层 preload 订阅改用可选链（`test/subWindowPreloadGuards.test.js`）。
- [x] `ScreensaverController.evaluateTrigger` 在当前主窗口发来 `screensaver-ready` 之前保持 `blocked`（[ADR-044](../decisions/ADR-044-cp-screensaver-session.md)）。
- [x] `handleOfflineReturn` 统一把衰减时长夹到 `CONFIG.MAX_OFFLINE_MS`（[ADR-019](../decisions/ADR-019-handling-time-jumps-after-system-sleep.md)）。
- [ ] 【CI 待验证】下次 `Release Preflight` 确认删除 `Verify installer prerequisites` 步骤后两个平台仍通过。

## 复核后不采纳的建议

- `SpriteView` 加载失败后永久卡在错误精灵图：按原描述的状态切换路径不会发生；原修法在素材确实缺失时会每帧重试。
- `StoreManager` 并发初始化丢写：conf 16 的 `set()` 每次写前都从磁盘读取，主进程单线程同步写入，不会互相覆盖。
- 删除 `protectedAssetLoader` 的 `manifestNotFound` 负缓存：有意设计，已有测试约定，且 `SkinService` 有 `src/assets` 回退。
- 下载进度节流：`builder-util-runtime` 已把进度事件限制为每秒一次。
- `test:e2e:ci` 加入 `breakReminder` / `contextMenu` / `skinSelector`：这三个 spec 是按"无原生托盘弹窗/焦点抢占依赖"原则有意排除的，需单独评估 CI 稳定性。

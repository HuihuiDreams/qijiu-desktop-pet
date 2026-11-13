# 2026-11 审核报告复核与优先级重排

本文档按当前代码重新核实一份外部审核报告，并给出修正后的优先级。核对基线为 `main@ea5e163`，日期 2026-11-13。行号以该提交为准。

## 复核结论

- 原报告大部分发现属实，行号基本准确。
- 不成立的条目有 4 条，见[第 5 节](#5-已驳回或不成立)。
- 原"High"一档被高估。原报告第 2、3 组里的 IPC 监听时序、窗口销毁守卫、覆盖层定时器，多数有兜底机制或影响很小。
- 原报告漏判了一条高频问题：每次拖拽结束都会恢复鼠标穿透（H2）。现升为 P1。
- 标注"需实测"的条目只能靠静态阅读推断，修复前要先在对应平台复现。

## 修复进度

逐项进度、每项的取舍与需要在 Windows 上完成的验证步骤见[修复计划](plan/audit-verification-remediation-plan.md)。下文各节保留复核时的原始分析，行号仍以 `main@ea5e163` 为准。

| 状态 | 条目 |
| --- | --- |
| 已修复，macOS 上已验证 | H1、M1、M2、M3、M4、M5、M8、L1、L2、L5、L6、L7、L9、L11、L13、L14、L15、L16 |
| 已修复，Windows 上已验证 | H3（混合 DPI 物理坐标采样与单次 DIP 转换已修复并实测）、L10（`UpdateProgressWindow` 检查中动画逐帧截图目测通过）、L12（`push.ps1` 解析与退出码测试通过）、L17（Windows smoke 打包 `app.asar` 内容核验通过）、L18（Windows 打包版与开发版调试开关对照实测通过） |
| 已修复，仍需 Windows 或 CI 验证 | H2（真机手动确认）、M6（Windows 已接入集成测试，待 GitHub Actions 实跑）、M7（Windows runner） |
| 部分修复 | L4：已移除无效的 `appRoot`；`manifestNotFound` 负缓存按既有测试约定保留 |
| 评估后不修复 | L3、L8，理由见修复计划 |

## 优先级定义

| 级别 | 含义 |
| --- | --- |
| P1 | 会造成用户数据丢失、高频交互错误，或核心平台功能的坐标口径错误。优先修复。 |
| P2 | 低频的功能缺陷、缺少用户反馈、生命周期遗漏、CI 与发布流程风险。按迭代排期。 |
| P3 | 有兜底的边界缺陷、规范一致性问题、死代码、文档与工具链小问题。顺手修复。 |

---

## 1. P1：优先修复

### H1. 启动阶段已保存的皮肤可能被写回 `default`

- **位置**：`src/main/services/SkinService.js#L197`、`src/main/services/StorageIpc.js#L29-L39`、`src/app.js#L443-L449`、`src/systems/OfflineReturnSystem.js#L106`、`#L178-L190`
- **机制**：
  - 主进程 `confirmedSkinId` 初始值写死为 `'default'`。启动时没有任何地方从 store 读取 `petState.skinId` 来同步它。`setCurrentSkinId` 已导出，但没有调用方。
  - 渲染进程在 L445 调用 `applyLoadedState(savedState)`。离线超过 `DECAY_INTERVAL`（5 分钟）时，它会进入 `handleOfflineReturn`，再调用 `saveCurrentState()`。
  - 此时 L449 的 `applySkinById` 还没有执行。`StorageIpc` 的 `save-data` 会用 `getConfirmedSkinId()` 的返回值 `'default'` 覆盖 `skinId` 后落盘。渲染进程的 `SkinManager` 这时也还是 `'default'`。
  - L449 以 `persist: false` 调用后，主进程拿到了正确的皮肤，但磁盘上仍是 `'default'`。要等下一次保存才会纠正，例如 60 秒自动保存、挂起、换肤或退出保存。
- **影响**：在这段窗口期内崩溃、被强制结束或断电，用户选择的皮肤会永久丢失。触发需要同时满足两个条件：离线超过 5 分钟，并且在下一次保存前退出。宠物隐藏时游戏循环不运行，窗口期会更长。
- **建议**：
  - 在 `AppLifecycle.initSubWindowsAndIpc()` 初始化 `StorageIpc` 之前，从 store 读取 `petState.skinId`，用可用皮肤列表校验后调用 `SkinService.setCurrentSkinId()`。校验失败时回退到 `'default'`。
  - 这样 `StorageIpc` 的覆盖逻辑会写入正确的值，渲染进程不需要改动。
  - 补充回归测试：store 里保存了非默认皮肤，并且启动时先发生一次 `save-data`，落盘的 `skinId` 不变。

### H2. 拖拽结束后无条件恢复鼠标穿透，下一次点击会落到下层应用

- **位置**：`src/pet/PetRenderer.js#L181-L184`（`restoreMousePassthrough`）、`#L201-L220`（`finishDrag`）
- **机制**：
  - `finishDrag` 在 100ms 后调用 `restoreMousePassthrough()`，唯一的判断条件是 `!pet.isDragging`。
  - `restoreMousePassthrough` 本身不检查指针是否还在宠物上，也不检查菜单是否打开。
  - 拖拽时宠物跟随指针移动，所以松手时指针几乎总在宠物上。窗口变成穿透之后，指针没有离开元素，`mouseenter` 不会再次触发，交互状态就恢复不了。
  - 作为对比，`mouseleave`（L168-L175）会同时检查拖拽状态和菜单状态。
- **影响**：拖拽之后紧接着单击或右键宠物，事件会穿透到宠物下方的其他应用窗口，可能误触发下层应用的操作。这在常见操作路径上，触发频率高。右键菜单场景会被 `ContextMenu` 的租约机制部分修复。
- **需实测**：在 Windows 和 macOS 上各拖拽一次宠物，原地不动再单击，确认点击是否穿透。目前 `test/` 下没有覆盖 `finishDrag` 的测试。
- **建议**：恢复穿透前判断指针是否仍在宠物元素上（例如 `el.matches?.(':hover')`），以及右键菜单是否打开。只要任一条件成立，就保持可交互，交给后续的 `mouseleave` 恢复穿透。

### H3. Windows 前台窗口坐标口径不确定，两个消费方处理方式不一致

- **位置**：`activeWindowProvider.js#L111`、`#L143`、`#L188`，`activeWindowAwareness.js#L4-L18`，`displayBounds.js#L151-L191`，`src/main/services/WindowAwarenessService.js#L87-L96`，`src/main/services/PresentationGuard.js#L85-L92`
- **机制**：
  - 前台窗口的 bounds 来自一个常驻 `powershell.exe` 子进程，通过 P/Invoke 调用 `GetWindowRect` 获取。脚本没有设置 DPI awareness，仓库里也没有任何 DPI awareness 相关调用。
  - 所以返回值是物理像素，还是被系统虚拟化过的逻辑坐标，取决于 `powershell.exe` 自身的清单设置。它不受 Electron 进程 DPI 设置的影响。
  - 同一份 payload 有两个消费方：
    - `PresentationGuard` 认为它是物理像素，在 win32 上先做 `screenToDipRect` 再比较。
    - `getActiveWindowPlatformRelativeToBounds` 不做任何转换，直接和 Electron DIP 口径的 `display.bounds`、`workArea`、`mainWindow.getBounds()` 求交集再相减。
  - 两者之中至少有一个是错的。
- **影响**：Windows 在非 100% 缩放或混合 DPI 多屏下，"站在窗口顶边"的平台可能偏移、尺寸失真或被裁掉；或者全屏、演示守卫判定出错。这个功能只在 Windows 上启用：macOS 不支持窗口边缘行走，采样间隔为 30 秒。
- **需实测**：先在 Windows 的 125%、150% 单屏和混合 DPI 多屏环境下，输出原始 bounds，与 `screen.getAllDisplays()` 对比，确认 PowerShell 返回值的实际口径。
- **建议**：
  - 不要直接套用原报告的"`screenToDipRect` 即可"。如果 PowerShell 是 DPI-unaware 的，这样做会把坐标转换两次。
  - 先在脚本里调用 `SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`，把坐标统一为物理像素。
  - 然后在主进程收到 payload 时只转换一次 DIP，两个消费方共用转换后的结果，并删除 `PresentationGuard` 里单独的转换。

---

## 2. P2：按迭代排期

### M1. 首个 `screen-info` 丢失后无补偿

- **位置**：`src/main/windows/PetWindow.js#L267-L274`、`src/app.js#L18`、`#L146`、`preload.js#L3-L6`
- **机制**：`did-finish-load` 时主进程立即发送 `screen-info`。渲染进程在 `await getLocale()` 之后才注册 `onScreenInfo`。preload 的 `subscribeIpc` 不缓冲事件。仓库里没有 `get-screen-info` 拉取接口，只有显示器变化时才会重发。
- **影响**：如果首个事件丢失，`StageGeometry` 会一直使用 `window.innerWidth/innerHeight`，没有 `walkAreas` 和 `taskbarPlatforms`，直到显示器配置发生变化。窗口期只有一次 IPC 往返，触发概率不高，但一旦触发会持续存在。
- **建议**：参照 `getPetVisibilityState()` 增加一个拉取接口；或者把 `onScreenInfo` 的注册提前到第一个 `await` 之前，先缓存最新值，等 `StageGeometry` 创建后再应用。
- **原报告修正**：其他事件已有兜底，不需要按原报告的建议"全部提前注册"：
  - 可见性和暂停状态：L110 主动拉取。
  - 前台窗口信息：`WindowAwarenessSystem.start()` 主动拉取，主进程每 2 秒重发。
  - `switch-skin`：L449 会主动应用。
  - `did-finish-load` 不发送 `toggle-pause`。
  - `onSaveBeforeQuit` 注册较晚，但 `FinalSaveService` 有 2.5 秒超时，最坏只是少保存一次。可以随 M1 一起把它提前。

### M2. 更新包完整性校验失败时没有提示，也没有日志

- **位置**：`updateManager.js#L222-L241`、`#L463-L473`
- **机制**：校验失败只设置 `error: 'integrity-check-failed'` 并关闭进度窗口。`getUpdateMenuState` 不显示 `state.error`。`verifyDownloadedPackageIntegrity` 的 `catch` 吞掉异常且不记录日志。
- **影响**：拒绝安装是正确的，但用户看到下载完成后什么都没发生，排查时也没有日志可查。
- **建议**：复用 `handleError` 的日志和错误弹窗路径，补充 i18n 文案，并在 `catch` 里记录错误。

### M3. 更新进度窗口加载期间的进度被初始载荷覆盖

- **位置**：`src/main/windows/UpdateProgressWindow.js#L33`、`#L42-L44`、`#L49-L51`、`#L61-L74`
- **机制**：
  - `did-finish-load` 只发送闭包里的初始 `normalizedPayload`。加载期间 `setUpdateProgress` 直接发送的消息会因为页面还没注册监听而丢失，加载完成后又被旧载荷覆盖。
  - `close()` 之后立即把引用置为 `null`。如果在旧窗口的 `closed` 事件触发前创建了新窗口，旧窗口的 `closed` 回调会把新窗口的引用也置空。
- **影响**：进度条可能短暂回退到"检查中"或 0%。引用被误清空的情况目前因为中间有模态对话框而很难触发。
- **建议**：在模块里维护 `latestPayload`，每次发送时更新它，`did-finish-load` 时发送最新值。`closed` 回调只在引用仍指向自己时才清空。

### M4. 主窗口关闭时未关闭体型调节窗口

- **位置**：`src/main/windows/PetWindow.js#L45-L53`、`#L287-L319`
- **机制**：`closed` 回调关闭了状态、番茄钟、城市设置和换肤窗口，但没有关闭 `petScaleWindow` 和 `updateProgressWindow`。`petScaleWindow` 没有设置 `parent`，会独立存活。
- **影响**：在不退出应用的情况下关闭主窗口时，体型调节窗口会残留，`window-all-closed` 也不会触发。正常退出时 `app.quit()` 会关闭所有窗口，影响有限。
- **建议**：在 `closed` 回调里补上这两个窗口。`getPetSubWindows()` 不包含 `updateProgressWindow` 可能是有意为之：这个列表用于置顶和 RDP 抑制，不需要修改。

### M5. 互动覆盖层出现重复 ID

- **位置**：`src/pet/PetRenderer.js#L350-L356`（`showOverlay`）、`#L384-L385`（`updateOverlay`）、`#L552-L564`（`hideOverlay`）、`src/systems/WeatherParticleLayer.js#L270`
- **机制**：`showOverlay` 创建新节点前不移除旧节点。400ms 渐隐期间，两个 `#interaction-overlay` 同时存在，`getElementById` 返回 DOM 顺序在前的旧节点。
- **影响**：渐隐期间，`updateOverlay` 修改的是旧节点的尺寸；再次调用 `hideOverlay` 会拿到旧节点，新覆盖层残留在屏幕上；天气层读取的透明度也来自旧节点。
- **建议**：`showOverlay` 开头立即移除已有的同 ID 节点，或者在 `hideOverlay` 里先去掉旧节点的 `id` 再开始渐隐。

### M6. Release Preflight 权限过宽，CI 覆盖不足

- **位置**：`.github/workflows/release-preflight.yml#L10-L26`、`#L59-L83`、`package.json` 的 `scripts`
- **机制**：
  - 顶层 `permissions: contents: write` 也作用于 `pull_request` 触发。同仓库分支提交的 PR 会得到可写的 token，同时执行 `npm ci`、`npm test` 和构建脚本。fork PR 的 token 始终只读。
  - 手动触发时，工作流会自动提交并 `git push` 版本号变更。
  - 现有工作流都没有运行 `test:integration`、`test:e2e` 或 `qa:electron:smoke`。`check:adrs` 在 `package.json` 里根本不存在。
- **建议**：顶层权限降为 `contents: read`，只给需要推送的那一步所在的 job 授予 `contents: write`，或者把版本 bump 拆成独立的 `workflow_dispatch` job。按耗时评估是否在 PR 上接入 `test:integration`。

### M7. Windows 构建创建 draft release 缺少竞态兜底

- **位置**：`.github/workflows/build-installer.yml#L167-L170`（Windows）、`#L356-L359`（macOS）
- **机制**：两个 job 都只依赖 `create-release-tag`，在 tag push 时并行运行。macOS 用 `|| gh release view` 兜底，Windows 没有。
- **影响**：pwsh 默认不会因为原生命令失败而中断，后面的 `upload --clobber` 成功后这一步通常能通过，所以实际失败概率低。但两个平台的行为不一致，日志里会出现误导性的错误。
- **建议**：参照 macOS，在 `create` 失败后再执行一次 `view`，两者都失败时抛错。

### M8. macOS 手动更新弹窗硬编码中文

- **位置**：`updateManager.js#L392`
- **机制**：``manualMsg = `当前版本: ${currentVersion}\n最新版本: ${latestVersion}\n\n${manualMsg}` ``。标题、正文和按钮都走了 i18n，只有这两行没有。版本号获取失败时会显示字面值 `null`。
- **影响**：英文和日文用户会看到中文标签。
- **建议**：新增带 `{current}`、`{latest}` 占位符的 i18n key，三种语言同步补齐，版本号缺失时省略对应行。

---

## 3. P3：顺手修复

| ID | 位置 | 问题 | 复核说明 |
| --- | --- | --- | --- |
| L1 | `src/main/services/PetVisibilityService.js#L64`、`#L77` | 发送 `toggle-pause` 前只判断引用是否存在，没有检查 `isDestroyed()` | 属实。主窗口 `closed` 时会立即置空引用，触发窗口极短。同文件 L50、L133 已有正确写法，可照抄。 |
| L2 | `src/main/services/SkinService.js#L99-L109` | 取消或被取代时返回 `LOAD_FAILED`，不是 `STALE_REQUEST` | 属实。原因会放在 message 里，唯一调用方 `skinSelectorWindow.js#L77` 只判断 `success`，属于接口语义问题。 |
| L3 | `src/main/services/SkinService.js#L114-L120` | 首次安装时 `petState` 不存在，主进程不写盘 | 有兜底：随后 `switch-skin` 带 `persist: true`，渲染进程会保存完整的 `petState`。只有渲染进程失效时才会丢失。 |
| L4 | `src/main/services/SkinService.js#L265`、`#L311`、`#L418`；`protectedAssetLoader.js#L53-L61` | `appRoot: __dirname` 指向不存在的目录；`manifestNotFound` 置位后不再重置 | 加载器会回退到自身目录下的 `protected-assets`，开发和打包环境都能找到，所以是无效配置。粘滞缓存只影响开发时"启动后才生成 manifest"的情况。 |
| L5 | `src/main/TrayManager.js#L160`、`#L176` | `idleResetMinutes: 5` 写死 | 仓库里没有任何 UI 或 IPC 能修改这个值，用户感知不到。可改为保留原有设置值。 |
| L6 | `breakReminderService.js#L106-L110`、`#L128-L130` | `updateSettings` 不清理 `deferTimer`；`rawElapsed` 未做 `Math.max(0, …)` | 回调里会再检查 `enabled`，最多推迟 60 秒。时钟回拨只会推迟提醒，空闲或锁屏时会自动归零。 |
| L7 | `weatherSyncService.js#L26-L29`、`#L34-L35`、`#L113`、`#L139` | 空的 `schemaVersion` 分支；lat/lon 未用 `Number.isFinite`；响应没有大小上限；https 回退路径缺少 `res.on('error')` | 存储经过 JSON 序列化，`Infinity` 会变成 `null`；地理编码结果已校验。主要问题是不符合 AGENTS.md 中 `firstFiniteNumber` 的规范。 |
| L8 | `src/ui/ContextMenu.js#L287-L300` | `hide()` 时菜单还在淡出，就立即恢复鼠标穿透 | 原报告"`.hidden` 截断过渡"的说法不成立（见第 5 节），这里是剩下的小问题。 |
| L9 | `src/pomodoro.css#L615-L628` | 提示框使用 `--font-display` 配 11px 字号 | 属实。低 DPI 屏上可读性差，建议改用正文字体。 |
| L10 | `src/update-progress.css#L52-L55`、`#L68` | `@keyframes sweep` 动画修改的是 `left` | 属实。这个窗口很小且显示时间短，性能影响可以忽略，可改为 `transform: translateX()`。 |
| L11 | `scripts/protect-assets.js#L81-L109` | 重新加密时不清理残留的 `.dat` | 属实。孤儿文件不在 manifest 中，运行时不会加载，但会被打包。 |
| L12 | `push.sh#L15`、`#L24`、`#L68`、`#L84`、`#L89-L99` | `git add .`；固定推送 `origin main`；本地执行 `sync:cp --verify` 会跑 `npm ci`；L84 的 `exit $?` 返回的是条件判断的状态 | 属实，均为本地工具链问题。 |
| L13 | `scripts/check_adrs.js#L51-L53` | 发现缺失字段时仍以退出码 0 结束；`package.json` 中没有 `check:adrs` 脚本 | 已实测：报告 ADR-049 缺少 `Alternatives Considered`，退出码为 0。 |
| L14 | `docs/structure.md#L7`、`docs/decisions/ADR-031-break-reminder.md#L63`、`CHANGELOG.md#L150` | 指向 `docs/code-review-recheck-2026-10-06.md` 的链接失效 | 文件实际位于 `docs/archive/`。`docs/archive/code-review-fix-plan-2026-10-06.md#L4` 中的链接有效。 |
| L15 | `src/pet/PetRenderer.js#L295-L298` | `_renderedDirection` 判断块只更新缓存字段，注释说会更新 class | 无效逻辑，可删除。 |
| L16 | `src/main/windows/SkinSelectorWindow.js#L68-L74` | `isValidSkinSelectorSender` 没有调用方，也没有导出 | 不构成安全缺口：`SkinService.isSkinSelectorRequest` 已经做了同样的 sender 校验。可删除。 |
| L17 | `src/assets/iconTemplate.png`、`iconTemplate@2x.png` | 运行时没有引用，但仍被打包进 asar | 托盘图标由 `TrayManager.js#L317-L328` 在代码中生成。可从 `build.files` 中排除，同时保留测试和 CP 白名单。 |
| L18 | `src/debug.js#L8`、`src/app.js#L626-L640` | 调试工具只靠路径中是否有 `/app.asar/` 来门控；`window.__DEBUG_*` 在生产环境也会挂载 | 默认 `asar: true`，打包后不会启用。CSP `script-src 'self'` 限制了暴露面。可以改用主进程下发的 `isPackaged` 标志。 |

---

## 4. 原报告条目对照

| 原报告条目 | 原级别 | 复核后 |
| --- | --- | --- |
| Windows 混合 DPI 坐标未转换为 DIP | High | P1 → H3（前提待实测，修复方案需调整） |
| 启动阶段 skinId 被覆盖 | High | P1 → H1（有触发条件，可能造成永久丢失） |
| 主渲染进程 IPC 监听空窗 | High | P2 → M1（只有 `screen-info` 没有兜底） |
| `PetVisibilityService` 缺少 `isDestroyed` | High | P3 → L1 |
| `finishDrag` 恢复穿透 | High | P1 → H2（高频交互问题） |
| `hideOverlay` 误删新覆盖层 | High | 驳回；相关的重复 ID 问题为 P2 → M5 |
| 皮肤状态机细节（3 项） | Medium | P3 → L2、L3、L4 |
| 子窗口关闭清理遗漏 | Medium | P2 → M4 |
| 更新进度窗口时序 | Medium | P2 → M3 |
| macOS 更新弹窗硬编码中文 | Medium | P2 → M8 |
| 完整性校验失败无反馈 | Medium | P2 → M2 |
| 久坐提醒与天气同步边界缺陷 | Medium | P3 → L5、L6、L7 |
| ContextMenu 截断退场过渡 | Medium | 驳回；剩余小问题为 P3 → L8 |
| 番茄钟提示字号 / `sweep` 动画 | Medium | P3 → L9、L10 |
| Windows draft release 竞态 | Medium | P2 → M7 |
| Release Preflight 权限 / CI 覆盖 | Medium | P2 → M6 |
| `.DS_Store` 被打包 | Medium | 驳回 |
| `protect-assets` 残留 / `push.sh` | Medium | P3 → L11、L12 |
| ADR 校验与悬空引用 | Low | P3 → L13、L14（4 处引用中有 1 处说错） |
| 未使用的代码与资源 | Low | P3 → L15–L18 |

## 5. 已驳回或不成立

1. **`hideOverlay` 的定时器误删新覆盖层**：`PetRenderer.js#L555` 在设置定时器前已把旧节点保存到局部变量，L559 删除的是旧节点，不会删到新节点。真实存在的问题是重复 ID，见 M5。
2. **`ContextMenu.hide()` 加 `.hidden` 截断 `allow-discrete` 退场过渡**：菜单是 `popover="manual"`。关闭 popover 时浏览器默认样式本来就会设为 `display: none`，`.hidden` 不会改变样式计算的结果。`transition-property` 已包含 `display` 和 `overlay`，退场过渡照常播放。这是根据规范推断的结论，未在 Chromium 中实测。
3. **`.DS_Store` 被打包**：electron-builder 26.18.0 默认排除 `**/.DS_Store`。已检查 `dist/mac/七九爱宠.app/Contents/Resources/app.asar`，没有该文件。
4. **`docs/archive/code-review-fix-plan-2026-10-06.md#L4` 链接失效**：它使用相对路径 `./code-review-recheck-2026-10-06.md`，解析到 `docs/archive/`，目标文件存在。

## 6. 建议修复顺序

1. **H1**：改动小，能消除数据丢失风险，可附带回归测试。
2. **H2**：先实测确认，再修复，并补充 fake-DOM 单元测试。
3. **H3**：先在 Windows 上采集坐标数据，确认口径后再改代码。
4. **M1–M5**：运行时问题，各自独立提交。
5. **M6–M8**：CI、发布与 i18n。
6. **P3**：可以按文件合并处理，例如把 L15–L17 的死代码清理合成一次提交。

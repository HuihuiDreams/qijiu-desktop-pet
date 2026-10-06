# 全仓库代码审查复核报告

审查日期：2026-10-06（Asia/Tokyo）  
代码基线：`48fc9495467ef72d5240c3f4041c9e79d8c7438b`，版本 `0.10.5`  
执行环境：Windows，Node.js `v24.15.0`，Electron `42.2.0`

## 结论

发现 **7 项需要修复的问题：P1 级 1 项，P2 级 6 项**。主要集中在原生 API 接线、跨进程状态同步和异步请求竞态。现有自动化测试全部通过，但没有覆盖下述完整业务链路，不能据此判断这些行为正确。

本次只提交审查文档，不修改业务代码。开始审查时，`CHANGELOG.md`、`docs/structure.md` 和原有同日审查报告已有未提交修改；本报告独立保存，不覆盖原报告，也不沿用其评分。下列问题均为待修复状态。

严重度定义：P1 为应优先修复的主要功能故障；P2 为特定操作、时序或平台下可触发的功能错误。验证方式分为真实 Electron 运行、使用实际模块的受控复现、静态调用链分析。macOS 未进行真机验证。

| 编号 | 严重度 | 问题 | 验证方式 |
| --- | --- | --- | --- |
| R1 | P1 | Windows 坐标转换漏传参数，屏保与提醒守卫异常 | 真实 Electron + 类型声明 + 官方文档 |
| R2 | P2 | macOS 会议检测把普通文件也计入 UDP 数量 | 官方命令语义 + 实际模块受控复现 |
| R3 | P2 | 隐藏再显示桌宠会丢失渲染端暂停状态 | 真实 Electron |
| R4 | P2 | 皮肤加载中取消预览，回滚请求被直接丢弃 | 实际模块受控复现 + IPC 调用链 |
| R5 | P2 | 未确认的皮肤预览提前写入持久化存档 | 真实 Electron |
| R6 | P2 | 城市查询完成后覆盖查询期间的新天气开关设置 | 实际控制器受控复现 |
| R7 | P2 | 托盘切换语言时丢失参数，选肤卡片与实际预览不一致 | 静态调用链分析 |

## 1. 审查范围与方法

基线含 513 个已跟踪文件、223 个 JavaScript 文件，其中运行入口、配置和应用模块共 83 个 JavaScript 文件；`test/` 顶层有 111 个 `.test.js` 文件。

| 范围 | 检查重点与深度 |
| --- | --- |
| `main.js`、`src/main/` | 逐段检查启动接线、窗口生命周期、IPC 鉴权、存储、可见性、屏保、天气、番茄钟、提醒与退出保存 |
| 根目录运行模块及 preload | 检查活动窗口采样、会议检测、显示器几何、受保护资源协议、更新完整性与跨窗口权限 |
| `src/app.js`、`src/systems/`、`src/pet/` | 跟踪游戏循环、移动与互动、存档恢复、皮肤加载、屏保及主进程通知之间的状态变化 |
| `src/ui/`、子窗口 JS、HTML/CSS、语言与配置数据 | 检查交互事件、DOM 更新、资源加载、CSP、缩放和语言同步；样式与长文本数据结合专项测试抽查 |
| `test/` | 运行全部 Node 测试与现有 E2E；重点阅读相关行为测试、源码断言与 mock 边界 |
| `.github/workflows/`、`scripts/`、`build/`、`push.*`、`tools/` | 检查发布、资产保护、包内容校验、签名路径和测试工具；辅助测量/素材处理脚本以静态抽查为主 |
| `docs/`、ADR 与三语说明 | 核对相关行为约定；不把历史报告的结论当作本次验证证据 |

全部已跟踪 JavaScript 文件均执行语法检查。源代码审查覆盖上述各层，重点深读跨模块边界；这不等于所有历史文档、二进制资产或第三方依赖都经过逐行审计。未执行安装器构建、发布、真实更新安装、macOS 真机测试、多屏热插拔或长时间性能测量。

## 2. 具体问题

### R1 · P1：`screenToDipRect` 接线遗漏首个参数

**位置：** [AppLifecycle.js](../src/main/AppLifecycle.js) 第 96 行；[BreakReminderController.js](../src/main/services/BreakReminderController.js) 第 51 行；异常处理见 [PresentationGuard.js](../src/main/services/PresentationGuard.js) 第 83–100 行。

两处实际接线均为 `(rect) => screen.screenToDipRect(rect)`。Electron 要求 `screen.screenToDipRect(window, rect)`；如果需要按矩形所在显示器换算，第一个参数应传 `null`。本地 `node_modules/electron/electron.d.ts:11930` 与 [Electron 官方 screen 文档](https://github.com/electron/electron/blob/main/docs/api/screen.md) 一致。

**触发与影响：** Windows 开启窗口感知，活动窗口非最大化、未被前面的 `isFullScreen` 分支拒绝且有 `bounds` 时，守卫调用该转换。真实 Electron 抛出异常后，屏保模式返回 `display-query-failed` 并拒绝触发；久坐提醒模式则在异常分支放行，跳过这条演示窗口几何保护。已在前置分支判定为全屏的窗口仍会被拒绝，不应扩大为“所有全屏保护失效”。

**实际验证：** 在隔离的 Electron 主进程中，对 `{x:100,y:100,width:500,height:400}` 执行单参数调用得到 `Insufficient number of arguments.`；传入 `(null, rect)` 正常返回 `{x:67,y:67,width:334,height:268}`。返回坐标取决于本机缩放比例，异常与参数个数有关。

**测试缺口与建议：** 现有守卫测试注入的是接受一个矩形的普通函数，没有验证该函数到原生 API 的接线。修正两处适配器，并增加调用真实 API 或严格检查两个参数的接线测试。手工验证普通窗口可以触发屏保，演示/全屏窗口仍按约定阻止打扰。

### R2 · P2：macOS `lsof` 选择条件缺少交集约束

**位置：** [meetingDetector.js](../meetingDetector.js) 第 316–329 行，阈值判定在第 368 行。

代码执行 `lsof -nP -i UDP -p <pid> -Fn`，然后将全部以 `n` 开头的字段计为该会议进程的 UDP 端点。`lsof` 不同选择条件默认取并集；缺少 `-a` 时会包含目标进程的普通文件及其他进程的 UDP 文件。[lsof 官方选项说明](https://lsof.readthedocs.io/en/latest/options/) 明确说明 `-a` 用于将条件组合为交集。

**触发与影响：** 用户只启动 Zoom、Teams 等程序而未通话，只要输出含足够多普通文件，便可能达到默认 5 个端点的会议阈值，继而错误隐藏桌宠。

**受控验证：** 使用实际 `collectMeetingUdpSnapshot()`，注入一个目标 PID 和含应用目录、可执行文件、两个 `/dev/null`、日志文件的五条 `n` 记录，不提供 UDP 记录。结果为 `isActive: true`、`udpCount: 5`。这是解析路径的受控验证；本机为 Windows，未执行 macOS `lsof`。

**测试缺口与建议：** 增加 `-a`，让选择范围限定为目标 PID 的 UDP 文件；测试应覆盖普通文件不能使会议计数增加，必要时校验 PID/协议字段。macOS 手工验证“仅打开客户端”“进入通话”“其他应用产生 UDP 流量”“退出通话”四种状态。
 
**修复记录（2026-10-06）：** 已修复。在 `meetingDetector.js` 的 `collectMacProcessInfo` 中为 `lsof` 增加了 `-a` 参数（`lsof -a -nP -i UDP -p <pid> -Fn`）。在 `test/meetingDetector.test.js` 中新增区分并集与交集的命令 fake 测试，验证仅目标 PID 的 UDP 参与计数，普通文件与其他进程 UDP 被排除。通过 `node --test test/meetingDetector.test.js test/meetingDetectorController.behavior.test.js` 与全量测试。macOS 手工四状态验证待实际通话环境补充执行。

### R3 · P2：显示通知无条件解除渲染端暂停

**位置：** [src/app.js](../src/app.js) 第 309–317 行，特别是 `isPaused = !visible`；主进程状态见 [PetVisibilityService.js](../src/main/services/PetVisibilityService.js) 第 69–89 行。

主进程分别维护隐藏来源和用户暂停状态，但 renderer 收到显示通知时直接把 `isPaused` 改成 `false`。主进程的 `getIsPaused()` 仍可能为 `true`，托盘与实际移动状态因此分离。

**复现：** 先暂停走动，再隐藏并显示桌宠。暂停后进入番茄钟、随后结束番茄钟也有同样的状态覆盖路径。

**实际验证：** 隔离 Electron 中依次调用真实服务的 `setPaused(true)`、`hidePetManually()`、`showPetManually()`。主进程仍报告暂停；将宠物设为 idle、`idleTimer=10000` 后，约 250ms 后计时已降至 `9733.3`，表明 renderer 又在执行移动系统更新。

**测试缺口与建议：** 当前可见性行为测试只验证主进程状态和消息，未验证 renderer 消费结果。将“用户暂停”与“隐藏导致的有效暂停”分开计算，或下发完整有效状态；增加跨进程测试，验证手动显示、会议结束、番茄钟结束均保留原暂停选择。
 
**修复记录（2026-10-06）：** 已修复。在 `src/app.js` 中将用户暂停意图（`isUserPaused`）与渲染端有效暂停（`isPaused = !isVisible || isUserPaused`）解耦，并在首帧 `getPetVisibilityState()`、`onTogglePause` 及 `onTogglePetVisibility` 中统一维护；主进程 `PetVisibilityService.js` 的 `getPetVisibilityState()` 返回值补齐 `isPaused` 字段并在 `enterPomodoroPetFocus` 中先置暂停再发可见性通知。新增 `test/petVisibilityRendererIntegration.test.js`，验证手动隐藏/显示、会议隐藏/结束、番茄钟专注/恢复三种生命周期在暂停状态下均不会错误唤醒 `MovementSystem`，未暂停时恢复正常移动。通过 `node --test test/petVisibilityRendererIntegration.test.js test/petVisibilityService.behavior.test.js` 与全量测试。

### R4 · P2：皮肤加载中取消预览会丢失回滚

**位置：** [SkinSwitchController.js](../src/systems/SkinSwitchController.js) 第 49–63 行；[SkinService.js](../src/main/services/SkinService.js) 第 73–85、251–258、274–280 行。

`applySkinById()` 在一次加载未完成时直接忽略后续切换。主进程预览处理器只发送 `switch-skin` 就返回成功，没有等待 renderer 完成资源加载。因此选择器解除按钮锁定后，用户可以在实际图片仍加载时取消。主进程发出的“恢复原皮肤”消息随即被这条并发门禁丢弃；旧预览完成后又回写主进程并保存。

**受控验证：** 使用实际控制器，令 `applySkin('birds')` 的 Promise 暂不完成，随后请求 `applySkinById('default')`，再完成第一条加载。最终结果为：

```json
{"current":"birds","persisted":["birds"],"reports":["birds"]}
```

预期取消后的最终皮肤应为 `default`。

**测试缺口与建议：** `test/skinSwitchController.test.js` 当前甚至明确断言并发调用被忽略，但业务上的取消不能被忽略。保留最后请求并在当前加载结束后执行，或使用操作编号实现明确的取消/替换语义；补充“慢加载→取消”“连续预览→取消”以及存档最终值测试。

### R5 · P2：预览皮肤在确认前已经持久化

**位置：** [SkinService.js](../src/main/services/SkinService.js) 第 73–101、251–258 行；[src/app.js](../src/app.js) 第 319–321 行；[SkinSwitchController.js](../src/systems/SkinSwitchController.js) 第 52、62–63 行。

预览与正式切换共用 `selectSkin()`，通知中只有 `skinId`，没有预览语义。renderer 因此使用默认 `persist=true`，把预览结果写入 `petState`。这与仓库规定的“预览不提交，确认后提交”不一致。

**实际验证：** 隔离 Electron 中从默认皮肤预览 `birds`，不点击确认，等待资源加载结束。renderer 当前皮肤与主进程真实 `electron-store` 中的 `petState.skinId` 都已是 `birds`。

**影响：** 正常取消且回滚成功时可以再次覆盖为原值，但确认前异常退出会留下未确认的选择；R4 的竞态也会使错误存档保留下来。

**建议：** 区分已确认皮肤和临时预览，预览消息显式携带其语义；确认成功才提交皮肤选择。仅在预览时设置 `persist:false` 还不够，还要避免每分钟自动保存及退出保存把临时皮肤写入正式存档。验证预览期间存档不变、确认后改变、取消及关闭窗口后恢复。

### R6 · P2：异步城市查询覆盖较新的天气开关状态

**位置：** [WeatherSyncController.js](../src/main/services/WeatherSyncController.js) 第 43–67 行；对照同文件第 177–182 行已有的更新编号保护。

`set-city-name` 在地理编码开始前捕获 `currentStored`，查询完成后用旧 `currentStored.enabled` 恢复开关并覆盖持久化设置。它没有加入 `weatherSyncSettingsUpdateId` 的版本判定。

**复现：** 天气同步开启时提交新城市，查询尚未完成就在托盘关闭天气同步。旧查询随后成功，重新将 `enabled` 写为 `true` 并启动同步。关闭城市窗口后重新发起查询也可能使较早请求覆盖较晚请求。

**受控验证：** 在 VM 中执行实际控制器，注入延迟完成的地理编码、内存存储和空定时器。先关闭同步，读取为 `false`；随后完成旧城市请求，读取变成 `true`，城市为旧请求的 `Osaka`。未向外部天气服务发请求。

**建议：** 城市更新和托盘更新共用版本/请求仲裁；完成时合并最新开关值，丢弃过时城市结果。测试同时覆盖关闭开关、重新打开窗口查询不同城市以及响应逆序完成。

### R7 · P2：托盘语言切换丢掉选肤状态保留选项

**位置：** [AppLifecycle.js](../src/main/AppLifecycle.js) 第 215 行；[TrayManager.js](../src/main/TrayManager.js) 第 72 行；[src/skinSelectorWindow.js](../src/skinSelectorWindow.js) 第 73–90 行。

托盘语言回调传入 `sendSkinSelectorData({ resetSelection: false })`，但组合根注入的是无参数包装 `() => skinSelectorWindowModule.sendSkinSelectorData()`。选项在此被丢弃。窗口模块使用默认 `{ isInitialLoad: false }` 发送数据，renderer 的 `resetSelection` 随后回退为 `true`，把选中卡片重置为原已确认皮肤。

**触发与影响：** 打开选肤器并预览另一个皮肤，再从托盘切换语言。宠物仍显示新预览，但选中卡片回到原皮肤；此时确认提交的却是主进程当前新皮肤，界面表达与结果不符。此项为静态调用链结论，未计作真机交互复现。

**建议：** 包装函数透传参数，并补充通过真实 `AppLifecycle → TrayManager → SkinSelectorWindow` 接线的测试。现有测试仅分别匹配调用端文本和 renderer 逻辑，未检查中间包装。手工验证切换三种语言后卡片、预览、确认结果保持一致。

## 3. 测试与验证记录

| 检查 | 本次结果 | 说明 |
| --- | --- | --- |
| `npm.cmd test` | **914 通过，0 失败，0 跳过** | Node 测试耗时约 7.84 秒；含源码断言与 mock 测试，不是覆盖率数值 |
| `npm.cmd run test:e2e` | **18 通过** | Windows，约 1 分钟；使用项目启动器的独立临时 userData |
| 对所有已跟踪 `.js` 执行 `node --check` | **223 文件通过** | 语法检查不保证业务正确 |
| `node scripts/verify-installer.js` | **通过** | 仅验证五个必要文件存在，不是安装器构建/安装测试 |
| `node scripts/check_adrs.js` | **输出 `[]`** | ADR 检查器未报告问题 |
| `npm.cmd audit --omit=dev --audit-level=high --fetch-retries=0 --fetch-timeout=15000` | **未完成** | npm registry 请求报 `unable to get local issuer certificate`；未禁用 TLS 校验，不作依赖无漏洞结论 |
| 补充验证 | R1、R3、R5 真实运行；R2、R4、R6 受控复现；R7 静态追踪 | 复现使用临时脚本或隔离实例，未加入正常测试套件 |

PowerShell 默认阻止执行 `npm.ps1`，因此改用同一安装目录提供的 `npm.cmd`。这是运行环境差异，不作为仓库缺陷。

顶层 111 个测试文件中，有 43 个包含读取源码的辅助方法或调用（部分同时包含行为测试）。源码匹配能约束结构，但难以发现适配器参数丢失、原生命令语义、消息完成时机等问题；R1、R4、R7 是具体例子。

## 4. 其他审查观察与边界

**架构与可维护性：** 主进程、preload、renderer 的职责总体清晰，依赖注入使复现较容易。但组合根的转发函数也是需要测试的行为边界，不能只测试被注入的模块。建议围绕“操作后的最终状态”补测试，避免把内部实现策略本身当作需求。

**安全性：** 检查了 IPC 发件窗口校验、存储键白名单、窗口沙盒/CSP、导航拦截、资产 ID 与路径约束、更新包 SHA-512 验证。未在本次检查中证实新的可利用漏洞。扫描未发现应用 JS 使用 `innerHTML` 等直接 HTML 写入点，但不能由此推出“免疫 XSS”。资产加密密钥由随包代码中的固定字符串派生，属于提高直接提取成本的措施，不等于对安装包持有者保密；本次未把这项既定设计列为新漏洞。

**性能：** 天气粒子存在数量上限和输入不变时的节点复用，屏保粒子每次挂载重建。主循环在暂停后仍执行渲染和 `requestAnimationFrame`，主进程窗口采样也不会因 renderer 隐藏而自动停掉；因此不应声称隐藏会暂停全部动画循环和采样。未运行性能基准，无法量化 CPU、GPU 或垃圾回收收益。

**构建与发布：** 检查了 Windows/macOS 工作流、资产生成顺序、包内容排除和签名相关脚本。未生成或安装发行包，也未核验本次构建的签名；构建产物和 CI 运行状态不在“测试通过”结论内。

**文档：** 历史报告中的评分和“全部”“彻底”等绝对结论不能替代证据；测试数量也已与当前代码不一致。本次保留原文件，使用本报告记录独立复核结果。源码尚未修复，因此未把修复建议写成已经实现的架构行为，也未新建 ADR。

## 5. 建议修复顺序与验收

先修 R1，恢复 Windows 守卫的真实 API 接线；随后修 R2、R3。皮肤系统按 R4、R5、R7 分别完成修改和验证，最后处理 R6 的异步设置仲裁。每项修复均需独立更新对应行为测试、中文变更记录及相关文档。

验收时至少补齐以下场景：

1. Windows 普通、最大化、全屏及演示窗口下的屏保与久坐提醒；再验证混合 DPI 显示器。
2. macOS 只打开会议客户端不隐藏，实际通话后隐藏，结束后恢复。
3. 暂停→隐藏→显示，暂停→番茄钟→结束，以及会议隐藏→恢复，均保持原暂停选择。
4. 首次慢加载皮肤时立即取消、连续预览后取消、预览中切换语言；最终界面、主进程与存档一致。
5. 预览但未确认时检查存档；确认后才提交，自动保存及退出保存不能偷提交预览。
6. 城市查询中关闭天气同步、关闭窗口再查询另一城市、让查询逆序完成，最终设置始终符合最后一次用户操作。

以上是后续修复的验收清单，并非本次已完成的修复或全平台验证。

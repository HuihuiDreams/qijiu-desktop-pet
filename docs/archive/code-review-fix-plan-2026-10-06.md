# 代码审查复核修复计划

日期：2026-10-06（Asia/Tokyo）  
依据：[代码审查复核报告](./code-review-recheck-2026-10-06.md)  
范围：R2、R3、R4、R5、R7、R6；R1 已完成代码修复与自动化验证，保留其待执行的手工验收。

## 目标与执行约束

严格按 **R2 → R3 → R4 → R5 → R7 → R6** 串行实施。每项形成独立的“复现测试 → 最小修复 → 自动化验证 → 中文变更记录与相关文档 → 差异检查”闭环，完成后再进入下一项。本文件记录待实施方案，不表示这些问题已经修复。

- 使用实际模块及生产消息接线验证最终行为；源码字符串断言只能补充，不能替代行为测试。
- 竞态测试使用可控 Promise、命令 fake 或定时器，不以固定延时推断请求完成。新增回归测试先在旧实现上确认失败。
- 每项运行聚焦测试，再运行 `npm.cmd test`；记录实际命令、结果、平台和未完成验收，不沿用报告中的历史测试数量。
- 每项在 `CHANGELOG.md` 的 `Unreleased` 已有 `Fixed` 分类末尾追加中文条目，不重复分类标题、不混入已发布版本。同步更新 `docs/structure.md`、相关 ADR 及复查报告该项的修复记录。
- 保留主进程存储与 IPC 鉴权、专用 preload 和 `app.openSkinSelectorForQA`。E2E 复用 `test/e2e/helpers/electron.js` 的隔离 userData，避免修改真实用户存档。
- 实施前读取相关维护、调试和测试技能；修改交互 UI 时读取 UI 技能，跨文件修改完成前读取审查技能。提交或推送时使用项目 `push.ps1` 流程。

## 方案与依赖

| 次序 | 项目 | 修复策略 | 依赖与边界 |
| --- | --- | --- | --- |
| 1 | R2 | 约束 `lsof` 的 PID 与 UDP 条件为交集 | 独立；保持 Windows 检测及原有阈值、防抖 |
| 2 | R3 | 分离用户暂停与隐藏产生的有效暂停 | 在 R2 闭环后执行；保留隐藏来源优先级和番茄钟恢复语义 |
| 3 | R4 | 串行加载并保留最后切换请求，取消回滚不可丢弃 | 先建立可靠切换顺序，再处理持久化语义 |
| 4 | R5 | 分离临时预览、已确认选择及正式保存 | 依赖 R4；覆盖全部存档入口和确认完成时机 |
| 5 | R7 | 组合根透传选肤数据选项，语言更新保留选择 | 在 R5 完成后验证预览、卡片和提交一致性 |
| 6 | R6 | 城市与天气设置统一仲裁，保留最新开关并拒绝旧城市结果 | 皮肤闭环后执行；复用已有更新编号与同步生命周期保护 |

优先沿用现有控制器与依赖注入，不增加通用任务注册器。R4 优先使用单个待执行请求替换队列中的旧请求，避免并行修改宠物贴图；R5 的持久化权威在主进程，预览结果不得通过通用保存路径提交。R6 应区分城市请求的新旧与开关偏好的新旧，避免简单使用一个版本判断而丢掉仍有效的城市选择。

## 任务 1：R2 — macOS 会议 UDP 检测交集

**修改范围：** `meetingDetector.js`；`test/meetingDetector.test.js`。预计小型代码改动，另附本项文档。

1. 为实际 `lsof` 调用增加 `-a`，保留安全二进制路径、超时和参数数组调用。
2. 使用能区分选择条件并集/交集的命令 fake，通过 `collectMeetingUdpSnapshot()` 验证：目标进程的普通文件与其他 PID 的 UDP 不计数，仅目标 PID 的 UDP 参与阈值判断。不能只把原命令字符串期望改成新字符串。
3. 保留无端点、命令失败、阈值边界及会议开始/结束防抖的既有行为；只有实际输出契约需要时才扩展 PID/协议解析。

**验收标准：**

- [ ] 仅启动客户端且没有目标 UDP 时，会议状态不活跃；其他应用 UDP 不造成误隐藏。
- [ ] 目标进程端点达到配置阈值时活跃，退出通话后按原防抖恢复；Windows 回归通过。
- [ ] 中文变更记录、结构说明会议章节、[ADR-035](./decisions/ADR-035-meeting-auto-hide.md) 和报告 R2 修复记录同步。

**自动化：** `node --test test/meetingDetector.test.js test/meetingDetectorController.behavior.test.js`，随后 `npm.cmd test`。

**手工：** macOS 依次验证仅打开客户端、实际通话、其他应用 UDP、退出通话；分别检查检测快照与桌宠隐藏/恢复。当前 Windows 环境不能替代 macOS 真机结果，未执行时明确记录待验收。

## 任务 2：R3 — 隐藏恢复保留暂停选择

**修改范围：** `src/app.js`、必要时 `src/main/services/PetVisibilityService.js`；`test/petVisibilityService.behavior.test.js`，补充 renderer 消费或 Electron 回归用例。预计中型改动。

1. 保留用户暂停意图，按用户暂停与不可见状态计算移动有效暂停；显示通知不得无条件清除用户暂停。
2. 审查 `toggle-pause`、`toggle-pet-visibility` 与初始化状态恢复的消息顺序，确保番茄钟结束的恢复消息不会被显示消息覆盖。若修改状态 payload，同步对应 preload 与消费者。
3. 测试连接真实可见性服务消息和 renderer 消费逻辑，断言移动计时/位置，而非仅断言主进程仍为暂停。

**验收标准：**

- [ ] 暂停后手动隐藏/显示、会议隐藏/结束、番茄钟开始/结束均保持原暂停选择；移动系统不更新。
- [ ] 未暂停时上述流程结束后恢复移动；重叠隐藏来源仍遵循现有优先级，不提前显示。
- [ ] 中文变更记录、结构说明可见性/番茄钟章节、[ADR-011](./decisions/ADR-011-hide-show-pet-functionality.md)、必要的 ADR-035/ADR-037 补充及报告 R3 修复记录同步。

**自动化：** `node --test test/petVisibilityService.behavior.test.js` 及新增 renderer 聚焦用例，随后 `npm.cmd test`；运行新增的隔离 Electron 用例验证主进程、托盘暂停状态与实际移动一致。

**手工：** 分别以暂停和未暂停开始，执行三种隐藏恢复流程，并叠加手动隐藏。验证走动、拖拽及点击穿透正常。暂停不等于停止全部渲染或窗口采样，不作该类承诺。

## 任务 3：R4 — 慢加载取消与连续预览回滚

**修改范围：** `src/systems/SkinSwitchController.js`；必要时 `src/main/services/SkinService.js`；`test/skinSwitchController.test.js`、皮肤集成测试。预计中型改动。

1. 将“并发请求直接忽略”改为串行加载、保留最后待执行请求；请求连同 `persist` 等选项一起保存。明确调用 Promise 的完成与被替换语义。
2. 取消或关闭发出的原皮肤回滚必须最终执行；旧加载完成不得覆盖最新请求的主进程状态或留下错误的最终存档。当前请求失败后仍能处理待执行回滚。
3. 替换现有“并发调用被忽略”的测试，增加可控慢加载、连续预览、取消、关闭及加载失败场景。

**验收标准：**

- [ ] 慢加载 B → 取消回 A，以及 B → C → 取消回 A，全部请求收敛后 renderer、主进程及最终存档均为 A。
- [ ] 加载失败不锁死控制器；未取消的连续选择最终为最后请求，旧回写不反转状态。
- [ ] 中文变更记录、结构说明皮肤章节、[ADR-041](./decisions/ADR-041-skin-selector-performance-and-scaling.md) 与报告 R4 修复记录同步；此阶段不声称已解决 R5 的确认前持久化。

**自动化：** `node --test test/skinSwitchController.test.js test/skinService.test.js test/skinRendererIntegration.test.js`，随后 `npm.cmd test`；补充实际 IPC 到控制器的受控时序测试。

**手工：** 首次资源慢加载时立即取消、连续预览后取消、关闭选肤窗；等待加载收敛后重新打开选择器并重启隔离实例，核对恢复皮肤。

## 任务 4：R5 — 预览不提交、确认后保存

**修改范围：** `src/main/services/SkinService.js`、`src/systems/SkinSwitchController.js`、`src/app.js`；按需修改 `preload.js`、`src/systems/OfflineReturnSystem.js` 或 `src/main/services/StorageIpc.js`。测试覆盖 `test/skinService.test.js`、皮肤 renderer/控制器测试及 `test/e2e/skinSelector.spec.js`。这是最大任务，按下列子步骤串行推进并分别聚焦验证，但 R5 整体验收后才进入 R7。

1. **消息与状态契约：** 主进程分别维护已确认选择、预览目标和实际加载结果；切换通知显式带预览/提交语义，透传到 renderer。普通正式切换与存档恢复继续正常工作。
2. **保存闭环：** 确认加载成功且仍属于当前选择后提交；慢加载时确认应等待或明确返回未完成，加载失败不提交。保存入口使用已确认皮肤，主进程对皮肤字段作最终约束，避免 renderer 的临时展示状态进入正式存档。核查即时保存、每分钟自动保存及退出保存这三条路径。
3. **取消与关闭：** 取消、窗口正常关闭、应用失焦关闭恢复原选择；复用 R4 的可靠回滚。验证确认、取消及重新打开选择器不会使用过时加载回报。

**验收标准：**

- [ ] 预览 B 时宠物显示 B，但持久化皮肤仍为 A；期间自动保存、退出保存及未确认后重新启动均保持 A。
- [ ] 确认成功才将皮肤提交为 B，重启恢复 B；取消/关闭恢复 A，慢加载或失败不能误提交；养成、位置与离线时间仍正常保存。
- [ ] 中文变更记录、结构说明皮肤/存档/IPC 章节、[ADR-006](./decisions/ADR-006-state-persistence-and-offline-decay.md)、ADR-041 与报告 R5 修复记录同步。若状态契约构成新架构决策，新增并索引 ADR；不得预先固定新编号。

**自动化：** 各子步骤运行对应皮肤/存档聚焦测试；最终运行 `npm.cmd test` 和 `npm.cmd run test:e2e -- test/e2e/skinSelector.spec.js`。使用真实 `electron-store` 的隔离实例读取存档，验证预览、自动保存、退出、确认及重启结果。

**手工：** A → 预览 B → 等待自动保存 → 取消；A → 预览 B → 退出/重启；A → 预览 B → 确认 → 重启。每条都检查卡片、实际贴图与存档。继续验证所有内置皮肤与番茄钟素材。

## 任务 5：R7 — 语言切换保留选肤状态

**修改范围：** `src/main/AppLifecycle.js`；必要时 `src/skinSelectorWindow.js` 和根目录 `skinSelectorWindow.js`；`test/appLifecycle.behavior.test.js`、选肤接线/E2E 测试。预计小至中型改动。

1. 修正组合根包装，完整透传 `sendSkinSelectorData` 的选项；语言刷新继续使用 `resetSelection: false`。
2. 通过真实 `AppLifecycle → TrayManager → SkinSelectorWindow` 调用链触发语言回调，再验证 renderer 卡片状态；不只检查某处源码出现了选项。
3. 覆盖无预览、有预览、加载中预览，以及确认/取消后的重新打开。

**验收标准：**

- [ ] 中、英、日切换仅更新语言，预览目标和选中卡片保持一致，既不隐式确认也不取消。
- [ ] 切换语言后确认提交当前所选皮肤，取消恢复原皮肤；重新打开仍正确显示已确认选择。
- [ ] 中文变更记录、结构说明语言/选肤章节、[ADR-024](./decisions/ADR-024-i18n-multilingual-support.md)、ADR-041 与报告 R7 修复记录同步。

**自动化：** `node --test test/appLifecycle.behavior.test.js test/trayManager.test.js test/skinSelectorWindow.behavior.test.js test/skinSelectorIntegration.test.js`，随后 `npm.cmd test` 及选肤 E2E。

**手工：** 预览新皮肤后依次从托盘切换三种语言，核对卡片、贴图和确认结果；再次执行取消路径。语言切换引起应用内焦点交接时，选择器仍按已有焦点策略运行。

## 任务 6：R6 — 异步城市与天气设置仲裁

**修改范围：** `src/main/services/WeatherSyncController.js`；必要时城市窗关闭生命周期接线；`test/weatherSyncController.behavior.test.js`。预计中型改动。

1. 将城市请求纳入设置仲裁：新城市请求使旧城市请求失效；查询结束时合并最新天气开关和其他设置，禁止恢复查询前捕获的 `enabled`。
2. 与 `weatherSyncSettingsUpdateId`、`weatherSyncStartId` 和存储订阅统一协调，防止保存触发的回调重复启动或旧请求重新启用定时器。
3. 查询提交后关闭窗口不等于撤销城市意图；若没有更新请求，可以按最新偏好保存有效城市，但不得向已销毁窗口发送结果。新窗口提交另一城市后，旧窗口的请求不得覆盖新城市。若产品改为关闭即撤销，应先明确变更并补充该行为测试。

**验收标准：**

- [ ] 查询期间关闭同步，完成后开关仍关闭，不启动天气同步；关闭再开启时保持最后开关选择。
- [ ] A 查询 → 关闭窗口 → 新窗口查询 B，响应顺序任意，最终为 B；旧成功或失败不覆盖新城市、新坐标、开关或定时器。
- [ ] 中文变更记录、结构说明天气/城市章节、[ADR-038](./decisions/ADR-038-weather-sync.md)、[ADR-039](./decisions/ADR-039-city-setting-ui-window.md) 与报告 R6 修复记录同步。

**自动化：** `node --test test/weatherSyncController.behavior.test.js test/weatherSyncStartup.test.js test/weatherSyncService.test.js`，随后 `npm.cmd test`。用延迟 Promise 和可检查定时器验证逆序成功、失败、关闭开关及存储订阅；单元测试不依赖外部天气网络。

**手工：** 查询中关闭同步、关闭并重开城市窗查询另一城市、重复切换开关；观察设置、天气效果与同步是否符合最后操作。实际网络结果和受控竞态测试分别记录。

## 检查点与完成记录

| 检查点 | 必须完成的内容 |
| --- | --- |
| 每项结束 | 回归测试旧实现失败/修复后通过、聚焦和全量 Node 测试通过、中文变更记录及相关文档更新、差异检查；记录平台限制后进入下一项 |
| R3 后 | 会议检测与可见性恢复联合回归；用户暂停选择保持一致 |
| R7 后 | R4/R5/R7 分别通过后再跑完整皮肤流程：慢加载取消、确认前不保存、三语切换后确认/取消 |
| R6 后 | `npm.cmd test`、`npm.cmd run test:e2e`、`node scripts/check_adrs.js`；对改动 JS 执行 `node --check`，核查 Markdown 相对链接与变更记录分类 |

最终复查报告逐项记录“代码修复、自动化验证、手工验收”状态。保留 R1 的普通/最大化/全屏/演示窗口及混合 DPI 待验收项；未执行 macOS 或真实多屏交互，不得写成全平台验证完成。本轮不改变资产、manifest 或皮肤目录，若实施中确需调整这些内容，另按皮肤流水线同步画廊、加载器和三语说明。

每项结果记录模板：

```text
编号：R?
修复行为与涉及文件：
旧代码复现测试结果：
聚焦测试命令与结果：
全量 Node / E2E 命令与结果：
中文变更记录及结构说明 / ADR：
手工验收、运行平台、未完成项目：
剩余风险与后续依赖：
```

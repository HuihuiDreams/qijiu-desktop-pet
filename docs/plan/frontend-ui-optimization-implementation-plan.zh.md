# 前端 UI 优化实施计划
> 状态：已修订
> 日期：2026-06-25
> 相关 ADR：[ADR-033](../decisions/ADR-033-frontend-ui-engineering-and-color-swap.md)、[ADR-034](../decisions/ADR-034-ui-performance-and-visual-upgrades.md)、[ADR-039](../decisions/ADR-039-city-setting-ui-window.md)

## 概述
本计划把 `frontend-app-builder` 的思路应用到当前 Electron 桌宠项目，但不迁移现有的 vanilla HTML、JavaScript 和 CSS 架构。目标不是做一次大规模重设计，而是在保留透明窗口、鼠标穿透、多显示器、DPI、i18n 和 Electron 安全边界的前提下，逐步提升 UI 的可读性、稳定性和可维护性。

计划已经根据状态窗口回归问题进行修订：Phase 3 以后不再推进“全面视觉统一”。后续 UI 工作应以“已有可用界面为基线”，只修明确缺陷或用户明确批准的改版。

## 架构决策
- 保持当前 Electron renderer 架构：`main.js` 负责窗口和 IPC，`preload.js` 暴露安全 API，`src/` 负责 renderer UI 和游戏系统。
- 把可读文本和编码清理作为第一道 UI 质量门槛。不能在乱码 fallback 文本上继续做视觉优化。
- 暂时继续使用 `src/index.css` 作为共享 design tokens 来源，但子窗口必须通过 scoped selectors 消费这些 token，避免全局样式串场。
- 保持子窗口严格 CSP。不新增 inline script，不让 renderer 直接访问 Node API。
- 保持 ADR-034 的透明窗口约束：不依赖 `backdrop-filter` 去模糊操作系统桌面背景。

## 任务列表

### Phase 1：文本、编码和基线审计

#### Task 1：审计可见 fallback 文本和编码敏感元数据
**说明：** 找出静态 HTML、package 元数据、UI 相关文档和 i18n fallback 路径里的用户可见乱码，先形成清单，再进入修复，避免把文案修复和视觉重构混在一起。

**验收标准：**
- [x] 已盘点 `src/*.html` 中的静态可见文本。
- [x] 已检查 `package.json` 展示元数据和相关文档中的乱码。
- [x] 在编辑前明确 zh/en/ja 文案修复方向。

**验证：**
- [x] 运行 `node --test test/i18n.test.js test/i18nKeyCompleteness.test.js`。
- [ ] 手动检查桌宠 overlay、Pomodoro、城市设置、状态窗口和更新窗口是否还有不可读 fallback 文本。

**依赖：** 无

**预计范围：** 小

#### Task 2：修复静态 UI fallback 文本且不改变行为
**说明：** 把 HTML 和元数据里的乱码 fallback 文本替换为可读 UTF-8 文本，并与现有 i18n key 保持一致。不改变 IPC 名称、DOM ID 或 renderer 行为。

**验收标准：**
- [x] `src/index.html`、`src/pomodoro.html` 和 `src/city-setting.html` 的 fallback 文本可读。
- [x] `package.json` 中用户可见的产品/展示字符串可读。
- [x] 现有 `data-i18n`、`data-i18n-title` 和 `data-i18n-placeholder` 属性保持不变。

**验证：**
- [x] 运行 `npm test`。
- [ ] 运行 `npm run dev`，确认 i18n 替换完成前不会出现乱码 fallback 文本。

**依赖：** Task 1

**预计范围：** 中

### 检查点：可读性门槛
- [x] 所有测试通过。
- [x] 主窗口里没有用户可见的 mojibake fallback 文本。
- [x] Electron 安全设置没有被削弱。

### Phase 2：共享设计系统基础

#### Task 3：规范共享 CSS tokens
**说明：** 审查 `src/index.css` 中的 tokens，并补足当前窗口需要的面板、边框、阴影、字体、控件尺寸、focus ring、语义反馈色、间距和动效时长。

**验收标准：**
- [x] 共享 tokens 覆盖面板、按钮、输入框、图标按钮、状态消息和 tooltip。
- [x] 角色颜色语义继续与 ADR-033 保持一致。
- [x] token 命名保持语义化和可复用，不把某个窗口专属概念泄露为全局命名。

**验证：**
- [x] 通过扩展现有窗口测试进行 CSS source checks。
- [ ] 手动比较右键菜单、状态面板、Pomodoro 和城市设置窗口的颜色与间距语言是否一致。

**依赖：** Task 2

**预计范围：** 中

#### Task 4：定义可复用的原生 CSS 组件类
**说明：** 为常见窗口控件添加或整理可复用 CSS 类：panel shell、titlebar、icon button、primary button、ghost button、text input、status feedback 和 tooltip。类名保持简单、opt-in，方便窗口样式渐进迁移。

**验收标准：**
- [x] 共享类通过 CSS 注释或简短文档说明用途。
- [x] 共享类在当前严格 CSP 下可用。
- [x] 窗口专属样式可以覆盖布局，而不需要复制完整视觉样式。

**验证：**
- [x] 运行 `npm test`。
- [ ] 检查至少一个按钮、一个输入框、一个 titlebar 和一个反馈消息的 computed styles。

**依赖：** Task 3

**预计范围：** 中

### 检查点：基础能力门槛
- [x] 共享 tokens/classes 已存在，并至少被一个迁移窗口使用。
- [x] 没有新增依赖或构建步骤。
- [ ] 透明桌宠 overlay 仍然正确渲染。

### Phase 3：稳定优先的窗口工作

> 修订说明：状态窗口回归后，本阶段不再是大范围视觉统一。现有可用 UI 视为基线。只有出现明确缺陷、溢出、可读性问题、安全问题或可维护性问题时才修改窗口。

#### Task 5：冻结当前可用 UI 基线
**说明：** 在继续任何 UI 工作前，记录当前已接受的视觉状态，让“不要越改越差”变成可检查的标准，特别是那些共享全局 CSS 的 Electron 子窗口。

**验收标准：**
- [ ] 列出当前视为可接受的窗口和 overlay：桌宠 overlay、右键菜单、状态面板、Pomodoro、城市设置、状态窗口和更新进度窗口。
- [ ] 记录敏感选择器，例如 `.stat-*`、`.status-*`、`.context-menu-*`，以及同时出现在 `index.css` 和子窗口 CSS 中的选择器。
- [ ] 明确规则：子窗口修复必须使用窗口作用域选择器，例如 `.status-panel .stat-label`，不能依赖全局 class 覆盖。

**验证：**
- [ ] 运行 `npm test`。
- [ ] 手动检查英文状态窗口，确认标签、进度条、数值不重叠，窗口也不过宽。

**依赖：** Task 4

**预计范围：** 小

#### Task 6：城市设置和 Pomodoro 只在有明确缺陷时修
**说明：** 不为了“看起来更统一”而迁移城市设置或 Pomodoro。只有在出现剪裁、溢出、不可读文本、状态样式损坏或不安全重复时才修改。

**验收标准：**
- [ ] 每次改动都从一个具名 bug 或视觉缺陷开始。
- [ ] 修改范围保留在受影响窗口的 HTML/CSS/renderer 文件内，除非共享 helper 明显更安全。
- [ ] 修复后 zh/en/ja 文本在受影响状态中仍然放得下。

**验证：**
- [ ] 城市设置缺陷：运行 `node --test test/citySettingWindow.test.js test/citySettingI18n.test.js test/citySettingTray.test.js`。
- [ ] Pomodoro 缺陷：运行 `node --test test/pomodoroWindow.test.js test/pomodoroSystem.test.js test/pomodoroI18n.test.js test/pomodoroTray.test.js`。
- [ ] 只手动检查受影响工作流的前后效果。

**依赖：** Task 5

**预计范围：** 每个缺陷小到中

#### Task 7：保护 overlay UI，而不是重新设计
**说明：** 右键菜单、状态面板和对话气泡默认冻结，除非发现具体问题。这些界面与鼠标穿透、透明窗口、scale ratio 和全局 CSS 都有耦合，风险最高。

**验收标准：**
- [ ] 不为了视觉统一而大范围重做右键菜单、状态面板或对话气泡。
- [ ] 任何 overlay 修复都必须保留鼠标穿透、hover-only 交互、拖拽、anti-overlap 和 `scaleRatio` 行为。
- [ ] overlay CSS 改动使用 scoped selectors，并为对应失败模式补回归检查。

**验证：**
- [ ] 运行相关 focused tests：`node --test test/contextMenuBehavior.test.js test/contextMenuPosition.test.js test/dialogBubble.test.js test/petRenderer.test.js test/mainMousePassthrough.test.js`。
- [ ] 状态面板缺陷还要运行 `node --test test/statusWindowLayout.test.js test/htmlInjectionHardening.test.js`。
- [ ] 手动检查右键菜单、状态面板、桌宠交互、拖拽和 hover；有条件时检查普通屏和高 DPI 屏。

**依赖：** Task 5

**预计范围：** 每个缺陷小到中

#### Task 8：工具窗口保持缺陷驱动
**说明：** 状态窗口和更新进度窗口只做针对可读性、布局、安全或反馈状态损坏的修复。除非用户明确批准 redesign，否则不应用新的面板/控件语言。

**验收标准：**
- [ ] 状态窗口指标在 zh/en/ja 下保持紧凑且稳定。
- [ ] 更新进度 renderer 继续使用安全 DOM API 和严格 preload IPC。
- [ ] 任何 cache-busting query 变更都要说明原因，例如避免子窗口 CSS 旧缓存。

**验证：**
- [ ] 更新窗口变更：运行 `node --test test/updateProgressSecurity.test.js test/updateManager.test.js`。
- [ ] 状态窗口布局变更：运行 `node --test test/statusWindowLayout.test.js`。
- [ ] 只手动检查受影响工具窗口。

**依赖：** Task 5

**预计范围：** 每个缺陷小

### 检查点：稳定性门槛
- [ ] 没有具名缺陷或用户明确批准 redesign 时，不继续做 UI 改动。
- [ ] 被修改窗口必须用触发问题的语言/布局手动检查。
- [ ] 避免共享/全局 CSS 改动，除非它比 scoped fix 更小、更安全。
- [ ] `npm test` 和相关 focused tests 通过。

### Phase 4：视觉 QA、资产和文档

#### Task 9：增加可重复视觉 QA checklist
**说明：** 记录透明窗口、多显示器、DPI、动效和窗口交互的手动 QA 流程。后续 UI 质量工作的重点从“全面视觉统一”转为“可重复验证”。

**验收标准：**
- [ ] QA checklist 覆盖桌宠 overlay、右键菜单、状态面板、Pomodoro、城市设置、状态窗口和更新进度窗口。
- [ ] checklist 包含桌面背景可读性、高 DPI、多显示器、拖拽、hover、reduced motion、语言切换，以及 CSS 改动后的窗口重开检查。
- [ ] checklist 引用 focused tests，并标明哪些检查必须人工在 Electron 中验证。

**验证：**
- [ ] checklist 可以在 fresh checkout 中配合 `npm test` 和 `npm run dev` 执行。

**依赖：** Task 5

**预计范围：** 小

#### Task 10：只针对缺陷检查精灵和 UI 资产一致性
**说明：** 确认当前宠物资产、图标资产和窗口图片完整且未被剪裁。除非发现真实资产缺陷，否则不重绘、不重新生成、不重新设计资产。

**验收标准：**
- [ ] `src/assets/{skinId}` 下当前皮肤资产保持完整。
- [ ] Pomodoro 设置/运行/完成状态中的图片居中且未被剪裁。
- [ ] 被检查窗口中的应用图标和窗口控件不模糊、不被剪裁、不突兀。

**验证：**
- [ ] 运行 `node --test test/assetDimensions.test.js test/pngColorProfile.test.js test/skinManager.test.js test/skinRendererIntegration.test.js`。
- [ ] 只有在资产相关改动发生时，才做前后截图对比。

**依赖：** Task 5

**预计范围：** 小

#### Task 11：更新文档和 changelog
**说明：** 记录修订后的 UI 策略和已完成的缺陷修复。只有当实现引入超出现有 ADR-033/034/039 的长期架构决策时，才新增 ADR。

**验收标准：**
- [ ] 已发布的 UI 行为变化写入 `CHANGELOG.md` 的 `Changed` 或 `Fixed`。
- [ ] 如果文件职责或共享 CSS 结构变化，更新 `docs/structure.md`。
- [ ] 英文计划和中文计划在策略变化时保持同步。

**验证：**
- [ ] 行为或源码变更时运行 `npm test`。
- [ ] 如果项目已有 docs/ADR 检查脚本，按需运行。

**依赖：** Task 9 和 Task 10，或任何准备发布的缺陷修复

**预计范围：** 小

### 最终检查点
- [ ] `npm test` 通过。
- [ ] 每个被修改的窗口或 overlay surface 都通过 focused tests。
- [ ] 被修改工作流和语言通过手动 Electron QA。
- [ ] renderer 不直接使用 Node API。
- [ ] 严格 CSP 没有被削弱。
- [ ] 提交前更新 `CHANGELOG.md` 和相关文档。

## 风险和缓解
| 风险 | 影响 | 缓解 |
|---|---|---|
| 大范围共享 CSS 改动让原本正常的窗口回归 | 高 | 优先使用 scoped child-window selectors 和缺陷驱动修复；除非明确必要，避免改 `.stat-*` 这类全局选择器。 |
| 透明 Electron 窗口让玻璃/模糊效果不可靠 | 高 | 使用足够不透明的面板背景、边框和 inset shadow，不依赖 OS 桌面 blur。 |
| i18n 字符串在紧凑窗口中溢出 | 中 | 只在受影响窗口验证 zh/en/ja，并明确处理 titlebar/button 文本截断。 |
| token 清理演变成大范围 redesign | 中 | Phase 2 tokens 只是基础，不是重做所有窗口的理由。除非用户明确批准，否则推迟视觉一致性工作。 |
| 文档仍有 mojibake | 中 | 本次触及的文档统一按 UTF-8 处理，只修与 UI 工作相关的 plan/structure/changelog 部分。 |

## 可并行机会
- Task 9 可以独立完成，因为它是文档和 QA 流程工作。
- Task 10 如果保持只读检查或缺陷报告，也可以独立完成。
- 涉及共享 CSS、overlay 行为或同一子窗口的缺陷修复不要并行。

## 不在本次范围
- 不迁移到 React/Vite。
- 不为样式、图标、动画或截图新增依赖。
- 不修改游戏逻辑、养成公式、移动行为、天气同步、会议自动隐藏或更新网络行为，除非 UI 验证暴露了直接回归。
- 不新增生成式宠物美术，除非 Task 10 发现明确资产缺陷。

## 待确认问题
- 旧的乱码计划 `docs/plan/ui-optimization-proposal-plan.md` 应修复、归档，还是作为历史上下文保留？
- 如果 scoped child-window selectors 成为正式项目惯例，是否需要新增 ADR 记录？

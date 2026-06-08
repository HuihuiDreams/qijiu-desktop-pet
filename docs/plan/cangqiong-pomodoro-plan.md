# 实施计划：苍穹山派番茄钟

## Spec Alignment

### Objective

实现本地番茄钟 MVP：用户开启专注后，系统根据前台窗口分类判断是否频繁切到非工作软件，并用沈九台词进行轻量监督；不强制锁屏，不阻断用户操作。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests: `node --test test/focusClassification.test.js test/focusSystem.test.js`
- Build: `npm run build`

### Project Structure

- `src/data/config.js`: 番茄钟默认配置和软件/域名分类规则。
- `src/systems/FocusSystem.js`: 专注生命周期、前台分类统计和警告事件。
- `main.js` / `preload.js`: 前台窗口信息读取和安全 IPC。
- `src/app.js`: 游戏循环集成和桌宠状态响应。
- `src/data/dialogues.js`: 专注开始、警告、成功、失败台词。
- `test/`: 分类、FocusSystem、托盘入口和持久化测试。

### Code Style

使用现有 vanilla JavaScript 风格：分类逻辑保持纯函数，FocusSystem 使用 fake clock 可测试；主进程只负责读取前台窗口并发送脱敏摘要；renderer 根据状态做表现，不直接推断 OS 或窗口细节。

### Boundaries

- Always: 前台窗口读取在主进程，renderer 只接收脱敏分类/摘要。
- Always: 分类失败时 fallback 为 `neutral`，不能误判为非工作。
- Always: 该功能只做提醒和监督，不强制关闭、遮挡或拦截用户软件。
- Ask first: 新增前台窗口依赖、读取浏览器完整 URL、增加账号同步或统计报表。
- Never: 记录完整窗口标题、完整路径、完整 URL 或用户输入内容。

### Success Criteria

- 用户可以从托盘开始和结束 25 分钟专注。
- 默认工作/中立/非工作分类规则可测试且可配置。
- 10 分钟窗口内非工作切换次数或累计时长达到阈值时触发警告，并有冷却。
- 专注状态不破坏移动、拖拽、隐藏和现有交互。
- `npm test` 和 focus focused tests 通过。

### Testing Strategy

先测试 `classifyForegroundWindow` 的配置命中和 fallback，再用 fake clock 测 FocusSystem 生命周期、阈值、冷却和完成状态。Electron 前台窗口读取作为主进程边界测试，真实 UI 用 `npm run dev` 手动验证托盘入口和台词触发。

## Overview

“苍穹山派”番茄钟是一个沉浸式专注模式：用户开启专注后，沈九进入“闭关/监督”状态；应用定期识别当前前台窗口，判断用户是否频繁切换到非工作软件；达到阈值后触发沈九冷嘲热讽式提醒。MVP 只做本地识别、轻量监督和可配置规则，不做强制锁屏、应用拦截、云同步或账号系统。

## 核心定义：什么是非工作软件

### 识别对象

只识别“当前前台窗口”，不扫描用户后台进程，不记录完整使用历史。每次采样尽量获取以下字段：

- `processName`：进程名，例如 `Code.exe`、`chrome.exe`、`Steam.exe`
- `ownerName`：应用名，例如 Visual Studio Code、Google Chrome
- `path`：可执行文件路径，仅用于本地匹配，不展示给普通 UI
- `title`：窗口标题，例如当前文档、网页标题
- `url/domain`：浏览器当前网址或域名，能稳定获取时才使用

### 分类结果

前台窗口统一分类为三类：

- `work`：工作软件。命中工作应用、工作域名或用户自定义允许规则。
- `neutral`：中立软件。系统窗口、桌面、任务栏、文件选择器、输入法、杀毒/系统设置、桌宠自身，以及短暂无法识别的空窗口。
- `nonWork`：非工作软件。明确命中分心应用/分心域名，或未知普通应用持续超过宽限时间。

### 默认工作软件

默认工作软件列表用于降低误伤，后续允许用户修改：

- 编辑器/IDE：VS Code、Cursor、WebStorm、Visual Studio、Notepad++
- 终端/开发工具：PowerShell、Windows Terminal、cmd、Git Bash、Node、npm
- 办公与创作：Word、Excel、PowerPoint、OneNote、Obsidian、Notion、Figma
- 浏览器中的工作域名：GitHub、GitLab、Stack Overflow、npm、MDN、OpenAI 文档、公司/项目配置域名

### 默认中立软件

中立软件不计入违规，也不打断番茄钟：

- Windows Shell、任务栏、桌面、开始菜单
- 文件资源管理器、文件打开/保存对话框
- 输入法、系统设置、系统通知、杀毒安全软件
- 桌宠自身窗口和状态窗口
- 无法识别且持续时间少于宽限阈值的临时窗口

### 默认非工作软件

默认非工作软件包括：

- 游戏平台/游戏：Steam、Epic Games、Battle.net、常见游戏进程
- 短视频/娱乐：抖音、Bilibili、YouTube、Netflix、Twitch 等娱乐域名
- 社交聊天：Discord、QQ、微信、Telegram、微博等，除非用户加入工作清单
- 购物/外卖/娱乐网站：淘宝、京东、Amazon、娱乐网站等

### 判定策略

MVP 采用“允许清单优先 + 常见分心黑名单”的平衡模式：

- 明确命中 `workApps` 或 `workDomains`：判定为 `work`
- 明确命中 `neutralApps`：判定为 `neutral`
- 明确命中 `distractionApps` 或 `distractionDomains`：判定为 `nonWork`
- 未知普通应用连续前台超过 `20s`：判定为 `nonWork`
- 黑名单应用连续前台超过 `5s`：判定为 `nonWork`
- 单次切换少于阈值：只记录，不触发嘲讽

### “频繁切换”的定义

沈九不因一次误触立刻嘲讽。默认触发条件：

- 以 `10min` 为滚动窗口统计行为
- 窗口内非工作软件切换次数 `>= 3` 次，触发警告
- 或窗口内累计非工作时长 `>= 90s`，触发警告
- 警告后进入 `3min` 冷却期，冷却期内继续记录但不重复刷屏

### 用户自定义规则

用户配置优先级高于默认配置。后续 UI 可以暴露以下配置：

- 添加/移除工作软件
- 添加/移除非工作软件
- 添加/移除工作域名和非工作域名
- 调整未知应用宽限时间
- 调整警告阈值和冷却时间

## Architecture Decisions

- 前台窗口识别放在 Electron 主进程中实现，渲染进程通过 IPC 请求当前窗口摘要。
- 分类逻辑做成纯函数，便于测试，也避免把 UI、计时器和系统 API 混在一起。
- 新增 `FocusSystem` 管理番茄钟生命周期、采样、分类、违规统计和警告冷却。
- 沈九的“闭关”动画优先复用已有 `meditating` 状态和 `right_cultivate.png`，避免 MVP 阶段新增素材阻塞。
- 台词放进 `src/data/dialogues.js`，与现有对话系统保持一致。
- 专注模式只做提醒，不阻止用户使用任何软件，避免过度侵入。

## Task List

### Phase 1: 配置与分类模型

#### Task 1: 新增番茄钟默认配置

**Description:** 在配置层增加番茄钟参数和软件分类默认清单。

**Acceptance criteria:**
- [ ] 存在 `FOCUS_CONFIG` 或等价配置对象
- [ ] 包含时长、采样间隔、宽限时间、滚动窗口、冷却时间
- [ ] 包含 `workApps`、`workDomains`、`neutralApps`、`distractionApps`、`distractionDomains`

**Verification:**
- [ ] `npm test` 通过
- [ ] 配置可被单元测试直接导入

**Dependencies:** None

**Files likely touched:**
- `src/data/config.js`
- `test/focusClassification.test.js`

**Estimated scope:** Small

#### Task 2: 实现前台窗口分类函数

**Description:** 新增纯函数 `classifyForegroundWindow(windowInfo, focusConfig)`，返回 `work`、`neutral` 或 `nonWork`，并附带命中原因。

**Acceptance criteria:**
- [ ] 工作应用命中时返回 `work`
- [ ] 中立应用命中时返回 `neutral`
- [ ] 黑名单应用/域名命中时返回 `nonWork`
- [ ] 未知应用按宽限时间处理
- [ ] 空窗口或无法识别窗口默认返回 `neutral`

**Verification:**
- [ ] 覆盖工作软件、中立软件、非工作软件、未知软件、浏览器域名场景
- [ ] `npm test -- --test-name-pattern "focus"` 通过

**Dependencies:** Task 1

**Files likely touched:**
- `src/systems/FocusSystem.js`
- `test/focusClassification.test.js`

**Estimated scope:** Medium

### Checkpoint: 分类基础

- [ ] 所有分类测试通过
- [ ] 默认规则不会把系统窗口和桌宠自身判为非工作
- [ ] 文档中的“非工作软件定义”与代码配置一致

### Phase 2: 前台窗口识别

#### Task 3: 主进程接入前台窗口读取能力

**Description:** 在 Electron 主进程中读取当前前台窗口信息，并通过 IPC 暴露给渲染进程。

**Acceptance criteria:**
- [ ] 新增 IPC handler，例如 `get-active-window-info`
- [ ] 返回标准化窗口摘要：`processName`、`ownerName`、`title`、`url/domain`、`sampledAt`
- [ ] 读取失败时返回 `{ classificationHint: 'neutral', error: true }` 或等价安全结果
- [ ] 不向普通 UI 展示完整可执行路径

**Verification:**
- [ ] DevTools 可调用 `window.electronAPI.getActiveWindowInfo()`
- [ ] 读取失败时应用不崩溃
- [ ] `npm test` 通过

**Dependencies:** Task 1

**Files likely touched:**
- `main.js`
- `preload.js`
- `package.json`
- `package-lock.json`

**Estimated scope:** Medium

### Phase 3: FocusSystem 核心

#### Task 4: 实现番茄钟生命周期

**Description:** 新增 `FocusSystem`，管理专注开始、停止、完成、剩余时间和状态快照。

**Acceptance criteria:**
- [ ] 支持开始 25 分钟专注
- [ ] 支持手动结束专注
- [ ] 支持完成状态
- [ ] 可返回剩余时间和当前统计

**Verification:**
- [ ] fake clock 测试开始、倒计时、完成
- [ ] `npm test -- --test-name-pattern "FocusSystem"` 通过

**Dependencies:** Task 1

**Files likely touched:**
- `src/systems/FocusSystem.js`
- `test/focusSystem.test.js`

**Estimated scope:** Medium

#### Task 5: 实现非工作切换统计与警告事件

**Description:** `FocusSystem` 定期采样前台窗口，按分类规则累计非工作次数和时长，达到阈值时发出警告事件。

**Acceptance criteria:**
- [ ] `10min` 内非工作切换 `>=3` 次触发警告
- [ ] `10min` 内累计非工作时长 `>=90s` 触发警告
- [ ] 警告后 `3min` 内不重复触发
- [ ] 工作软件和中立软件不计入违规

**Verification:**
- [ ] 单元测试覆盖次数阈值、时长阈值、冷却期、宽限期
- [ ] `npm test` 通过

**Dependencies:** Task 2, Task 4

**Files likely touched:**
- `src/systems/FocusSystem.js`
- `test/focusSystem.test.js`

**Estimated scope:** Medium

### Checkpoint: 核心逻辑

- [ ] FocusSystem 测试通过
- [ ] 不依赖真实系统窗口也能完成核心逻辑测试
- [ ] 采样失败不会误判为非工作

### Phase 4: 桌宠行为与 UI 集成

#### Task 6: 接入 app.js 游戏循环

**Description:** 在渲染进程初始化 `FocusSystem`，专注中按固定间隔获取前台窗口信息并更新系统状态。

**Acceptance criteria:**
- [ ] 专注模式开启后沈九进入 `meditating`
- [ ] 专注模式结束后沈九恢复自然行为
- [ ] 达到警告阈值后触发沈九台词
- [ ] `isPaused`、隐藏宠物、状态窗口不破坏番茄钟计时

**Verification:**
- [ ] DevTools 可通过 debug 方法模拟非工作窗口并触发警告
- [ ] 手动开启专注后能看到闭关状态
- [ ] `npm test` 通过

**Dependencies:** Task 3, Task 5

**Files likely touched:**
- `src/app.js`
- `src/debug.js`
- `src/pet/Pet.js`

**Estimated scope:** Medium

#### Task 7: 新增沈九监督台词

**Description:** 增加专注开始、警告、完成和失败相关台词池。

**Acceptance criteria:**
- [ ] 新增 `focusStart`
- [ ] 新增 `focusWarn`
- [ ] 新增 `focusSuccess`
- [ ] 新增 `focusFail`
- [ ] `focusWarn.shenjiu` 风格为冷嘲热讽，但不辱骂用户

**Verification:**
- [ ] 触发警告时从 `focusWarn.shenjiu` 随机取台词
- [ ] 无台词时有安全 fallback

**Dependencies:** Task 6

**Files likely touched:**
- `src/data/dialogues.js`
- `test/dialogBubble.test.js`

**Estimated scope:** Small

#### Task 8: 托盘菜单增加番茄钟入口

**Description:** 在系统托盘中增加开始/结束闭关入口和专注状态展示。

**Acceptance criteria:**
- [ ] 空闲时显示“开启闭关 25 分钟”
- [ ] 专注中显示剩余分钟
- [ ] 专注中可手动“结束闭关”
- [ ] 托盘菜单刷新不影响现有皮肤、暂停、隐藏、更新、退出入口

**Verification:**
- [ ] `skinTray.test.js` 或新增托盘测试覆盖菜单结构
- [ ] 手动点击托盘可开始/结束专注
- [ ] `npm test` 通过

**Dependencies:** Task 4, Task 6

**Files likely touched:**
- `main.js`
- `preload.js`
- `test/skinTray.test.js`

**Estimated scope:** Medium

### Checkpoint: 可用 MVP

- [ ] 用户可以从托盘开启专注
- [ ] 沈九进入闭关状态
- [ ] 切到工作软件不触发警告
- [ ] 频繁切到非工作软件会触发沈九台词
- [ ] 用户可以结束专注

### Phase 5: 持久化与配置扩展

#### Task 9: 保存用户配置和最近专注结果

**Description:** 使用现有 `electron-store` 保存番茄钟配置、用户自定义软件分类和最近一次专注结果。

**Acceptance criteria:**
- [ ] 用户自定义规则优先级高于默认规则
- [ ] 重启后配置保留
- [ ] 未完成的番茄钟默认不自动恢复为进行中
- [ ] 旧存档缺少番茄钟字段时安全 fallback

**Verification:**
- [ ] TimeSystem 或 FocusSystem 持久化测试覆盖旧数据兼容
- [ ] `npm test` 通过

**Dependencies:** Task 5

**Files likely touched:**
- `src/systems/TimeSystem.js`
- `src/systems/FocusSystem.js`
- `test/timeSystem.test.js`

**Estimated scope:** Medium

#### Task 10: 更新架构文档

**Description:** 将番茄钟系统写入项目结构文档，记录数据流和隐私边界。

**Acceptance criteria:**
- [ ] `docs/structure.md` 包含 FocusSystem 描述
- [ ] 文档说明只采样前台窗口，不扫描后台进程
- [ ] 文档说明非工作软件分类规则和用户覆盖关系

**Verification:**
- [ ] 文档链接和文件名正确
- [ ] 与本计划保持一致

**Dependencies:** Task 1-9

**Files likely touched:**
- `docs/structure.md`

**Estimated scope:** Small

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 前台窗口读取库在 Windows/Electron 中不稳定 | High | 把读取能力封装在主进程，失败时 neutral fallback；核心逻辑用 fake provider 测试 |
| 浏览器 URL 获取不稳定或涉及隐私 | Medium | URL/domain 作为可选增强；默认不展示完整 URL；获取不到时按进程和标题退化 |
| 误判工作聊天软件为非工作 | Medium | 用户配置优先；默认把未知应用设置宽限时间，不立即警告 |
| 台词过于打扰 | Medium | 增加 3 分钟冷却；只在频繁切换后触发，不因一次误触提醒 |
| 专注状态与现有暂停/隐藏冲突 | Medium | 番茄钟计时独立于渲染暂停；宠物隐藏时继续计时但不显示台词，恢复后显示摘要 |

## Test Scenarios

- VS Code 前台 25 分钟：不触发警告，专注完成。
- PowerShell 与浏览器 GitHub 之间切换：不触发警告。
- 误点一次娱乐网站 3 秒后返回工作软件：不触发警告。
- 黑名单应用前台超过 5 秒，且 10 分钟内累计 3 次：触发沈九警告。
- 未知应用前台超过 20 秒，累计达到 90 秒：触发沈九警告。
- 前台窗口 API 报错：分类为 neutral，不触发警告。
- 警告触发后 3 分钟内继续切换非工作软件：不重复刷屏。
- 重启应用后：用户规则保留，未完成番茄钟不自动恢复为进行中。

## Open Questions

- 是否需要在托盘里提供“本次允许当前软件”快捷操作？
- 微信/QQ/Discord 这类既可能工作也可能分心的软件，默认应放入中立、非工作，还是交给用户首次选择？
- 是否需要给番茄钟完成后增加奖励台词或灵力收益？

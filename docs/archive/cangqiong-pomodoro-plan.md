# 实施计划：苍穹山派轻量番茄钟

## Spec Alignment

### Objective

实现本地轻量番茄钟 MVP：用户输入专注时长后，应用打开一个倒计时窗口；专注期间两只宠物从桌面进入该窗口，静止陪伴用户完成倒计时。MVP 不检查前台窗口，不判断用户是否分心，不做警告或监督。

### How Might We

如何让桌宠在不窥探用户工作内容、不增加复杂配置的前提下，提供一个足够可爱、足够低打扰的专注陪伴体验？

### Target User

当前桌宠用户中，想要一个简单番茄钟的人：他们只需要设置时长、看到倒计时，并让岳清源和沈九在窗口里陪着自己，不需要应用判断他们在做什么。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests: `node --test test/pomodoroSystem.test.js test/pomodoroWindow.test.js test/pomodoroTray.test.js`
- Build: `npm run build`

### Project Structure

- `src/systems/PomodoroSystem.js`: 纯倒计时状态机，负责开始、停止、完成、剩余时间快照。
- `main.js`: 托盘入口、番茄钟窗口生命周期、桌面宠物隐藏/恢复、主进程 IPC。
- `preload.js`: 暴露安全的番茄钟 IPC 订阅和命令。
- `src/pomodoro.html`: 番茄钟窗口 HTML。
- `src/pomodoro.css`: 倒计时窗口布局、两只静态宠物、完成态样式。
- `src/pomodoroWindow.js`: 番茄钟窗口渲染逻辑、输入分钟数、倒计时刷新、完成/关闭交互。
- `src/data/i18n.js`: 托盘和番茄钟窗口文案。
- `test/`: 倒计时状态机、托盘入口、窗口 IPC 和安全边界测试。

### Code Style

沿用现有 vanilla JavaScript 和标准 CSS。倒计时逻辑保持可注入时钟的纯状态机；Electron 主进程只管理窗口和 IPC；番茄钟窗口渲染进程只负责 UI，不直接读写 Node API。

### Boundaries

- Always: 用户先输入专注时长，再进入倒计时。
- Always: 分钟输入框默认使用上次专注时长；首次使用或读取失败时 fallback 为 `25` 分钟。
- Always: 倒计时使用绝对 `endAt` 时间计算剩余时间，避免窗口卡顿或系统睡眠后漂移。
- Always: 专注开始后桌面宠物暂停/隐藏，番茄钟窗口内显示两只静态宠物。
- Always: 番茄钟窗口默认置顶，窗口内提供取消置顶/重新置顶的控制。
- Always: 倒计时完成后显示一句温和鼓励台词和完成态，不评价用户是否“成功”专注。
- Always: 手动关闭番茄钟窗口视为结束本次专注，并恢复桌面宠物到专注前状态。
- Always: 番茄钟窗口使用 `contextIsolation`、`sandbox` 和 preload 暴露的最小 API。
- Ask first: 新增统计、历史记录、奖励系统、专注失败判定或用户配置页。
- Never: 检查前台窗口、读取浏览器 URL、扫描进程、记录用户打开的软件或网页。
- Never: 强制锁屏、拦截应用、遮挡其他软件、惩罚用户。

### Success Criteria

- 用户可以从托盘打开番茄钟入口。
- 用户可以输入一个合理的专注分钟数并开始倒计时，下一次打开时默认使用上次时长。
- 倒计时窗口显示剩余时间和两只静止宠物。
- 番茄钟窗口默认置顶，用户可以在窗口内取消置顶。
- 专注期间桌面上的两只宠物不再乱走，视觉上“进入”倒计时窗口。
- 倒计时完成后显示完成态和温和鼓励台词，用户关闭窗口后桌面宠物恢复。
- 手动关闭或取消专注不会破坏移动、拖拽、隐藏、暂停和托盘现有功能。
- `npm test` 和 focused tests 通过。

### Testing Strategy

先用 fake clock 测 `PomodoroSystem` 的开始、剩余时间、完成和停止；再测 `main.js` 的托盘入口、窗口创建、关闭恢复、上次时长偏好和 IPC 注册。番茄钟 UI 用静态 DOM/字符串测试覆盖关键元素，真实窗口用 `npm run dev` 手动验证输入时长、倒计时、置顶切换、完成态台词和宠物恢复。

### Automated Verification Run

- [x] Focused tests: `node --test test/pomodoroSystem.test.js test/pomodoroWindow.test.js test/pomodoroTray.test.js test/pomodoroI18n.test.js test/ipcContracts.test.js test/preloadSubscriptions.test.js` 通过（35 tests）。
- [x] Test all: `npm test` 通过（287 tests）。
- [x] Build: `npm run build` 通过，生成 Windows unpacked 和 NSIS 安装包；构建日志仅有 Electron Builder 依赖链的 `DEP0190` warning。
- [x] 文档/静态核对：确认 `ADR-037`、`docs/structure.md`、番茄钟 i18n key、`activeWindowProvider.js` / `WindowAwarenessSystem.js` 非接入边界均可追踪。

### Manual Verification Remaining

- [x] 从托盘打开番茄钟，确认入口位置、空闲文案和运行中文案符合预期。
- [x] 首次打开确认输入框默认 `25`；输入 `30` 并开始后，再次打开默认 `30`。
- [x] 运行 1 分钟短倒计时，确认倒计时刷新、完成态、鼓励台词和关闭流程自然。
- [x] 运行中点击取消置顶/重新置顶，确认只影响番茄钟窗口。
- [x] 番茄钟窗口与状态窗口、右键菜单同屏查看，确认视觉风格一致，360px 左右宽度下不重叠溢出。
- [x] 专注期间桌面宠物隐藏且不重复出现；完成、提前结束、直接关闭窗口后恢复到开始前状态。
- [x] 开始前分别测试“宠物已隐藏”和“走动已暂停”，确认结束后仍保持原状态。
- [x] 切换 default / birds / animal_ears 皮肤后打开番茄钟，确认窗口内静态宠物跟随皮肤；缺失资源时 fallback 不破图。
- [x] 切换中文、英文、日文后打开或刷新番茄钟，确认窗口文案和置顶/关闭 tooltip 更新。
- [x] 判断用户是否接受“独立小窗口输入时长 + 不做监督”的产品体验。

## Overview

“苍穹山派轻量番茄钟”是陪伴型专注模式，不是监督型专注模式。用户主动设定一个专注时长，随后看到一个小窗口：中央是倒计时，两侧或下方是岳清源和沈九的静态修炼姿态。桌面上的宠物在这段时间暂停并隐藏，避免出现“桌面也有、窗口也有”的重复感。

MVP 的价值在于低打扰和低风险：它不用判断用户是否在工作，也不接触隐私敏感的窗口标题、URL 或进程信息。功能边界越清楚，越容易先做出一个能用、可爱的版本。

## Recommended Direction

采用“独立番茄钟窗口 + 纯倒计时系统 + 静态宠物资源”的方案。

倒计时窗口一开始显示分钟输入框和开始按钮，输入框默认填入上次使用的专注分钟数；开始后切换到倒计时视图。窗口内宠物不复用主窗口里的可拖拽 DOM，而是直接根据当前皮肤显示静态图片，例如 `left_cultivate.webp` 和 `right_cultivate.webp`，缺失时 fallback 到默认皮肤资源。

专注开始时，主进程记录桌面宠物当前可见/暂停状态，然后隐藏或暂停透明宠物窗口；专注结束或窗口关闭时恢复原状态。番茄钟窗口默认置顶，但用户可以在窗口里取消置顶；完成后显示一句温和鼓励台词。这样用户看到的是“两只宠物进入倒计时窗口”，实现上却不需要跨窗口迁移真实 DOM，也不会触碰现有移动系统太多。

## Resolved Product Decisions

- 默认时长：使用上次专注时长，首次使用 fallback 为 `25` 分钟。
- 完成体验：完成态自动显示一句温和鼓励台词。
- 窗口层级：番茄钟窗口默认置顶，用户可以在窗口内取消置顶或重新置顶。

## UI Design Specification

番茄钟窗口沿用现有右键菜单和状态窗口的“仙侠水墨玻璃”系统，不引入新的品牌方向。它应该像一个从状态面板拆出来的“小静室玉牌”：同样的 mist glass、玉色描边、书法标题、细金玉分隔线、内嵌浅色内容块，只把内容换成倒计时和两只静止宠物。

### Existing UI Tokens To Reuse

- **Panel shell:** 复用 `status-panel` 的视觉语言：半透明白玉渐变、`rgba(61, 139, 107, 0.3)` 边框、14px 外圆角、9px inset 内描边、顶部/底部 1px 高光线、`0 12px 30px rgba(30, 42, 54, 0.16)` 阴影。
- **Typography:** 标题使用 `--font-display`，正文和控件使用 `--font-body`，数字倒计时使用 `'JetBrains Mono', 'Geist Mono', monospace`；不要使用浏览器默认按钮/输入框字体。
- **Palette:** 主色只用现有 `--color-jade`、`--color-jade-deep`、`--color-gold`、`--color-ink`、`--color-ink-light`、`--color-mist`、`--color-crimson`。岳清源相关轻微点缀可用 `--color-yueqi`，但不能让窗口变成紫色主题。
- **Controls:** 关闭、置顶、开始、结束按钮复用状态窗口和右键菜单的 hover 规律：玉色 hover 用左侧/底部细线或浅玉背景，危险/关闭 hover 用 `--color-crimson-soft`。
- **Motion:** 打开窗口使用类似 `panelSlideIn` 的 0.35-0.4s ease-out；菜单式小控件可用 `menuReveal` 的轻弹感。倒计时本身不做持续闪烁，避免分心。

### Window Shape

- BrowserWindow 建议内容区约 `420 x 520`，最小约 `360 x 460`，最大约 `520 x 640`。
- `body` 保持透明背景和 10px padding，主容器为 `.pomodoro-panel`，使用与 `status-panel` 相同的外壳结构。
- 标题栏可拖拽，右侧放两个 icon button：置顶切换和关闭。按钮大小 30px，8px 圆角，`app-region: no-drag`。

### Layout States

**Setup state**

```text
┌──────────────────────────────┐
│ 苍穹静修              pin  × │
├──────────────────────────────┤
│        [双宠静修插图]        │
│                              │
│       本次闭关多久？         │
│        [-]  25  [+]          │
│          开始静修            │
│    上次时长会自动记住        │
└──────────────────────────────┘
```

- 中央先显示两只静态宠物，左右相对，尺寸约 96-120px，高度固定，避免切换状态时窗口跳动。
- 分钟输入用一个 `.pomodoro-duration-stepper`，由减号按钮、数字输入、加号按钮组成；数字输入宽 72px，居中，monospace，字号约 24px。
- 主按钮使用玉色渐变背景、深玉文字或白字，宽度约 180px，高度 40px，10px 圆角。
- 辅助文案只保留一句短提示，不解释功能，不写长说明。

**Running state**

```text
┌──────────────────────────────┐
│ 苍穹静修              pin  × │
├──────────────────────────────┤
│        24:18                 │
│      [细玉色进度环/条]       │
│   岳清源       沈清秋          │
│  [静态宠物]   [静态宠物]     │
│          结束本次闭关         │
└──────────────────────────────┘
```

- 倒计时为主视觉，字号约 54-64px，monospace，`font-variant-numeric: tabular-nums`，颜色 `--color-ink`。
- 进度表现用细玉色进度环或 6px 高横向进度条；优先横向条，和状态窗口 stat bar 一致，减少新图形语言。
- 宠物区位于倒计时下方，放在浅色内嵌块中，背景和 `.pet-status-block` 接近。不要再套一层大卡片。
- 结束按钮使用低强调 ghost button，避免误点；hover 使用浅 crimson，但默认不红。

**Completed state**

```text
┌──────────────────────────────┐
│ 苍穹静修              pin  × │
├──────────────────────────────┤
│          已完成              │
│    [双宠静修/轻微光晕]        │
│         修为大有精进         │
│          出关                │
└──────────────────────────────┘
```

- 完成标题用 `--font-display`，字号约 26px，颜色 `--color-jade-deep`。
- 鼓励台词一行到两行，正文色 `--color-ink-light`，不要嘲讽、评分或制造失败感。
- 完成按钮沿用主按钮样式，文案为“收起静室”或等价 i18n。
- 可以给宠物加一次性淡入光晕，但不做循环粒子或长时间动画。

### Component Inventory

- `.pomodoro-panel`: 状态窗口同款玻璃玉牌外壳。
- `.pomodoro-titlebar`: 标题、置顶按钮、关闭按钮；拖拽区。
- `.pomodoro-icon-button`: 30x30 icon button，用 SVG pin / unpin / close 或现有关闭符号。
- `.pomodoro-pets`: 固定高度宠物展示区，setup/running/completed 共用。
- `.pomodoro-duration-stepper`: 减少、输入、增加的紧凑控制组。
- `.pomodoro-timer`: 大号 tabular countdown。
- `.pomodoro-progress`: 与 stat bar 同源的细进度条。
- `.pomodoro-primary-button` / `.pomodoro-ghost-button`: 开始、完成、结束按钮。
- `.pomodoro-message`: 完成态鼓励台词。

### Visual QA Criteria

- 与 `src/status.css` 的 `status-panel` 放在一起看，应像同一套窗口，而不是新页面。
- 与 `src/context-menu.css` 的 hover、边框、阴影和玉色强调一致。
- 桌面截图中，倒计时数字是唯一强焦点；宠物和控件陪衬，不抢注意力。
- 360px 宽时按钮文字、倒计时、宠物不会重叠或溢出。
- 置顶按钮的 pinned/unpinned 状态只靠图标形态和 aria/title 文案区分，不新增长说明文字。

## Key Assumptions to Validate

- [x] 用户愿意在独立小窗口里输入时长，而不是必须在托盘菜单中直接选择预设时间。验证：手动跑通窗口输入流程。
- [x] 静态修炼图足够表达“宠物进入窗口陪伴”。验证：用当前三套皮肤检查资源是否齐全，缺失时 fallback 正常。
- [x] 专注期间隐藏桌面宠物不会让用户困惑。验证：完成/关闭后能稳定恢复，托盘状态文案能说明当前正在专注。
- [x] 不做监督仍然有价值。验证：MVP 只衡量用户是否愿意打开它进行倒计时，而不是是否减少分心。

## MVP Scope

### In

- 托盘菜单增加“开启番茄钟”入口。
- 番茄钟窗口支持用户输入分钟数。
- 记住上次使用的专注分钟数，并作为下次默认值。
- 支持开始、倒计时、完成、手动结束。
- 番茄钟窗口默认置顶，并提供置顶切换。
- 倒计时窗口显示两只静止宠物。
- 完成态显示一句温和鼓励台词。
- 专注期间桌面宠物暂停/隐藏，结束后恢复。
- 基础多语言文案。
- 单元测试覆盖倒计时状态机和主进程窗口边界。

### Out

- 不检查当前前台窗口。
- 不识别工作软件、娱乐网站或聊天软件。
- 不做非工作软件分类规则。
- 不做沈九警告台词。
- 不做专注失败判定。
- 不保存历史统计或生成报表。
- 不新增配置页。

## Architecture Decisions

- 番茄钟窗口使用独立 `BrowserWindow`，类似现有状态窗口和更新窗口的边界，但有自己的 `pomodoro.html` / `pomodoroWindow.js` / `pomodoro.css`。
- 倒计时核心放入 `PomodoroSystem`，用 `startAt`、`durationMs`、`endAt` 推导快照，避免依赖 `setInterval` 的累计误差。
- 主进程拥有番茄钟窗口生命周期，保证窗口关闭、应用退出、托盘刷新都能走同一套恢复逻辑。
- 桌面宠物窗口不迁移真实 DOM。专注窗口只渲染当前皮肤的静态宠物图片，减少跨窗口状态同步。
- 当前皮肤由主进程或 preload 提供给番茄钟窗口；资源缺失时使用 `assets/default/`。
- 不接入 `activeWindowProvider.js`、`activeWindowAwareness.js` 或 `WindowAwarenessSystem.js`。

## Task List

### Phase 1: 倒计时核心

#### Task 1: 新增 PomodoroSystem

**Description:** 新增可单测的倒计时状态机，管理输入时长、开始、停止、完成和快照。

**Acceptance criteria:**
- [x] 支持 `start(durationMinutes, now)` 或等价 API。
- [x] 返回 `idle`、`running`、`completed` 状态。
- [x] 快照包含 `durationMs`、`startedAt`、`endAt`、`remainingMs`、`progress`。
- [x] `remainingMs` 基于 `endAt - now` 计算，不能依赖 interval 累加。
- [x] 非法时长有安全 fallback 或明确错误。

**Verification:**
- [x] fake clock 测试开始、倒计时推进、完成、停止。
- [x] `node --test test/pomodoroSystem.test.js` 通过。

**Dependencies:** None

**Files likely touched:**
- `src/systems/PomodoroSystem.js`
- `test/pomodoroSystem.test.js`

**Estimated scope:** Small

#### Task 2: 定义番茄钟 IPC 合约

**Description:** 在 preload 和主进程之间定义最小 IPC：打开窗口、开始、结束、读取/保存上次时长、切换置顶、订阅状态变化。

**Acceptance criteria:**
- [x] preload 暴露番茄钟相关最小 API。
- [x] IPC channel 命名清晰，例如 `pomodoro-start`、`pomodoro-stop`、`pomodoro-state`。
- [x] 支持读取和保存 `lastPomodoroMinutes`，首次使用 fallback 为 `25`。
- [x] 支持切换番茄钟窗口 `alwaysOnTop` 状态。
- [x] 新增或迁移后的 invoke 优先返回 `{ success, data }` / `{ success, error }` 形状。
- [x] renderer 无法直接访问 Node API。

**Verification:**
- [x] preload 订阅测试覆盖新增 channel。
- [x] IPC handler 测试覆盖成功和失败结果。

**Dependencies:** Task 1

**Files likely touched:**
- `main.js`
- `preload.js`
- `ipcContracts.js`
- `test/preloadSubscriptions.test.js`
- `test/ipcContracts.test.js`

**Estimated scope:** Small

### Checkpoint: 核心可测

- [x] 倒计时状态机不依赖 Electron。
- [x] IPC 边界明确。
- [x] 还没有引入前台窗口读取或软件分类。

### Phase 2: 番茄钟窗口

#### Task 3: 新增番茄钟窗口文件

**Description:** 新增 `pomodoro.html`、`pomodoroWindow.js` 和 `pomodoro.css`，实现输入态、倒计时态和完成态。

**Acceptance criteria:**
- [x] UI 符合本计划的 `UI Design Specification`，复用状态窗口和右键菜单的视觉系统。
- [x] 主容器、标题栏、按钮、内嵌宠物区的圆角、阴影、边框和字体与 `status.css` / `context-menu.css` 保持一致。
- [x] 输入态包含分钟输入框和开始按钮。
- [x] 分钟输入框默认显示上次使用的专注时长，首次使用显示 `25`。
- [x] 倒计时态显示 `MM:SS` 或 `HH:MM:SS`。
- [x] 窗口内有置顶切换控件，当前状态可见。
- [x] 完成态显示完成文案、温和鼓励台词和关闭按钮。
- [x] 关闭按钮调用 preload 暴露的结束/关闭 API。
- [x] UI 不依赖主桌宠窗口 DOM。

**Verification:**
- [x] 静态测试确认关键 DOM id/class 和脚本引用存在。
- [x] 手动视觉检查：番茄钟窗口与状态窗口、右键菜单同屏时风格一致。
- [x] `npm run dev` 手动验证默认时长、输入、倒计时刷新、置顶切换和完成态。

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `src/pomodoro.html`
- `src/pomodoroWindow.js`
- `src/pomodoro.css`
- `test/pomodoroWindow.test.js`

**Estimated scope:** Medium

#### Task 4: 渲染静态陪伴宠物

**Description:** 番茄钟窗口根据当前皮肤显示静态陪伴宠物：初始页保留两只单人修炼图，倒计时页显示 `cultivate.webp` 组合图，完成页显示 `kiss.webp`。

**Acceptance criteria:**
- [x] 初始页显示岳清源和沈九两只宠物。
- [x] 当前皮肤存在 `left_cultivate.webp` / `right_cultivate.webp` / `cultivate.webp` / `kiss.webp` 时优先使用。
- [x] 当前皮肤资源缺失时 fallback 到 `assets/default/`。
- [x] 图片有固定尺寸约束，窗口缩放时不挤压倒计时文本。

**Verification:**
- [x] 测试覆盖资源路径 fallback。
- [x] 手动切换皮肤后打开番茄钟，确认窗口内宠物跟随当前皮肤。

**Dependencies:** Task 3

**Files likely touched:**
- `main.js`
- `src/pomodoroWindow.js`
- `src/pomodoro.css`
- `test/pomodoroWindow.test.js`

**Estimated scope:** Small

### Phase 3: 主进程窗口与托盘集成

#### Task 5: 创建和管理 Pomodoro BrowserWindow

**Description:** 在主进程中创建独立番茄钟窗口，并管理打开、聚焦、关闭、完成后的生命周期。

**Acceptance criteria:**
- [x] 重复点击托盘入口不会创建多个番茄钟窗口。
- [x] 已存在窗口时聚焦已有窗口。
- [x] 窗口创建后默认 `alwaysOnTop: true`。
- [x] 置顶切换只影响番茄钟窗口，不改变主透明桌宠窗口层级策略。
- [x] 窗口启用 `contextIsolation`、`sandbox`、禁用 Node integration。
- [x] 窗口关闭时停止本次专注并触发桌面宠物恢复。
- [x] 应用退出时清理窗口和 timer。

**Verification:**
- [x] 主进程测试覆盖单例窗口创建和关闭清理。
- [x] `npm test` 通过。

**Dependencies:** Task 2, Task 3

**Files likely touched:**
- `main.js`
- `test/pomodoroTray.test.js`
- `test/updateProgressSecurity.test.js`

**Estimated scope:** Medium

#### Task 6: 托盘菜单增加番茄钟入口

**Description:** 在托盘菜单中增加番茄钟入口和运行中状态展示。

**Acceptance criteria:**
- [x] 空闲时显示“开启番茄钟”。
- [x] 运行中显示剩余分钟或“番茄钟进行中”。
- [x] 运行中点击可打开/聚焦番茄钟窗口。
- [x] 托盘菜单刷新不影响皮肤、暂停、隐藏、更新、退出入口。

**Verification:**
- [x] `skinTray.test.js` 或 `pomodoroTray.test.js` 覆盖菜单结构。
- [x] 手动验证托盘入口和运行中状态。

**Dependencies:** Task 5

**Files likely touched:**
- `main.js`
- `src/data/i18n.js`
- `test/pomodoroTray.test.js`

**Estimated scope:** Small

#### Task 7: 专注期间隐藏/恢复桌面宠物

**Description:** 专注开始时记录桌面宠物原始可见/暂停状态并隐藏或暂停主透明窗口，结束后恢复。

**Acceptance criteria:**
- [x] 专注开始后桌面上不再显示两只移动宠物。
- [x] 专注结束后恢复到开始前的可见状态。
- [x] 如果用户开始前已经隐藏宠物，结束后仍保持隐藏。
- [x] 如果用户开始前已经暂停走动，结束后仍保持暂停。
- [x] 恢复逻辑在完成、手动结束、窗口关闭、应用退出前路径一致。

**Verification:**
- [x] 主进程测试覆盖开始前可见/隐藏/暂停组合。
- [x] 手动验证完成和手动关闭都会恢复正确。

**Dependencies:** Task 5

**Files likely touched:**
- `main.js`
- `src/app.js`
- `preload.js`
- `test/pomodoroTray.test.js`

**Estimated scope:** Medium

### Checkpoint: 可用 MVP

- [x] 用户可以从托盘打开番茄钟。
- [x] 用户输入分钟数后看到倒计时。
- [x] 宠物显示在倒计时窗口里。
- [x] 桌面宠物在专注期间不重复出现。
- [x] 完成或关闭后桌面宠物恢复。

### Phase 4: 文案、完成体验和文档

#### Task 8: 增加番茄钟文案

**Description:** 为托盘、输入态、倒计时态、完成态增加 i18n 文案。

**Acceptance criteria:**
- [x] 中文、英文、日文 UI key 均存在。
- [x] 缺少翻译时 fallback 不显示 raw key。
- [x] 完成态包含一句温和鼓励台词，不评价用户是否成功专注。
- [x] 置顶/取消置顶控件文案可翻译。

**Verification:**
- [x] i18n fallback 测试通过。
- [x] 手动切换语言后番茄钟窗口文案刷新或下次打开生效。

**Dependencies:** Task 3, Task 6

**Files likely touched:**
- `src/data/i18n.js`
- `test/i18nFallback.test.js`

**Estimated scope:** Small

#### Task 9: 更新架构文档

**Description:** 将轻量番茄钟窗口和隐私边界写入结构文档。

**Acceptance criteria:**
- [x] `docs/structure.md` 包含 PomodoroSystem 和番茄钟窗口说明。
- [x] 文档说明番茄钟不检查前台窗口、不读取 URL、不记录软件使用。
- [x] 文档说明桌面宠物隐藏/恢复由主进程管理。

**Verification:**
- [x] 文档链接和文件名正确。
- [x] 与本计划保持一致。

**Dependencies:** Task 1-8

**Files likely touched:**
- `docs/structure.md`

**Estimated scope:** Small

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 系统睡眠或窗口卡顿导致倒计时不准 | Medium | 使用 `endAt - Date.now()` 推导剩余时间，不累计 interval tick |
| 番茄钟窗口关闭后桌面宠物没有恢复 | High | 主进程集中管理 `finishPomodoroSession()`，完成、关闭、退出都调用同一路径 |
| 当前皮肤缺少修炼静态图 | Medium | 资源路径 fallback 到 `assets/default/`，并为缺失资源加测试 |
| 用户开始前已经隐藏或暂停宠物 | Medium | 开始时记录原状态，结束时按原状态恢复，而不是一律显示/恢复走动 |
| 新窗口抢占太多注意力 | Low | 窗口保持小尺寸、简洁布局，只显示输入/倒计时/完成，不做弹窗刷屏 |

## Test Scenarios

- 首次从托盘打开番茄钟：输入框默认 `25`。
- 输入 `30` 并开始，结束后再次打开：输入框默认 `30`。
- 输入非法值、空值或过大值：显示校验提示或使用安全范围，不崩溃。
- 倒计时进行中再次点击托盘入口：聚焦已有窗口，不创建第二个窗口。
- 番茄钟窗口默认置顶；点击取消置顶后窗口不再保持在最前，再次点击可恢复置顶。
- 倒计时进行中桌面宠物隐藏，窗口内显示两只静态宠物。
- 倒计时完成：窗口显示完成态和温和鼓励台词，关闭后桌面宠物恢复。
- 倒计时未完成时关闭窗口：本次专注结束，桌面宠物恢复。
- 开始前用户已隐藏宠物：倒计时结束后仍保持隐藏。
- 开始前用户已暂停走动：倒计时结束后仍保持暂停。
- 切换皮肤后打开番茄钟：窗口内宠物使用当前皮肤，缺失时 fallback。
- 系统睡眠/恢复后：剩余时间按真实时间推进，不出现负数或卡住。

## Not Doing

- 不做前台窗口检查。
- 不做工作/非工作软件分类。
- 不读取窗口标题、进程路径、浏览器 URL 或域名。
- 不做分心统计、警告冷却或沈九监督台词。
- 不阻止用户使用任何软件。
- 不做历史记录、日历同步、云同步或账号系统。
- 不为了番茄钟修改 `activeWindowProvider.js`、`activeWindowAwareness.js` 或 `WindowAwarenessSystem.js`。

## Future Considerations

- 后续可以再决定是否记住“取消置顶”的偏好；MVP 每次打开都默认置顶，只在当前窗口会话内允许用户取消或恢复置顶。

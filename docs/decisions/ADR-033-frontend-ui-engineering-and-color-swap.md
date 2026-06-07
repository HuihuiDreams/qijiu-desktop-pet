# ADR-033: Frontend UI Engineering & Theme Color Swap

## Status
Accepted

## Date
2026-06-06

## Context
随着桌宠项目的迭代，原本的 `src/index.css` 承载了太多的功能样式（接近 800 行），包括右键菜单、全局重置、修仙状态面板、对话气泡和特效光晕等。此外，样式表中存在大量的“裸写（Hardcoded）”颜色、间距和圆角数值，例如沈九的紫色系 `#5b2c70` 和 `#9b59b6`，以及各种散落的 `#6ec6a0`（Jade）。这使得 UI 的后续维护、批量调整（如适配深色模式或更改角色配比）变得异常困难。

同时，用户反馈岳七和沈九的专属颜色在角色设定上似乎存在错位，因此需要调换他们的主题色。

## Decision
为了提升代码的可维护性，并解决样式错位问题，我们进行了以下“前端工程化”改造：

### 1. 组件化拆分 (CSS Modularization)
我们将原本庞大的 `index.css` 按功能领域进行了彻底拆解。主文件仅保留全局重置、CSS 变量、字体加载以及最核心的桌面小人基础样式。其他特定组件的样式被拆分到以下独立的文件中，并通过 `index.html` 依次引入：
- `context-menu.css`：管理自定义右键菜单。
- `dialog-bubble.css`：管理单人、双人对话气泡。
- `effects.css`：管理修仙灵力汇聚、悬浮光晕等所有纯视觉效果。

### 2. 引入设计令牌 (Design Tokens)
在 `index.css` 的 `:root` 节点下，我们系统化地补充了 Design Tokens：
- **间距 (Spacing)**：`--space-xs` 到 `--space-xl`。
- **圆角 (Radius)**：`--radius-sm` 到 `--radius-lg`。
- **角色专属色 (Character Colors)**：为岳七和沈九各自建立了完整的颜色层级变量（包含基础色、加深色、发光色，以及渐变所需的亮/暗过渡色）。

### 3. 主题色互换与语义修正 (Theme Color Swap)
基于用户反馈，我们完成了两人的专属颜色互换：
- **沈九** 现在的专属色为 `Jade`（灵玉绿系列）。
- **岳七** 现在的专属色为 `Purple`（紫玉色系列）。

在互换颜色的同时，为保证后续代码的强语义性，我们将 `:root` 中相关的 CSS 变量名称也进行了全量更名（原本的 `--color-shenjiu` 变为了 `--color-yueqi`，原本的 `--color-yueqi-light` 变为了 `--color-shenjiu-light`），确保样式类的实际呈现和变量的语义指代严格一致。

### 4. 逻辑面条代码消除
在拆分 CSS 的同时，顺带清理了 `app.js` 中关于时间跳跃、离线结算的三处重复逻辑，将其统一提取为 `handleOfflineReturn(offlineMs)` 方法，进一步降低了 UI/交互逻辑的耦合度。

## Alternatives Considered
### 仅在 CSS 中交换颜色值而不改变量名
- Pros: 改动极小，只需要修改两行代码（把 `.pet--yueqi` 的背景色设为原先的沈九变量）。
- Cons: 会导致后续维护时的巨大认知负担（看到 `--color-shenjiu` 实际上呈现的是岳七的颜色），语义完全错乱。
- Rejected: 不符合前端工程化中“语义明确”的基础原则。

### 引入 Tailwind 或 SASS 预处理器
- Pros: 能够更方便地管理 Tokens 和组件类名。
- Cons: 项目当前是基于 Vanilla HTML/JS/CSS，引入构建工具会增加本地开发和打包测试的复杂度，不符合最小化依赖原则。
- Rejected: 使用原生 CSS 原生变量（CSS Custom Properties）足以满足当前维护需求。

## Consequences
- **样式隔离度极大提升**：开发者可以专注于特定组件的 CSS（如仅调整菜单），降低了无意间破坏基础小人样式的风险。
- **一处修改，全局生效**：引入 Design Tokens 后，未来调整颜色比例或圆角风格只需修改 `:root` 中的代码。
- **角色语义准确**：颜色变量名的全量更名消除了认知心智负担，`.pet--yueqi` 明确对应 `--color-yueqi` 变量。
- **文件管理成本微增**：`index.html` 头部需要维护额外的 `<link>` 标签，但这相较于带来的可维护性提升是可接受的。

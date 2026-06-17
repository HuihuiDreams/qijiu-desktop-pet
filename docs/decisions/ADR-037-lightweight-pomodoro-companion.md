# ADR-037: 轻量番茄钟陪伴模式

## Status
Accepted

## Date
2026-06-17

## Context
用户希望桌宠提供一个更简单的番茄钟：输入专注时长后打开倒计时窗口，专注期间两只宠物静止出现在窗口里陪伴用户。这个需求的核心是陪伴和低打扰，而不是监督用户是否真的在工作。

此前的番茄钟设想曾讨论过前台窗口检查、非工作软件判定、警告台词或检查窗口等能力。但这些能力会把功能从“用户主动开启的倒计时”推向“应用判断用户行为”的方向，带来更高的隐私风险、误判风险和维护成本。当前 MVP 应该先交付可爱、明确、可控的本地体验。

本功能还会触碰多个已有边界：

- 主进程窗口管理：新增独立 `BrowserWindow`。
- preload IPC：新增开始、停止、读取状态、切换置顶等最小 API。
- 桌面宠物可见性：专注期间需要让桌面宠物视觉上“进入”番茄钟窗口。
- 皮肤资源：番茄钟窗口需要显示当前皮肤的两只静态宠物。
- i18n 和文档：新增用户可见文案和隐私边界说明。

## Decision
采用“独立番茄钟窗口 + 纯倒计时状态机 + 静态宠物陪伴”的轻量实现。

### Runtime Model

- 新增 `src/systems/PomodoroSystem.js`，只负责倒计时状态：`idle`、`running`、`completed`。
- 倒计时基于 `startedAt`、`durationMs` 和 `endAt` 推导 `remainingMs`，不依赖 `setInterval` 累加，减少窗口卡顿或系统睡眠后的时间漂移。
- 主进程拥有番茄钟会话和窗口生命周期，托盘入口只打开或聚焦同一个窗口。
- 分钟数输入通过 `normalizePomodoroMinutes()` 归一化，默认使用上次时长，首次或非法输入回退到 25 分钟，并限制最大时长。

### Window and UI

- 番茄钟使用独立 `BrowserWindow`，加载本地 `src/pomodoro.html`、`src/pomodoro.css` 和 `src/pomodoroWindow.js`。
- 窗口启用 `contextIsolation`、`sandbox`，禁用 Node integration，并使用严格 CSP。
- UI 复用状态窗口和右键菜单的玉色玻璃视觉系统，不引入新的视觉品牌。
- 窗口默认置顶，但用户可以在窗口内取消置顶或重新置顶；该设置只影响番茄钟窗口，不改变主桌宠窗口的置顶守卫。
- 完成态显示温和鼓励台词，不评分、不羞辱、不判断用户是否“失败”。

### Pet Visibility

- 专注开始时，主进程记录专注前的暂停状态，并设置独立 `pomodoroPetHidden` 覆盖态。
- 专注期间桌面宠物隐藏并暂停移动；番茄钟窗口内显示两只静态宠物。
- 完成、手动停止或关闭番茄钟窗口时，恢复专注前的隐藏/暂停状态。
- 番茄钟隐藏状态与手动隐藏、会议自动隐藏分离，避免结束专注后错误显示用户原本隐藏的宠物。

### Static Pet Assets

- 番茄钟窗口不迁移主窗口里的宠物 DOM。
- 窗口内宠物使用当前皮肤的 `left_cultivate.webp` 和 `right_cultivate.webp`。
- 当前皮肤缺少对应资源时，回退到 `assets/default/`。

### Privacy Boundary

番茄钟不接入窗口感知、会议检测或其他行为识别系统：

- 不检查前台窗口。
- 不读取窗口标题。
- 不读取浏览器 URL 或标签页标题。
- 不扫描用户当前使用的软件来判断专注状态。
- 不记录专注期间打开过哪些应用或网页。
- 不做工作/非工作软件分类。
- 不做分心警告、失败判定或惩罚逻辑。

## Alternatives Considered

### 前台窗口检查与非工作软件判定

- Pros: 可以做更“监督式”的专注提醒。
- Cons: 需要判断用户当前窗口、进程、标题或 URL，隐私边界更敏感；不同用户的“工作软件”定义也不稳定，误判会破坏体验。
- Rejected: 本次目标是陪伴型番茄钟，不是监督型专注检测。

### 将宠物真实 DOM 从主窗口迁移到番茄钟窗口

- Pros: 视觉上最像两只宠物真的进入窗口。
- Cons: Electron 窗口之间不能简单共享 DOM；迁移会牵连 `PetRenderer`、拖拽、SpriteView、互动和主 game loop，风险远高于 MVP 收益。
- Rejected: 静态资源足够表达陪伴，同时保持实现边界小。

### 在主透明窗口内做番茄钟遮罩

- Pros: 可以复用主窗口 renderer。
- Cons: 主窗口覆盖虚拟桌面且默认点击穿透，做可交互遮罩会干扰现有鼠标穿透、拖拽和多屏边界；窗口也不容易表现为普通小倒计时窗口。
- Rejected: 独立窗口更符合现有状态窗口模式，也更容易控制置顶和关闭生命周期。

### 直接复用久坐提醒或会议检测状态

- Pros: 可以少加一个可见性状态。
- Cons: 番茄钟是用户主动开启的专注会话，语义不同于会议自动隐藏和久坐提醒。混用状态会让恢复逻辑更难推理。
- Rejected: 使用独立 `pomodoroPetHidden` 覆盖态，和其他隐藏原因组合计算可见性。

### 保存专注历史、统计或奖励

- Pros: 后续可以形成更完整的生产力功能。
- Cons: 会扩大数据模型和隐私说明；用户当前只要求简单输入时间和倒计时。
- Rejected: MVP 只保存上次使用的分钟数。

## Consequences

- 用户获得一个低打扰、可控的本地倒计时窗口。
- 实现不会读取用户工作内容、浏览内容或应用使用历史。
- 番茄钟窗口和主桌宠窗口保持清晰边界，减少对移动、互动、拖拽和多屏逻辑的影响。
- 未来若要增加统计、历史记录、奖励或监督式检测，需要另写计划和 ADR，不能在本决策下顺手扩展。
- 自动化测试需要覆盖倒计时状态机、窗口安全边界、preload API、托盘入口、输入归一化和宠物隐藏/恢复状态。

## Verification

- `test/pomodoroSystem.test.js` 覆盖开始、剩余时间、完成、停止和非法输入 fallback。
- `test/pomodoroWindow.test.js` 覆盖窗口文件、严格 CSP、关键 UI 元素和安全 DOM 更新。
- `test/pomodoroTray.test.js` 覆盖主进程窗口创建、托盘入口、IPC handler 和宠物隐藏/恢复边界。
- `test/ipcContracts.test.js` 覆盖 `normalizePomodoroMinutes()`。
- `test/preloadSubscriptions.test.js` 覆盖 preload 暴露的番茄钟 API 与 `pomodoro-state` 订阅。

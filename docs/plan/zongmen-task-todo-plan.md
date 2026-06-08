# 实施计划：宗门事务 To-Do List

## Spec Alignment

### Objective

实现状态窗口内的轻量 To-Do MVP：用户可以创建、完成、删除简单任务，完成任务获得灵石或指定角色好感度奖励，并为后续商店/养成经济留下稳定数据结构。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests: `node --test test/taskSystem.test.js test/timeSystem.test.js`
- Build: `npm run build`

### Project Structure

- `src/systems/TaskSystem.js`: 任务、奖励和经济的纯逻辑。
- `src/systems/TimeSystem.js`: 持久化快照接入点。
- `src/statusWindow.js` / `src/status.html` / `src/status.css`: 状态窗口任务 UI。
- `src/ui/StatusBar.js`: 状态快照展示。
- `main.js` / `preload.js`: 状态窗口到主窗口的安全 IPC。
- `test/`: 任务逻辑、持久化、IPC 和 UI 行为测试。

### Code Style

使用现有 vanilla JavaScript 风格：任务和经济逻辑放在可单测的系统类/纯函数中；UI 只负责收集输入和渲染状态；数据对象字段使用清晰英文名，如 `rewardType`、`rewardAmount`、`completedAt`，避免把中文展示文案写进存档结构。

### Boundaries

- Always: 任务奖励只能由主 renderer 的任务动作流发放，避免状态窗口直接改宠物对象。
- Always: 任务标题需要长度限制和空值校验。
- Always: 已完成任务重复点击不得重复发奖。
- Ask first: 引入商店、价格体系、每日任务、提醒通知或多用户同步。
- Never: 把任务内容发送到外部服务，或把状态窗口直接接入 Node API。

### Success Criteria

- 用户能在状态窗口新增、完成、删除任务。
- 普通灵石任务完成后 `spiritStones`、累计获得和当日获得同步增加。
- 好感度任务完成后只增加目标角色的好感度。
- 重启后未完成任务、最近完成任务和灵石余额保持一致。
- `npm test` 通过，任务系统 focused tests 通过。

### Testing Strategy

先用纯逻辑测试锁定 TaskSystem 的创建、完成、删除、去重发奖和旧数据 fallback，再测 TimeSystem 持久化，最后手动打开状态窗口验证新增、完成、删除和刷新后的 UI 一致性。

## Overview

“宗门任务”是一个轻量待办事项系统：用户可以记录、完成和删除简单任务；完成任务后获得“灵石”或好感度奖励，让现实待办和桌宠养成产生连接。MVP 重点是可用、稳定、低打扰：不做复杂项目管理，不做提醒日历，不做云同步，也不做多人任务。本计划不实现商店 UI，但必须先定义灵石的经济边界，避免只开放产出、不控制价值尺度而导致后续通货膨胀。

How Might We: 如何让用户在照顾桌宠的同时，把真实世界的小任务完成感转化成修仙世界里的奖励反馈？

## Recommended Direction

采用“状态窗口内新增任务页”的方案。现有应用已经有独立 `StatusWindow`，并通过主进程 IPC 管理窗口生命周期、数据同步和尺寸自适应；把 To-Do 放进这个窗口，比在透明桌宠层上塞复杂表单更稳，也不会破坏点击穿透逻辑。

奖励系统先做两类：灵石和好感度。灵石作为新资源存在于全局存档中，未来可用于皮肤、房间装饰、低频消耗道具或剧情解锁；好感度直接复用现有宠物属性，让完成任务立刻有情感反馈。默认任务完成奖励为 `+1 灵石`，重要任务可选择 `+3 灵石` 或 `+2 好感度`。MVP 不做被动收入、连续签到倍率或随机暴击奖励，先用稳定、低上限的产出节奏保护后续经济系统。

## MVP Scope

### In Scope

- 新增任务列表：添加、完成、删除任务。
- 每个任务包含：标题、奖励类型、奖励数量、创建时间、完成时间。
- 状态窗口新增两个 Tab：`状态` 和 `宗门任务`。
- 完成任务时发放奖励：灵石进入全局账户，好感度可加给指定角色或默认加给沈九。
- 保存任务列表、灵石余额和已完成任务摘要。
- 完成任务后触发简短对话和视觉反馈。

### Not Doing

- 不做截止日期、重复任务、子任务、标签、搜索。
- 不做任务提醒、系统通知、日历集成。
- 不做任务难度自动判断或 AI 拆解。
- 不实现商店 UI、购买流程或道具效果；但要先定义未来消费方向、价格尺度和存档字段。
- 不做云同步或导入导出。

## Core Design

### Data Model

新增 `TaskSystem` 负责待办和奖励逻辑。建议数据结构：

```javascript
{
  tasks: [
    {
      id: "task_...",
      title: "整理今日笔记",
      rewardType: "spiritStones",
      rewardAmount: 1,
      targetPetId: "shenjiu",
      completed: false,
      createdAt: 1710000000000,
      completedAt: null
    }
  ],
  economy: {
    spiritStones: 0,
    lifetimeSpiritStonesEarned: 0,
    lifetimeSpiritStonesSpent: 0,
    dailySpiritStoneEarnings: {
      date: "YYYY-MM-DD",
      amount: 0
    },
    rewardVersion: 1
  },
  completedTaskCount: 0
}
```

### Reward Rules

- 默认奖励：`spiritStones +1`
- 重要任务：`spiritStones +3`
- 好感度任务：`affection +2`
- 任务类型不自动猜测，必须由用户在创建任务时选择“任务奖励”。
- 新建任务默认选择 `灵石 +1`，降低输入成本。
- 好感度任务必须指定目标角色，例如 `沈九好感 +2` 或 `岳七好感 +2`。
- 好感度奖励应保持稀有，适合用户主动标记为“想献给某个角色”的任务；普通日常待办默认走灵石奖励。
- 每个任务只能领取一次奖励。
- 完成灵石任务时同时增加 `spiritStones`、`lifetimeSpiritStonesEarned` 和当日 `dailySpiritStoneEarnings.amount`。
- 已完成任务保留在“近日完成”区域，MVP 最多展示最近 10 条。
- 空标题、纯空格标题不允许创建。
- 标题长度限制为 40 个字符，超出时 UI 阻止提交或截断前提示。

### Economy Guardrails

本期不做商店，但要把灵石当成真实货币系统设计，而不是只做一个计数器。

核心原则：

- 灵石只能由用户主动完成任务获得；MVP 不提供挂机、签到、随机掉落或后台被动增长。
- 奖励值保持离散且小：普通任务 `+1`，重要任务 `+3`。暂不做按任务标题、长度或频率自动估价。
- 好感度不是灵石的替代货币。它奖励情感选择，不能和灵石互相兑换。
- 灵石余额不得为负；未来消费必须先校验余额，再一次性扣款和发放物品。
- `rewardVersion` 用于未来调整奖励倍率或迁移旧存档，避免直接改历史含义。
- `lifetimeSpiritStonesEarned` 和 `lifetimeSpiritStonesSpent` 用于未来观察经济健康，不参与当前 UI 展示也可以。

未来消费优先级：

| 消费类型 | 建议定位 | 价格尺度 |
|----------|----------|----------|
| 皮肤/外观色 | 长期目标，一次性解锁 | 80-300 灵石 |
| 房间/背景装饰 | 中期收集目标，一次性解锁 | 40-160 灵石 |
| 小道具/食物 | 低频消耗，触发短反馈或动画 | 3-15 灵石 |
| 剧情/语音片段 | 高价值收藏，不影响基础养成 | 120-400 灵石 |
| 任务栏扩展/便利功能 | 谨慎使用，不能让基础体验变差 | 30-100 灵石 |

价格尺度以“任务天数”而不是绝对数字来理解：如果用户平均每天完成 3-8 个普通任务，小道具应当天可买，普通装饰需要约一周，稀有外观需要数周。不要为了制造目标感而把第一个可消费物品定得太贵，否则灵石会在早期变成无反馈数字。

健康指标：

- 观察平均每日灵石产出，目标区间暂定为 3-12。
- 观察普通用户首次达到 30、100、300 灵石需要的天数。
- 未来上线商店前，至少准备一个低价消耗项、一个中价装饰项和一个长期外观项，避免只有高价目标。
- 如果用户余额长期只涨不降，优先新增温和消费项，而不是提高任务奖励。
- 如果多数用户无法负担基础消费，优先下调价格，而不是增加奖励倍率。

### 区分灵石任务和好感度任务

区分方式放在创建任务表单中，由用户明确选择奖励，而不是根据标题或内容自动判断。

推荐 UI：

```text
任务标题：[________________]
奖励：   [灵石 +1] [灵石 +3] [沈九好感 +2] [岳七好感 +2]
```

对应数据字段：

```javascript
{
  title: "整理今日笔记",
  rewardType: "spiritStones",
  rewardAmount: 1,
  targetPetId: null
}
```

好感度任务示例：

```javascript
{
  title: "今晚早点休息",
  rewardType: "affection",
  rewardAmount: 2,
  targetPetId: "shenjiu"
}
```

判定规则：

- `rewardType === "spiritStones"`：灵石任务，完成后只增加全局灵石余额。
- `rewardType === "affection"`：好感度任务，完成后增加 `targetPetId` 对应角色的好感度。
- `targetPetId` 只有在好感度任务中必填；灵石任务中必须为 `null`。
- 如果旧存档缺少 `rewardType`，按 `spiritStones +1` 迁移，保证兼容。

### User Flow

1. 用户打开状态窗口。
2. 切到“宗门任务”页。
3. 输入任务标题，选择奖励类型，点击添加。
4. 任务出现在未完成列表。
5. 用户完成后点击完成按钮。
6. 系统发放灵石或好感度奖励，任务移到近日完成。
7. 桌宠显示一句反馈，例如沈九冷淡认可或岳七鼓励。

## Architecture Decisions

- 新增 `src/systems/TaskSystem.js`，保持任务逻辑可单元测试。
- `TimeSystem` 扩展存档字段，或新增独立 `taskState` 存储键；MVP 推荐独立 `taskState`，降低对宠物状态存档的耦合。
- `StatusBar.createSnapshot()` 增加任务与经济快照，传给 `statusWindow.js` 渲染。
- 状态窗口负责任务 UI，渲染进程 `app.js` 负责处理任务动作和奖励发放。
- 任务动作通过现有主窗口与状态窗口数据同步路径完成，不让状态窗口直接改宠物对象。
- 灵石先作为全局资源，不绑定某个角色。

## Task List

### Phase 1: Foundation

#### Task 1: 新增 TaskSystem 纯逻辑

**Description:** 新建任务系统，提供添加、完成、删除、序列化和反序列化能力。

**Acceptance criteria:**
- [ ] 可创建合法任务并生成稳定唯一 id
- [ ] 空标题无法创建
- [ ] 可完成任务且只能发放一次奖励
- [ ] 可删除未完成或已完成任务
- [ ] 可返回未完成任务、最近完成任务和灵石余额

**Verification:**
- [ ] 新增 `test/taskSystem.test.js`
- [ ] 覆盖添加、完成、重复完成、删除、旧数据 fallback
- [ ] `npm test -- --test-name-pattern "TaskSystem"` 通过

**Dependencies:** None

**Files likely touched:**
- `src/systems/TaskSystem.js`
- `test/taskSystem.test.js`

**Estimated scope:** Medium

#### Task 2: 定义奖励与经济配置

**Description:** 在配置层新增宗门任务奖励常量和经济边界配置，避免奖励数值、未来价格尺度和健康指标散落在 UI 里。

**Acceptance criteria:**
- [ ] 存在默认奖励配置
- [ ] 包含普通灵石、重要灵石、好感度三种奖励
- [ ] TaskSystem 使用配置而不是硬编码数值
- [ ] 存在经济配置，记录 `rewardVersion`、每日目标产出区间和未来消费价格尺度
- [ ] 经济配置不启用商店 UI，但能作为后续商店定价依据

**Verification:**
- [ ] 单元测试断言默认奖励值
- [ ] 单元测试断言经济配置存在且数值为正
- [ ] `npm test` 通过

**Dependencies:** Task 1

**Files likely touched:**
- `src/data/config.js`
- `test/taskSystem.test.js`

**Estimated scope:** Small

### Checkpoint: Core Logic

- [ ] TaskSystem 测试通过
- [ ] 奖励规则明确且不可重复领取
- [ ] 不依赖 DOM 或 Electron 即可测试

### Phase 2: Persistence and App Integration

#### Task 3: 持久化任务状态

**Description:** 使用 `electron-store` 保存 `taskState`，并在应用启动时恢复任务和灵石余额。

**Acceptance criteria:**
- [ ] 启动时加载任务列表和灵石余额
- [ ] 添加、完成、删除任务后自动保存
- [ ] 旧用户没有 `taskState` 时使用空任务和 0 灵石
- [ ] 存档损坏或字段缺失时安全 fallback

**Verification:**
- [ ] 新增或扩展 TimeSystem 相关测试
- [ ] 手动重启应用后任务仍存在
- [ ] `npm test` 通过

**Dependencies:** Task 1

**Files likely touched:**
- `src/systems/TimeSystem.js`
- `src/app.js`
- `test/timeSystem.test.js`

**Estimated scope:** Medium

#### Task 4: 应用层发放奖励

**Description:** 在 `app.js` 中接入 TaskSystem，完成任务后修改灵石或宠物好感度，并触发反馈。

**Acceptance criteria:**
- [ ] 完成灵石任务时 `spiritStones` 增加
- [ ] 完成灵石任务时 `lifetimeSpiritStonesEarned` 和当日灵石收入同步增加
- [ ] 完成好感度任务时目标角色 `affection` 增加
- [ ] 完成任务后显示一条对话或特效
- [ ] 重复完成同一任务不会重复加奖励

**Verification:**
- [ ] 使用 debug 方法模拟完成任务
- [ ] 宠物状态窗口能看到好感度变化
- [ ] `npm test` 通过

**Dependencies:** Task 2, Task 3

**Files likely touched:**
- `src/app.js`
- `src/debug.js`
- `src/data/dialogues.js`

**Estimated scope:** Medium

### Checkpoint: Reward Flow

- [ ] 添加任务后能保存
- [ ] 完成任务后奖励到账
- [ ] 重启后任务和灵石余额保留

### Phase 3: Status Window UI

#### Task 5: 状态窗口新增 Tabs

**Description:** 把独立状态窗口拆成“状态”和“宗门任务”两个页签。

**Acceptance criteria:**
- [ ] 默认打开仍显示宠物状态
- [ ] 可切换到宗门任务页
- [ ] 窗口继续自适应高度
- [ ] 关闭按钮和拖拽行为保持正常

**Verification:**
- [ ] 手动打开状态窗口并切换页签
- [ ] 不出现文字溢出或控件重叠
- [ ] `npm test` 通过

**Dependencies:** Task 3

**Files likely touched:**
- `src/status.html`
- `src/statusWindow.js`
- `src/status.css`

**Estimated scope:** Medium

#### Task 6: 实现任务添加与列表 UI

**Description:** 在宗门任务页实现输入框、奖励选择、添加按钮、未完成任务列表和近日完成列表。

**Acceptance criteria:**
- [ ] 用户可输入标题并添加任务
- [ ] 用户可选择奖励类型，默认选中“灵石 +1”
- [ ] 奖励选项明确区分“灵石 +1”“灵石 +3”“沈九好感 +2”“岳七好感 +2”
- [ ] 选择好感度奖励时写入对应 `targetPetId`
- [ ] 未完成任务显示完成和删除按钮
- [ ] 近日完成任务显示奖励摘要
- [ ] 空列表时显示简短空状态

**Verification:**
- [ ] 手动添加、完成、删除任务
- [ ] 创建任务时不选择奖励也会使用默认“灵石 +1”
- [ ] 创建沈九/岳七好感任务后，任务数据包含正确 `targetPetId`
- [ ] 长标题不撑坏窗口
- [ ] `npm test` 通过

**Dependencies:** Task 5

**Files likely touched:**
- `src/statusWindow.js`
- `src/status.css`
- `src/ui/StatusBar.js`

**Estimated scope:** Medium

#### Task 7: 状态窗口到主窗口的任务动作 IPC

**Description:** 让状态窗口通过 IPC 把添加、完成、删除任务动作传回主窗口，由主窗口更新 TaskSystem 和宠物奖励。

**Acceptance criteria:**
- [ ] `preload.js` 暴露任务动作 API
- [ ] 主进程转发状态窗口动作到主窗口
- [ ] 主窗口处理动作后刷新状态窗口数据
- [ ] 状态窗口不直接访问宠物对象

**Verification:**
- [ ] 手动在状态窗口完成任务后主宠物数据变化
- [ ] 状态窗口关闭再打开数据一致
- [ ] `npm test` 通过

**Dependencies:** Task 4, Task 6

**Files likely touched:**
- `main.js`
- `preload.js`
- `src/app.js`
- `src/statusWindow.js`

**Estimated scope:** Medium

### Checkpoint: Usable MVP

- [ ] 用户可通过状态窗口管理任务
- [ ] 完成任务可获得灵石或好感度
- [ ] 状态窗口刷新、关闭、重开都保持一致
- [ ] 现有宠物状态页不退化

### Phase 4: Polish and Documentation

#### Task 8: 对话与反馈打磨

**Description:** 添加宗门任务相关反馈台词，让奖励更有角色感。

**Acceptance criteria:**
- [ ] 完成普通任务有鼓励台词
- [ ] 完成重要任务有更明显反馈
- [ ] 删除任务不触发奖励
- [ ] 台词缺失时有 fallback

**Verification:**
- [ ] 手动完成不同奖励类型任务
- [ ] 不出现 undefined 或空气泡

**Dependencies:** Task 4

**Files likely touched:**
- `src/data/dialogues.js`
- `src/app.js`

**Estimated scope:** Small

#### Task 9: 更新架构文档

**Description:** 将宗门任务系统写入项目结构文档，记录 TaskSystem、状态窗口任务页和存档键。

**Acceptance criteria:**
- [ ] `docs/structure.md` 提到 TaskSystem
- [ ] 文档说明 `taskState` 存档内容
- [ ] 文档说明灵石目前只获得、不消费，但已经预留经济健康字段和未来消费方向

**Verification:**
- [ ] 文档链接和文件名正确
- [ ] 与本计划保持一致

**Dependencies:** Task 1-8

**Files likely touched:**
- `docs/structure.md`
- `CHANGELOG.md`

**Estimated scope:** Small

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 状态窗口 UI 变复杂后影响现有状态展示 | Medium | 用 Tabs 隔离，默认仍显示状态页 |
| 状态窗口直接改数据导致状态不同步 | High | 所有任务动作回到主窗口 `app.js` 处理 |
| 灵石没有消费场景导致奖励空转或囤积 | Medium | MVP 不做商店，但先限制产出、记录累计获得/花费，并定义未来价格尺度 |
| 好感度奖励过快破坏养成节奏 | Medium | 默认好感度奖励低于灵石奖励，重要任务才建议使用 |
| 存档结构变化影响旧用户 | Medium | `taskState` 独立存储，旧数据 fallback 为空任务 |

## Test Scenarios

- 创建普通任务：任务出现在未完成列表。
- 创建空标题任务：不会创建，UI 保持稳定。
- 完成普通灵石任务：灵石 +1，任务移动到近日完成。
- 完成重要灵石任务：灵石 +3。
- 完成好感度任务：目标宠物好感度 +2。
- 重复点击完成：奖励只发一次。
- 删除未完成任务：任务消失，不发奖励。
- 重启应用：未完成任务、近日完成、灵石余额保留。
- 打开状态页再切任务页：宠物状态展示不受影响。

## Open Questions

- 好感度奖励默认给沈九、岳七，还是由用户选择目标角色？
- 是否要允许用户创建任务时标记“重要任务”？
- 灵石未来第一批消费应该优先做低价小道具、房间装饰，还是皮肤解锁？
- 是否需要在 MVP UI 中显示当日灵石收入，还是先只存档不展示？

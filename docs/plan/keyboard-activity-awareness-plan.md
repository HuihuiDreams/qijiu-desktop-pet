# 键盘活动感知计划

> 状态：提议中
> 最后更新：2026-06-04

## Spec Alignment

### Objective

实现隐私友好的键盘活动感知 MVP：只用时间和活跃状态判断用户是否正在短时间输入或持续专注，让桌宠降低移动和互动打扰；不记录按键、文本或应用内容。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests: `node --test test/keyboardActivityService.test.js test/activityAwarenessSystem.test.js test/movementSystem.test.js`
- Build: `npm run build`

### Project Structure

- `keyboardActivityService.js`: 主进程活动观察和 payload 生成。
- `main.js`: 服务生命周期、设置和 IPC 事件发送。
- `preload.js`: 安全订阅 API。
- `src/systems/ActivityAwarenessSystem.js`: renderer 端 typing/focus/idle 状态归纳。
- `src/systems/MovementSystem.js` / `src/systems/InteractionSystem.js`: 依据活动状态降低打扰。
- `docs/decisions/`: 隐私边界 ADR。

### Code Style

使用现有 vanilla JavaScript 风格：活动 observer 和 renderer system 分离；payload 字段保持布尔值和毫秒数，不传原始事件；Movement/Interaction 只消费归纳后的 `typing` / `focus` / `idle` 状态，避免跨系统读取实现细节。

### Boundaries

- Always: payload 只包含时间戳、布尔状态和持续时间，不包含按键、文本、窗口标题或应用内容。
- Always: 功能可关闭，关闭后 renderer 回到现有 idle 行为。
- Always: renderer 不能直接访问 OS 键盘监听或 Node API。
- Ask first: 引入全局键盘 hook、读取输入法内容、增加新动画资产或默认开启更强监督。
- Never: 记录、存储、上传或展示用户输入内容。

### Success Criteria

- 短时间输入被归纳为 `typing`，持续输入被归纳为 `focus`。
- 输入停止后状态能按 TTL 回到 `idle`。
- `typing` / `focus` 时 Movement 和 Interaction 降低打扰，用户主动交互仍可用。
- 功能关闭或信号过期时不影响现有行为。
- `npm test` 和相关 focused tests 通过。

### Testing Strategy

用 fake clock 测主进程 service 的 burst、flow、idle reset 和 disable 行为；用 renderer 系统测试状态 TTL 和 fallback；再跑 Movement/Interaction 相关测试确认打扰降低但主动交互不被禁用。最后用 `npm run dev` 手动观察连续打字时桌宠移动频率下降。

## 概览

新增一个保护隐私的键盘活动感知层，让桌宠可以根据用户的工作节奏作出反应。该功能只检测活动时间，不检测按键值或输入内容。它会把短时间输入、持续输入和停止输入事件转换成 renderer 安全的状态提示，用于影响移动、互动、提醒，以及可选的专用动画。

本计划有意不包含用户导入皮肤或宠物包支持。皮肤仍保持为策划和约稿资产。任何新行为都必须支持优雅降级：当某套约稿皮肤尚未包含打字专用美术时，应用仍能正常表现。

## 目标

- 在不记录按键、文本、应用内容或窗口标题的前提下，检测键盘活动节奏。
- 在短时间输入时，让桌宠进入轻量的“陪伴打字”状态。
- 在持续输入时，让桌宠进入更明显的“专注陪伴”状态。
- 输入停止后，让桌宠回到普通 idle 行为。
- 用户正在积极打字时，减少打扰性的移动和互动。
- 平台权限和隐私文案保持清楚。

## 非目标

- 不做用户皮肤导入/导出系统。
- 不做键盘记录、文本捕获、剪贴板读取或逐键分析。
- 不做按应用区分的生产力评分。
- MVP 不强依赖新动画资产。
- 如果 Electron 支持的 idle/activity 信号足以满足 MVP，不引入 OS 级全局键盘 hook。

## 架构决策

- 主进程拥有输入/活动观察职责。渲染进程只通过 IPC 接收粗粒度活动状态。
- Preload 通过 `window.electronAPI` 暴露安全订阅 API。
- Renderer 通过一个小系统解释行为，例如 `ActivityAwarenessSystem`。
- 活动状态只是建议。拖拽、提醒、睡眠、显式用户互动等高优先级状态激活时，既有系统可以忽略它。
- 专用美术是可选项。缺少 typing/focus 资产时，必须回退到既有 idle、cultivate 或低动态状态。
- 隐私文案应描述为“工作节奏”或“专注陪伴”，避免使用“键盘监控”这类表达。

## 建议活动模型

主进程发送给 renderer 的运行时 payload：

```js
{
  active: true,
  isTyping: true,
  isTypingFlow: false,
  typingIdleMs: 800,
  typingBurstMs: 4200,
  sampledAt: 1791100000000,
  source: "keyboard-activity"
}
```

状态阈值：

- `isTyping`：最近 2-3 秒内有键盘活动。
- `isTypingFlow`：持续打字 20 秒或更久，允许中间出现短暂间隔。
- 输入结束：3 秒没有键盘活动。
- 工作计时重置：更长的不活动窗口，可能与久坐提醒行为共用。

## 依赖图

```text
Main-process activity observer
    -> Preload safe API
        -> Renderer ActivityAwarenessSystem
            -> MovementSystem interruption rules
            -> InteractionSystem cooldown/busy rules
            -> PetRenderer/state presentation fallback
                -> Optional commissioned animation assets
```

## 任务列表

### Phase 1: 活动信号基础

#### Task 1: 定义键盘活动合约

**描述：** 在实现前定义粗粒度活动 payload、阈值和隐私边界。明确哪些数据允许跨 IPC，哪些数据被禁止。

**验收标准：**
- [ ] 合约只包含时间和布尔活动字段。
- [ ] 合约明确禁止按键值、输入文本、剪贴板数据和应用内容。
- [ ] 文档记录短时间输入、持续输入和输入停止的阈值。

**验证：**
- [ ] 计划/ADR review 确认隐私边界清楚。
- [ ] 没有实现任务需要访问输入内容。

**依赖：** 无

**可能触碰文件：**
- `docs/decisions/ADR-032-keyboard-activity-awareness.md`
- `docs/structure.md`

**预估范围：** 小

#### Task 2: 新增主进程活动观察服务

**描述：** 增加一个主进程服务，用于采样键盘活动节奏并发出粗粒度状态更新。优先使用 Electron 支持的 idle/activity API；如果需要平台特定 fallback，应隔离实现并关注权限。

**验收标准：**
- [ ] 服务可以报告 `isTyping`、`isTypingFlow`、`typingIdleMs` 和 `typingBurstMs`。
- [ ] 服务绝不存储或发出按键值。
- [ ] 服务可以通过配置禁用。
- [ ] 服务能处理睡眠/唤醒和长时间 idle，不留下过期 typing 状态。

**验证：**
- [ ] 聚焦单元测试覆盖 burst 开始、burst 延续、flow 阈值、typing 停止和长 idle 重置。
- [ ] `node --test test/keyboardActivityService.test.js`

**依赖：** Task 1

**可能触碰文件：**
- `keyboardActivityService.js`
- `main.js`
- `test/keyboardActivityService.test.js`

**预估范围：** 中

#### Task 3: 暴露安全 IPC 订阅

**描述：** 增加 preload 和主进程 IPC 接线，让 renderer 可以订阅活动更新，但不能直接访问 Node 能力。

**验收标准：**
- [ ] 存在 `window.electronAPI.onKeyboardActivityInfo(callback)` 或等价 API。
- [ ] 订阅会返回 unsubscribe 函数。
- [ ] payload 到达 renderer 前已经归一化。
- [ ] Renderer 不能请求原始键盘数据。

**验证：**
- [ ] IPC/preload 测试覆盖订阅、退订和 malformed payload 处理。
- [ ] `npm test`

**依赖：** Task 2

**可能触碰文件：**
- `main.js`
- `preload.js`
- `test/htmlInjectionHardening.test.js` 或一个聚焦 preload IPC 测试

**预估范围：** 小

### Checkpoint: 信号基础

- [ ] 活动观察器只发出隐私安全的数据。
- [ ] Renderer 可以安全订阅和退订。
- [ ] 功能关闭和开启时，现有测试都通过。

### Phase 2: Renderer 行为

#### Task 4: 新增 ActivityAwarenessSystem

**描述：** 增加一个 renderer system，消费键盘活动信息，并暴露简单行为提示，例如 `idle`、`typing` 或 `focus`。

**验收标准：**
- [ ] 系统会在短 TTL 后忽略过期样本。
- [ ] 系统将 `isTyping` 映射为 `typing`。
- [ ] 系统将 `isTypingFlow` 映射为 `focus`。
- [ ] 禁用、过期或非活跃时返回 `idle`。

**验证：**
- [ ] 单元测试覆盖过期样本、禁用状态、typing 状态、focus 状态和 idle fallback。
- [ ] `node --test test/activityAwarenessSystem.test.js`

**依赖：** Task 3

**可能触碰文件：**
- `src/systems/ActivityAwarenessSystem.js`
- `src/app.js`
- `test/activityAwarenessSystem.test.js`

**预估范围：** 中

#### Task 5: 让 Movement 尊重打字专注

**描述：** 调整移动逻辑，使用户积极打字时桌宠更安静，但不冻结拖拽行为，也不让应用显得无响应。

**验收标准：**
- [ ] `typing` 期间，随机游走频率降低。
- [ ] `focus` 期间，如果有 window awareness 数据，桌宠避免穿越活跃工作区。
- [ ] 拖拽仍然像以前一样暂停和恢复移动。
- [ ] Window awareness 禁用时行为能干净回退。

**验证：**
- [ ] Movement 测试覆盖 typing/focus hints 和既有拖拽暂停行为。
- [ ] `node --test test/movementSystem.test.js`
- [ ] 手动检查：连续打字时确认桌宠打扰减少。

**依赖：** Task 4

**可能触碰文件：**
- `src/systems/MovementSystem.js`
- `src/app.js`
- `test/movementSystem.test.js`

**预估范围：** 中

#### Task 6: 让 Interaction 尊重专注

**描述：** 调整互动时机，让两只桌宠在持续打字时更少打断用户，同时仍保留温柔的 idle 时刻。

**验收标准：**
- [ ] `typing` 期间，互动冷却时间适度增加。
- [ ] `focus` 期间，未开始的新可选互动会被延后。
- [ ] 既有用户主动触发的互动仍然可用。
- [ ] 数值和好感计算保持不变。

**验证：**
- [ ] Interaction 测试覆盖 typing/focus hint 下的冷却和延后行为。
- [ ] `node --test test/nurtureBalance.test.js test/windowAwarenessRendererIntegration.test.js`

**依赖：** Task 4

**可能触碰文件：**
- `src/systems/InteractionSystem.js`
- `src/app.js`
- `test/nurtureBalance.test.js`

**预估范围：** 中

#### Task 7: 展示 typing 和 focus 状态

**描述：** 增加 typing/focus 的视觉表现 hook。初版可以复用既有约稿资产和 fallback class，不要求新增美术。

**验收标准：**
- [ ] `typing` 可以使用轻量的既有 idle/cultivate 表现。
- [ ] `focus` 可以使用平静的既有 cultivate 或低动态表现。
- [ ] 缺少专用资产不会破坏渲染。
- [ ] 状态转换时 sprite 朝向保持稳定。

**验证：**
- [ ] Renderer 测试覆盖 fallback 表现。
- [ ] 手动检查：短时间输入和持续输入展示出微妙但可区分的行为。
- [ ] `npm test`

**依赖：** Task 4

**可能触碰文件：**
- `src/pet/Pet.js`
- `src/pet/PetRenderer.js`
- `src/pet/SpriteView.js`
- `src/systems/SkinManager.js`
- `test/petRenderer.test.js`

**预估范围：** 中

### Checkpoint: 行为 MVP

- [ ] 短时间输入会微妙改变行为。
- [ ] 持续输入会让桌宠更安静。
- [ ] MVP 不需要新增美术。
- [ ] 拖拽、右键菜单、提醒和既有互动仍然正常。

### Phase 3: 控制、隐私与打磨

#### Task 8: 新增设置和托盘开关

**描述：** 增加面向用户的工作节奏感知开关，默认行为保守，文案清晰。

**验收标准：**
- [ ] 托盘/菜单包含启用/禁用控制。
- [ ] 设置通过 `electron-store` 持久化。
- [ ] 禁用功能会清除当前活动状态。
- [ ] 文案说明不会读取输入内容。

**验证：**
- [ ] 托盘/设置测试覆盖默认值、开关、持久化和禁用行为。
- [ ] `node --test test/skinTray.test.js test/i18nFallback.test.js`

**依赖：** Task 3、Task 4

**可能触碰文件：**
- `main.js`
- `src/data/i18n.js`
- `test/skinTray.test.js`
- `test/i18nFallback.test.js`

**预估范围：** 中

#### Task 9: 接入久坐提醒计时

**描述：** 可选地让久坐提醒把键盘活动节奏作为连续工作的更强信号，但不替代现有 idle-based 计时器。

**验收标准：**
- [ ] 持续打字可以计入活跃工作时间。
- [ ] 长时间不活动会重置 typing-derived 工作时间。
- [ ] 活动感知禁用时，既有久坐提醒行为仍然有效。
- [ ] 提醒表现不会打断现有全屏 guard 行为。

**验证：**
- [ ] 久坐提醒测试覆盖 activity awareness 开启和关闭。
- [ ] `node --test test/breakReminderService.test.js test/breakReminder.integration.test.js`

**依赖：** Task 2、Task 8

**可能触碰文件：**
- `breakReminderService.js`
- `keyboardActivityService.js`
- `test/breakReminderService.test.js`
- `test/breakReminder.integration.test.js`

**预估范围：** 中

#### Task 10: 记录隐私边界和行为

**描述：** 更新项目文档，让后续贡献者理解隐私边界、架构放置和 fallback 行为。

**验收标准：**
- [ ] `docs/structure.md` 提到 activity observer 和 renderer system。
- [ ] ADR 记录为什么该功能只观察时间。
- [ ] README 或相关用户文档用友好的语言描述该设置。
- [ ] 提交前更新 `CHANGELOG.md`。

**验证：**
- [ ] 文档链接可以解析。
- [ ] `npm test`

**依赖：** Task 1-9

**可能触碰文件：**
- `docs/structure.md`
- `docs/decisions/ADR-032-keyboard-activity-awareness.md`
- `README.md`
- `CHANGELOG.md`

**预估范围：** 小

### Checkpoint: 完成

- [ ] 所有测试通过：`npm test`。
- [ ] Windows 手动检查确认 typing/focus 转换正常。
- [ ] macOS 手动检查确认没有出现预期之外的权限提示。
- [ ] 功能可以禁用，且不会留下过期 renderer 状态。
- [ ] 隐私边界已记录。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 用户误以为该功能是键盘记录 | 高 | 使用 timing-only payload、清楚命名和明确隐私文案。 |
| 平台特定输入 API 需要额外权限 | 中 | 优先使用 Electron idle/activity 信号；隔离 fallback，并允许禁用功能。 |
| 专注期间桌宠变得太静态 | 中 | 降低打扰但不完全冻结移动；保留微妙 idle/focus 动画。 |
| 既有互动平衡意外变化 | 中 | 数值计算保持不变；只调整冷却和延后规则。 |
| 新美术尚未准备好 | 低 | 使用 fallback 状态和项目中已有约稿资产。 |
| 睡眠/唤醒后活动样本过期 | 中 | suspend/resume 时重置 burst 状态，并在 renderer 应用 TTL。 |

## 开放问题

- 该功能未来应默认开启，还是通过 onboarding/settings opt-in？
- 面向用户的本地化名称应该是“专注陪伴”、“工作节奏感知”，还是另一个更柔和的说法？
- `focus` 的首个 fallback 动画应使用 cultivate、idle，还是新增低动态 class？
- 持续打字时只抑制新的自动互动，还是也延后一部分饥饿/心情视觉抱怨？

## 并行机会

- Task 1 文档和 Task 2 服务设计可以在 payload 合约确认后并行起草。
- Task 5 movement 和 Task 6 interaction 可以在 Task 4 后并行推进。
- Task 8 设置文案和 Task 10 文档可以与最终行为打磨并行推进。

## 建议 MVP 范围

最小有用版本建议实现 Task 1-5 和 Task 8。这样可以得到隐私安全信号、renderer 行为提示、打字时更安静的移动，以及一个用户可见的开关。互动调优、久坐提醒集成和专用视觉表现可以在手感测试后继续补。

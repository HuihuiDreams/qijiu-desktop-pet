# 实施计划：天气感知与时空同步系统

> 状态：提议中  
> 最后更新：2026-06-18

## Spec Alignment

### Objective

实现一个隐私友好的天气感知与本地时段同步 MVP：桌宠可以根据本地时间进入早晨、白天、黄昏、深夜等状态；在用户明确开启并配置位置后，额外根据天气切换轻量视觉特效、台词和低打扰动作。

### User Value

- 让桌宠更像“活在桌面环境里”，而不是只在固定循环中移动。
- 晴、雨、雪、深夜等变化能带来温柔的陪伴感和角色感。
- 天气同步失败、离线或用户关闭时，仍保留本地时间带来的基础氛围变化。

### Scope / Non-goals

In scope:

- 本地时间分段：早晨、白天、黄昏、深夜。
- 天气同步开关，默认关闭天气联网能力。
- 手动配置城市或模糊坐标，不默认请求精确定位权限。
- 主进程天气服务负责请求、缓存和归一化。
- Preload 暴露安全订阅 API。
- Renderer 消费抽象后的 `timePhase` / `weatherKind` / `intensity`，不直接请求外部 API。
- 晴、雨、雪、阴、多云、风、极端天气的第一版归一化。
- API 失败、离线、无位置、禁用时的 fallback。

Not doing:

- 不做自动精确定位。
- 不上传用户身份、IP 以外的额外标识、宠物状态或行为数据。
- 不做天气预警通知中心。
- 不做逐小时天气面板或完整天气 App。
- MVP 不新增逐皮肤必备美术资产。不得要求每套现有皮肤补雨伞、披风、雨天动作、雪天动作或额外 spritesheet。
- MVP 天气表现只使用全局 CSS/DOM 叠加层、台词、现有 idle/rest/cultivate 状态和可复用滤镜。
- 雨伞、披风、避雨动作等皮肤相关素材只作为后续可选增强，必须等皮肤/配件系统支持统一锚点和 fallback 后再评估。
- 不把天气直接改成养成数值惩罚，例如雨天扣心情。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests: `node --test test/weatherSyncService.test.js test/weatherAwarenessSystem.test.js test/timeWeatherRendererIntegration.test.js`
- Build: `npm run build`

### Project Structure

- `weatherSyncService.js`: 主进程天气请求、缓存、配置读取和 payload 生成。
- `main.js`: 服务生命周期、托盘开关、设置持久化和 IPC 事件发送。
- `preload.js`: 安全订阅 API，例如 `onWeatherInfo(callback)`。
- `src/systems/WeatherAwarenessSystem.js`: renderer 端归纳天气和时段状态。
- `src/pet/Pet.js` / `src/pet/PetRenderer.js`: 消费天气表现 hint，保持 sprite 转场稳定。
- `src/effects.css`: 轻量雨、雪、风、晴光等可关闭特效。
- `src/data/i18n.js` / `src/data/dialogues.js`: 天气相关菜单文案和台词。
- 不新增 `src/assets/skins/<skin>/weather-*` 这类逐皮肤必填素材路径；天气素材若存在，必须是全局可复用 overlay 或可选配件。
- `docs/decisions/`: 若实现采用外部天气 API，应新增 ADR 记录隐私和依赖选择。

### Dependencies

- MVP 候选天气源：Open-Meteo Forecast API。
- Open-Meteo 官方文档显示 `/v1/forecast` 通过经纬度、变量列表返回 JSON 天气数据，支持 current、hourly、daily 等变量，并包含 `weather_code`、`is_day`、降水、降雪、风速、云量等字段。
- Open-Meteo 覆盖中国气象模型和中国地区天气数据，不等于中国大陆网络访问稳定；`open-meteo.com` / `api.open-meteo.com` 属于境外服务，可能受运营商、地区、DNS 或跨境链路影响。
- 官方文档也说明商业保留 API 资源可能需要 `apikey`，因此实现前需要再次确认许可证、调用额度、归属说明和是否适合当前发布形态。
- 第一版不建议新增 npm 天气 SDK，优先用主进程内置 `fetch` 或 Electron/Node 可用的标准请求能力，减少依赖面。
- 天气 provider 必须可替换。Open-Meteo 只能作为首个 provider，不能写死为唯一数据源；面向中国大陆用户时应预留国内天气源或自托管代理的接入点。

### Privacy & Permissions

- 默认只启用本地时间状态，不发起天气请求。
- 天气同步需要用户明确开启，并手动选择城市或输入模糊坐标。
- 不默认调用系统定位权限。
- 保存位置时优先保存用户可理解的城市标签和低精度坐标。
- 不记录天气历史轨迹，只缓存最近一次成功响应和过期时间。
- Renderer 只接收抽象状态，不接收完整 API 原始响应。
- 天气请求失败不会影响桌宠基础运行。

### Boundaries

- Always: 主进程拥有联网请求和缓存，renderer 不直接访问网络。
- Always: payload 只包含抽象天气、时段、温度区间、强度和时间戳。
- Always: 天气同步可关闭，关闭后停止请求并清除 renderer 天气状态。
- Always: 离线 fallback 只使用本地时间。
- Always: 外部天气 provider 不可用、被阻断或跨境访问超时时，功能必须回退到本地时段，不影响基础桌宠运行。
- Ask first: 使用系统定位、后台高频刷新、天气预警提醒、第三方收费 API、按天气改变养成数值。
- Ask first: 为中国大陆用户引入国内天气 API、自托管代理或任何需要服务端中转的方案。
- Never: 上传宠物状态、窗口信息、任务内容、截图或用户行为到天气服务。

### Success Criteria

- 未开启天气同步时，深夜/白天等本地时段状态仍能正常触发。
- 用户开启并配置位置后，应用能获取天气并归一化为稳定的 renderer payload。
- 晴、雨、雪、阴/多云、风至少能映射到一种台词或视觉表现。
- API 请求失败、超时、断网或响应异常时，应用不崩溃，并回退到本地时间状态。
- 用户关闭天气同步后，不再发起请求，renderer 状态过期并恢复普通表现。
- `npm test` 与 focused tests 通过。

### Testing Strategy

用 fake clock 和 mocked fetch 先测主进程天气服务：配置禁用、缓存命中、请求成功、超时、响应异常、天气 code 归一化和过期 fallback。再测 renderer 系统：样本 TTL、本地时间分段、天气优先级、禁用恢复。最后用手动检查验证托盘开关、城市配置、雨雪特效和深夜状态不会破坏拖拽、点击穿透和现有互动。

### Performance Impact

天气感知会新增三类性能成本：低频网络请求、主进程定时器/缓存、renderer 天气表现。MVP 必须把这些成本限制在“可关闭、低频、可测量、可降级”的范围内。

性能预算：

- 天气同步关闭时：不创建天气请求定时器，不发起网络请求，renderer 不保留天气特效节点。
- 本地时段：不要在每帧构造 `Date` 或重复计算 phase；建议按分钟或状态过期时间更新一次，并缓存当前 `timePhase`。
- 天气请求：默认刷新间隔不低于 30 分钟；请求超时建议 3-5 秒；连续失败后进入 15-30 分钟冷却窗口。
- IPC：只在启动、设置变化、天气刷新、缓存过期或状态变化时发送 payload，不按 animation frame 发送。
- Payload：renderer 只接收抽象字段，目标 payload 小于 1 KB，避免传完整 forecast arrays。
- Renderer 特效：雨雪等表现优先使用 CSS `transform` / `opacity`，避免频繁读写 layout；粒子节点数量有上限，并在禁用、过期、隐藏或低性能模式下清理。
- 视觉资源：MVP 不新增大图、视频、大 spritesheet 或逐皮肤天气帧；伞、披风等专用资产后置到皮肤/配件系统。
- 多显示器/DPI：特效层只跟随透明窗口和当前 display scale，不在每个 display 上重复创建独立全屏层。

测量要求：

- 实现前记录天气功能关闭时的 baseline：空闲 CPU、内存、DOM 节点数、一次普通拖拽/互动的响应是否流畅。
- 开启本地时段但不开天气请求时，baseline 不应出现可感知退化。
- 开启雨/雪特效 10 分钟后，DOM 节点数应保持稳定，内存不应持续增长。
- DevTools Performance 录制中，天气 payload 更新和特效切换不应产生明显 long task；若出现超过 50ms 的主线程任务，应先降级特效再考虑优化实现。
- 中国大陆网络不可达或 provider 超时时，不应出现高频重试、日志刷屏或 UI 卡顿。

## Overview

天气感知系统拆成两个可以独立交付的层级：

1. 本地时空同步：完全离线，根据系统时间计算时段状态。
2. 天气同步：用户开启后，根据手动位置拉取天气，并转成低风险的角色表现 hint。

这样做的好处是：即使天气 API 不稳定、用户不想联网或位置未配置，桌宠依然能获得“昼夜变化”的生命感。天气层只是增强，不成为基础运行依赖。

## Recommended Direction

MVP 推荐先做“本地时段 + 手动城市 + 低频天气刷新”。

默认体验：

- 应用启动后立即拥有本地时段状态。
- 天气同步默认关闭。
- 用户在托盘或设置里开启“天气感知”后，需要选择城市或输入经纬度。
- 第一次成功请求后，主进程缓存抽象结果。
- Renderer 使用抽象结果控制台词、CSS 特效和动作倾向。

不建议第一版做自动定位。桌宠是贴身桌面应用，天气功能应该给用户明确的控制感，而不是在首次启动时弹出定位权限。

## Proposed Data Contract

主进程保存的设置建议：

```javascript
{
  enabled: false,
  locationMode: "manual",
  location: {
    label: "Tokyo",
    latitude: 35.68,
    longitude: 139.76,
    timezone: "Asia/Tokyo"
  },
  refreshIntervalMinutes: 30,
  lastUpdatedAt: 1791100000000,
  schemaVersion: 1
}
```

发给 renderer 的抽象 payload：

```javascript
{
  active: true,
  source: "weather-sync",
  timePhase: "dusk",
  weatherKind: "rain",
  intensity: "medium",
  temperatureBand: "mild",
  isDay: false,
  stale: false,
  sampledAt: 1791100000000,
  expiresAt: 1791101800000
}
```

禁用、失败或未配置位置时：

```javascript
{
  active: false,
  source: "local-time",
  timePhase: "night",
  weatherKind: "unknown",
  intensity: "none",
  stale: true,
  sampledAt: 1791100000000
}
```

## Weather Mapping

| Normalized kind | 输入来源 | MVP 表现 | 资产要求 |
|---|---|---|---|
| `clear` | 晴、低云量 | 晒太阳台词、轻微暖光 | 全局 CSS fallback；不要求皮肤帧 |
| `cloudy` | 阴、多云、雾 | 安静 idle、低饱和滤镜 | 全局 CSS fallback；不要求皮肤帧 |
| `rain` | 雨、阵雨、降水量 | 雨滴特效、避雨台词 | 全局 overlay；伞动作后置且可选 |
| `snow` | 雪、降雪量 | 雪粒子、怕冷台词 | 全局 overlay；披风后置且可选 |
| `wind` | 风速或阵风较高 | 吐槽台词、轻微位移动效 | 可先仅台词；不要求衣摆/发丝分层 |
| `storm` | 雷暴或强降水 | 降低活跃度、短台词 | 不做吓人弹窗 |
| `unknown` | 无数据或失败 | 只用本地时段 | 无 |

### Art Asset Policy

天气 MVP 的美术策略是“全局表现，不乘以皮肤套数”。

- 必须支持现有所有皮肤零改动运行。
- 禁止把天气动作做成每套皮肤必填帧，例如 `rain_walk`、`snow_idle`、`umbrella_idle`。
- 雨、雪、晴光、阴天氛围优先放在透明窗口的全局 effect layer，由 renderer 根据角色位置和 `scaleRatio` 处理。
- 台词、移动频率、休息倾向和现有状态 fallback 是 MVP 的主要角色表达。
- 如果未来新增伞、披风、斗笠等道具，应作为 accessory/overlay 配件，并有统一锚点、兼容声明和缺失回退。
- 任何需要“每套皮肤都补一组天气素材”的方案，都必须拆到皮肤/配件系统计划中单独评估，不进入天气 MVP。

天气表现优先级建议：

1. 用户主动交互、拖拽、右键菜单、番茄钟结算等显式状态最高。
2. 安全/运行状态，例如暂停、隐藏、睡眠/唤醒恢复，高于天气表现。
3. 极端天气高于普通天气。
4. 天气高于普通 idle 台词，但不抢占正在进行的 CP 互动。
5. 本地时段是最低层背景 hint。

## Time Phase Model

初版时段可以先用本地系统时间，不依赖天气 API：

| Phase | 建议时间 | 角色表现 |
|---|---:|---|
| `morning` | 05:00-10:59 | 轻快问候、整理衣冠 |
| `day` | 11:00-16:59 | 普通活跃状态 |
| `dusk` | 17:00-20:59 | 柔和台词、归山氛围 |
| `night` | 21:00-04:59 | 低活跃、休息或小声台词 |

时间段只是默认值。实现时应放进配置常量，方便后续根据用户反馈调整。

## Task Breakdown

### Phase 1: Local Time Foundation

#### Task 1: 定义时空同步合约

**Description:** 明确本地时段、天气状态、payload 字段、TTL、隐私边界和 fallback 行为，为后续实现建立稳定接口。

**Acceptance criteria:**
- [ ] 文档记录 `timePhase`、`weatherKind`、`intensity`、`stale`、`sampledAt`、`expiresAt` 字段。
- [ ] 合约明确 renderer 不接收原始天气 API 响应。
- [ ] 合约明确天气同步默认关闭，本地时间状态默认可用。
- [ ] 合约记录禁用、未配置位置、请求失败、缓存过期的 fallback。
- [ ] 合约记录性能预算：最小刷新间隔、请求超时、payload 大小、IPC 发送时机和特效节点上限。

**Verification:**
- [ ] 计划/ADR review 确认隐私边界清楚。
- [ ] 后续任务都只消费抽象 payload。
- [ ] 计划/ADR review 确认不需要每帧计算天气或发送 IPC。

**Dependencies:** None

**Files likely touched:**
- `docs/decisions/ADR-0XX-weather-sync.md`
- `docs/structure.md`

**Estimated scope:** Small

#### Task 2: 新增本地时段归纳逻辑

**Description:** 增加纯逻辑函数或 renderer system，根据本地时间计算 `morning`、`day`、`dusk`、`night`，并支持 fake clock 测试。

**Acceptance criteria:**
- [ ] 能根据本地时间返回稳定 `timePhase`。
- [ ] 边界时间不会抖动或返回未知状态。
- [ ] 系统时间变化后，下一次 tick 能更新 phase。
- [ ] 不需要联网或位置配置。
- [ ] 本地时段计算按分钟或状态过期时间触发，不在 animation frame 中重复构造时间对象。

**Verification:**
- [ ] `node --test test/weatherAwarenessSystem.test.js`
- [ ] 测试覆盖四个 phase 和边界时间。
- [ ] Fake clock 测试覆盖一分钟内重复读取不会重复计算或重复发事件。

**Dependencies:** Task 1

**Files likely touched:**
- `src/systems/WeatherAwarenessSystem.js`
- `src/data/config.js`
- `test/weatherAwarenessSystem.test.js`

**Estimated scope:** Small

#### Task 3: 接入本地时段到角色表现

**Description:** 让 renderer 在不联网的情况下消费 `timePhase`，影响低频台词、idle 倾向或睡眠表现。

**Acceptance criteria:**
- [ ] 深夜状态会降低自动移动或互动频率，但用户主动操作仍可用。
- [ ] 早晨/黄昏可以触发低频台词。
- [ ] 时段表现不打断拖拽、右键菜单、番茄钟和已有互动。
- [ ] 缺少专用动画时回退到现有 idle/rest/cultivate。

**Verification:**
- [ ] Renderer 单元测试覆盖 phase hint 到行为 hint 的映射。
- [ ] 手动调整系统时间或使用 debug hook 检查四个 phase。
- [ ] `npm test`

**Dependencies:** Task 2

**Files likely touched:**
- `src/app.js`
- `src/pet/Pet.js`
- `src/data/dialogues.js`
- `test/timeWeatherRendererIntegration.test.js`

**Estimated scope:** Medium

### Checkpoint: Offline MVP

- [ ] 不联网也能触发本地时段状态。
- [ ] 深夜状态不会破坏拖拽、点击穿透和用户主动互动。
- [ ] 所有新增逻辑可单元测试。

### Phase 2: Weather Service

#### Task 4: 定义天气设置和存储

**Description:** 增加天气同步设置结构，支持启用、禁用、位置、刷新间隔和 schema version。

**Acceptance criteria:**
- [ ] 默认 `enabled: false`。
- [ ] 没有位置时不会发起天气请求。
- [ ] 设置通过 `electron-store` 持久化。
- [ ] 旧配置或损坏配置能 fallback 到默认关闭。
- [ ] `refreshIntervalMinutes` 有下限，MVP 默认不低于 30 分钟。

**Verification:**
- [ ] 设置规范化测试覆盖默认值、非法位置、非法刷新间隔和 schema fallback。
- [ ] 设置规范化测试覆盖过低刷新间隔会被夹到安全下限。
- [ ] `node --test test/weatherSyncService.test.js`

**Dependencies:** Task 1

**Files likely touched:**
- `weatherSyncService.js`
- `main.js`
- `test/weatherSyncService.test.js`

**Estimated scope:** Medium

#### Task 5: 新增主进程 WeatherSyncService

**Description:** 在主进程新增天气服务，负责低频请求、缓存最近成功结果、超时控制和抽象 payload 生成。

**Acceptance criteria:**
- [ ] 服务只在启用且有位置时请求天气。
- [ ] 请求频率受 `refreshIntervalMinutes` 限制。
- [ ] provider 通过小接口隔离，Open-Meteo 不是业务逻辑里的硬编码唯一来源。
- [ ] 请求超时、HTTP 错误、JSON 异常都不会抛到应用主流程。
- [ ] DNS 失败、连接超时或疑似大陆网络不可达时，使用统一 fallback payload。
- [ ] 最近成功结果在 TTL 内可复用。
- [ ] 原始响应不会转发给 renderer。
- [ ] 发送给 renderer 的 payload 小于 1 KB，不包含 hourly/daily forecast arrays。
- [ ] IPC 只在状态变化、设置变化、刷新完成或缓存过期时发送，不按轮询 tick 重复广播相同 payload。

**Verification:**
- [ ] Mock fetch 测试成功、失败、DNS/连接错误、超时、缓存命中、缓存过期。
- [ ] Mock 测试覆盖相同 payload 不重复发送 IPC。
- [ ] 单元测试断言 renderer payload 不包含原始 forecast arrays。
- [ ] 手动记录至少一次中国大陆网络环境下的 Open-Meteo 访问结果；若不可用，确认 fallback 不影响本地时段。
- [ ] `node --test test/weatherSyncService.test.js`

**Dependencies:** Task 4

**Files likely touched:**
- `weatherSyncService.js`
- `main.js`
- `test/weatherSyncService.test.js`

**Estimated scope:** Medium

#### Task 6: 实现天气归一化

**Description:** 把 API 返回的天气 code、降水、降雪、风速、云量、昼夜字段归一化为 `weatherKind`、`intensity`、`temperatureBand` 和 `isDay`。

**Acceptance criteria:**
- [ ] 晴、云、雨、雪、风、雷暴/强天气可归一化。
- [ ] 未知 code 返回 `unknown`，不影响本地时段。
- [ ] 温度只进入粗粒度区间，不需要展示精确值。
- [ ] 归一化函数为纯逻辑，容易单测。

**Verification:**
- [ ] 单元测试覆盖代表性天气 code 和异常数据。
- [ ] `node --test test/weatherSyncService.test.js`

**Dependencies:** Task 5

**Files likely touched:**
- `weatherSyncService.js`
- `test/weatherSyncService.test.js`

**Estimated scope:** Small

#### Task 7: 暴露安全 IPC 订阅

**Description:** 通过 preload 暴露天气状态订阅和设置读写 API，renderer 只订阅抽象 payload。

**Acceptance criteria:**
- [ ] 存在 `window.electronAPI.onWeatherInfo(callback)` 或等价订阅 API。
- [ ] 订阅返回 unsubscribe 函数。
- [ ] Renderer 可读取当前天气设置摘要，但不能访问原始响应。
- [ ] 禁用天气同步会向 renderer 发出 inactive payload。
- [ ] 退订后不会保留 listener 或继续触发 renderer 回调。

**Verification:**
- [ ] Preload 订阅测试覆盖新增 channel。
- [ ] Preload 订阅测试覆盖 unsubscribe 后 listener 被移除。
- [ ] `node --test test/preloadSubscriptions.test.js`
- [ ] `npm test`

**Dependencies:** Task 5

**Files likely touched:**
- `preload.js`
- `main.js`
- `test/preloadSubscriptions.test.js`

**Estimated scope:** Small

### Checkpoint: Weather Signal

- [ ] 天气请求只在 opt-in 后发生。
- [ ] Renderer 只能看到抽象状态。
- [ ] 网络失败不会影响本地时段和基础桌宠运行。

### Phase 3: Controls and Presentation

#### Task 8: 新增托盘/设置入口

**Description:** 增加天气同步开关和位置配置入口。MVP 可以先用简单窗口、状态窗口页签或托盘子菜单中的预设/手动输入方案。

**Acceptance criteria:**
- [ ] 用户可以开启/关闭天气同步。
- [ ] 用户可以设置城市标签和坐标。
- [ ] 禁用后停止请求并清空 renderer 天气表现。
- [ ] 文案明确说明不会自动获取精确定位。

**Verification:**
- [ ] 手动检查开启、配置、关闭流程。
- [ ] i18n fallback 测试覆盖天气菜单文案。
- [ ] `node --test test/i18nFallback.test.js test/skinTray.test.js`

**Dependencies:** Task 4, Task 7

**Files likely touched:**
- `main.js`
- `src/data/i18n.js`
- `src/statusWindow.js` / `src/status.html` / `src/status.css` 或专用设置窗口
- `test/i18nFallback.test.js`
- `test/skinTray.test.js`

**Estimated scope:** Medium

#### Task 9: 接入天气视觉特效

**Description:** 在 renderer 中根据 `weatherKind` 和 `intensity` 添加轻量 CSS/DOM 特效，优先保证性能和可关闭。

**Acceptance criteria:**
- [ ] 雨、雪、晴光至少有一种轻量表现。
- [ ] 特效强度受 `intensity` 控制。
- [ ] 低性能或禁用时不渲染特效节点。
- [ ] 特效应用 `scaleRatio` 或 viewport 约束，不在多显示器/DPI 场景明显错位。
- [ ] 特效是全局 overlay 或 CSS class，不要求修改任何现有皮肤素材。
- [ ] 雨/雪粒子节点数量有配置上限，切换天气、禁用、隐藏宠物或 payload 过期时会清理。
- [ ] 特效实现避免 layout thrashing，不在动画循环中交替读取布局和写入样式。
- [ ] 如果 10 分钟手动观察中出现 DOM 节点增长、明显掉帧或超过 50ms long task，MVP 降级为“台词 + 静态 CSS class”，粒子特效推迟。

**Verification:**
- [ ] 单元测试或 DOM 测试覆盖启用/禁用和节点清理。
- [ ] 手动切换当前所有已存在皮肤，确认没有天气专用素材时也能正常展示 fallback。
- [ ] 手动检查雨雪特效不挡住菜单和状态窗口。
- [ ] DevTools Performance 录制覆盖天气切换和雨/雪特效运行；记录是否存在超过 50ms 的 long task。
- [ ] 手动检查 10 分钟后 DOM 节点数量稳定。
- [ ] `npm test`

**Dependencies:** Task 7

**Files likely touched:**
- `src/app.js`
- `src/effects.css`
- `src/pet/PetRenderer.js`
- `test/timeWeatherRendererIntegration.test.js`

**Estimated scope:** Medium

#### Task 10: 添加天气台词和动作 fallback

**Description:** 增加天气相关台词和动作倾向，让天气变化通过角色表达出来，而不是只显示粒子。

**Acceptance criteria:**
- [ ] 晴、雨、雪、深夜至少有中文台词 fallback。
- [ ] 英文/日文 locale 缺失时不会显示 undefined。
- [ ] 没有伞/披风等专用资产时使用现有 idle/rest/cultivate。
- [ ] 不引入每套皮肤都必须补齐的天气动作名称。
- [ ] 天气台词有冷却时间，不频繁刷屏。

**Verification:**
- [ ] i18n fallback 测试通过。
- [ ] 手动模拟不同 weather payload。
- [ ] 手动检查默认皮肤和任意非默认皮肤都能走同一套天气 fallback。
- [ ] `node --test test/i18nFallback.test.js test/timeWeatherRendererIntegration.test.js`

**Dependencies:** Task 3, Task 7

**Files likely touched:**
- `src/data/dialogues.js`
- `src/data/i18n.js`
- `src/app.js`
- `test/i18nFallback.test.js`

**Estimated scope:** Medium

### Checkpoint: Usable MVP

- [ ] 用户可以手动开启天气同步并配置位置。
- [ ] 天气状态可以影响视觉或台词。
- [ ] API 失败、禁用、离线都能回退到本地时段。
- [ ] 菜单、拖拽、点击穿透、番茄钟和现有互动不退化。

### Phase 4: Documentation and Hardening

#### Task 11: 记录架构与隐私边界

**Description:** 更新架构文档和 ADR，记录为什么天气请求放在主进程、为什么默认不自动定位、为什么 renderer 只消费抽象状态。

**Acceptance criteria:**
- [ ] ADR 记录天气 API 选择、隐私边界、缓存策略和 rejected alternatives。
- [ ] `docs/structure.md` 提到 WeatherSyncService 和 WeatherAwarenessSystem。
- [ ] 用户文档或计划说明天气同步默认关闭。
- [ ] 提交前更新 `CHANGELOG.md`。

**Verification:**
- [ ] 文档链接和文件名正确。
- [ ] `npm test`

**Dependencies:** Task 1-10

**Files likely touched:**
- `docs/decisions/ADR-0XX-weather-sync.md`
- `docs/structure.md`
- `CHANGELOG.md`

**Estimated scope:** Small

#### Task 12: 性能和失败场景打磨

**Description:** 压测天气特效和服务失败路径，确保网络慢、系统睡眠/唤醒、多显示器切换时状态不会卡死。

**Acceptance criteria:**
- [ ] 请求有超时和退避策略。
- [ ] 跨境 provider 连续失败后进入冷却窗口，不在后台频繁重试。
- [ ] 系统 resume 后不会立刻高频请求。
- [ ] 特效节点会清理，不长期累积 DOM。
- [ ] 天气 payload 过期后 renderer 自动回到本地时段。
- [ ] 禁用天气同步后没有后台定时器继续请求。
- [ ] 记录天气关闭、本地时段开启、天气请求开启、雨/雪特效开启四种状态的手动性能观察结果。
- [ ] 如果性能预算未达标，必须优先降低特效强度或推迟粒子特效，而不是提高轮询频率或增加缓存复杂度。

**Verification:**
- [ ] Fake clock 测试覆盖退避、TTL、resume 后刷新。
- [ ] 手动检查 DevTools DOM 节点数量稳定。
- [ ] DevTools Performance 录制或等价手动记录包含 CPU、内存、DOM 节点和 long task 观察。
- [ ] `npm test`

**Dependencies:** Task 5, Task 9

**Files likely touched:**
- `weatherSyncService.js`
- `src/systems/WeatherAwarenessSystem.js`
- `src/effects.css`
- `test/weatherSyncService.test.js`
- `test/weatherAwarenessSystem.test.js`

**Estimated scope:** Medium

### Checkpoint: Complete

- [ ] All tests pass: `npm test`。
- [ ] Focused tests pass: `node --test test/weatherSyncService.test.js test/weatherAwarenessSystem.test.js test/timeWeatherRendererIntegration.test.js`。
- [ ] 手动验证禁用、未配置、请求成功、请求失败、缓存过期、深夜状态。
- [ ] 隐私和架构文档已更新。
- [ ] `CHANGELOG.md` 已按 Added/Changed/Fixed/Removed 更新。

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| 用户担心定位隐私 | 高 | 默认关闭天气同步；只支持手动城市/模糊坐标；不请求系统定位 |
| 外部 API 不稳定或政策变化 | 中 | 把 API 隔离在主进程服务；实现前复核官方文档；提供本地时间 fallback |
| Open-Meteo 在中国大陆网络不可用或不稳定 | 高 | 不把 Open-Meteo 写死为唯一 provider；大陆网络实测；短超时、退避、最近成功缓存和本地时段 fallback；预留国内天气源或代理方案 |
| 天气请求或 IPC 过频 | 中 | 默认刷新间隔不低于 30 分钟；相同 payload 不重复广播；连续失败进入冷却窗口 |
| 天气特效影响性能 | 中 | 低粒子数量；可关闭；只在 renderer 渲染抽象状态；节点定期清理；未达预算时降级为台词/静态 class |
| DOM 或 listener 泄漏 | 中 | 特效节点有上限和清理路径；preload 订阅必须可退订；10 分钟观察 DOM 节点稳定 |
| 天气素材乘以皮肤套数 | 高 | MVP 禁止逐皮肤必填天气帧；只用全局 overlay、CSS、台词和现有状态 fallback；伞/披风等道具后置到配件系统 |
| 天气状态抢占角色互动 | 中 | 明确状态优先级；天气只作为 hint，不覆盖主动交互和关键系统状态 |
| 多语言文案缺失 | 低 | 使用 i18n fallback 测试；中文先完整，英文/日文可回退 |
| 时区和本地时间不一致 | 中 | 本地时段用系统时间；天气数据使用用户配置 timezone；payload 标记 sampledAt/expiresAt |
| 过度功能化 | 中 | MVP 不做完整天气面板、不做预警、不做数值惩罚 |

## Test Scenarios

- 未开启天气同步：应用启动后只生成本地时段状态，不请求网络。
- 未配置位置：开启开关后仍不请求天气，并提示需要配置位置。
- 请求成功：晴、雨、雪样本映射到正确 `weatherKind`。
- 请求失败：保留最近有效缓存；缓存过期后回到本地时段。
- 大陆网络不可达：请求短超时后回到本地时段，不连续刷请求、不弹错误打扰用户。
- 禁用天气：停止定时器，renderer 收到 inactive payload。
- 深夜状态：移动和互动降低打扰，但拖拽、喂食、摸头、状态窗口仍正常。
- 多显示器/DPI：雨雪特效不偏离当前透明窗口，也不遮挡菜单。
- 多皮肤兼容：不新增任何天气专用皮肤帧时，所有现有皮肤都能显示台词/全局特效 fallback。
- 睡眠/唤醒：不会重复创建定时器或立即高频请求。
- 性能观察：天气关闭、本地时段开启、天气请求开启、雨/雪特效开启四种状态下，CPU、内存、DOM 节点和 long task 没有明显退化。

## Open Questions

- 天气同步首版是否只支持手动输入城市/坐标，还是需要做城市搜索？
- 首版是否面向中国大陆用户承诺天气同步？如果要承诺，需要优先验证 Open-Meteo 可达性，或直接准备国内 provider。
- 用户界面入口放在托盘子菜单、状态窗口设置页，还是单独设置窗口？
- 位置保存精度是否需要统一截断到小数点后两位，进一步降低精度？
- 雨雪天气是否应该影响角色移动频率，还是只影响视觉和台词？
- 雨/雪粒子默认上限要定多少？建议实现时先用很保守的上限，再根据 DevTools 录制调整。
- 低性能模式是否需要显式设置，还是先复用“禁用天气同步/禁用特效”的开关？
- 天气同步是否允许未来成为随机奇遇和图鉴触发条件？

## Parallelization Opportunities

- Task 1 合约确认后，Task 2 本地时段和 Task 4 设置存储可以并行。
- Task 5 主进程服务和 Task 6 天气归一化可以由同一人连续完成，也可以先定义 fixture 后并行。
- Task 9 视觉特效和 Task 10 台词可以在 Task 7 IPC 合约稳定后并行。
- Task 11 文档可以在实现阶段同步维护，最后只做校准。

## Suggested MVP Cut

最小可用版本建议实现 Task 1-8 和 Task 10：

- 离线本地时段可用。
- 用户可明确开启天气同步并配置位置。
- 主进程可请求、缓存、归一化天气。
- Renderer 可通过台词和现有状态表达天气。
- 不新增任何逐皮肤天气素材。

Task 9 的粒子特效可以作为同一版本的增强项，但如果性能或美术手感不稳，可以推迟到下一阶段。
伞、披风、避雨动作等会随皮肤套数膨胀的素材不进入天气 MVP，后续应作为配件系统能力单独评估。

## References

- [Open-Meteo Forecast API documentation](https://open-meteo.com/en/docs): 用于确认 `/v1/forecast`、current/hourly/daily variables、`weather_code`、`is_day`、经纬度参数、timezone、forecast length 和 API key/商业资源说明。
- 中国大陆网络可达性需要实测；目前计划只把 Open-Meteo 作为首个候选 provider，不视为稳定可用的唯一依赖。

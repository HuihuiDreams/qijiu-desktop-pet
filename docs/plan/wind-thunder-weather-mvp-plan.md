# 实施计划：大风与雷暴天气 MVP (Wind and Thunder Weather MVP)

> 状态：建议 (Proposed)  
> 最后更新时间：2026-07-02

## 概述 (Overview)

本 MVP 旨在通过局部、低干扰的大风（wind）和雷暴（thunderstorm）氛围效果，丰富现有的天气系统。应用程序的设计原则是**氛围优先于气象精确度**：大风天气将添加围绕桌宠局部的风丝粒子效果；雷暴天气保留雨滴粒子的同时，偶尔在桌宠附近闪烁小型闪电。天气功能仍将保持可选、隐私保护、由主进程缓存，且渲染进程仅以标准化的状态（normalized state）进行消费。

## 目标 (Goals)

- 添加大风和雷暴视觉效果，且不改变桌宠的移动或交互行为。
- 为两位桌宠及所有支持的语言区域（locales）添加大风和雷暴时的闲聊对白（idle chatter）。
- 保持特效仅在桌宠局部位置展现，并与现有皮肤完全兼容。
- 保持当 Open-Meteo 接口不可用或返回异常数据时的优雅降级（graceful fallback）行为。

## 非目标 (Non-goals)

- **不添加**全屏闪烁、全屏滤镜、警报、系统通知或任何声音配置。
- **不使**风力推动桌宠、改变寻路逻辑或修改养成属性数据。
- **不添加**专属各皮肤的天气精细贴图、雨伞、斗篷或强制要求额外的天气素材。
- **不针对**每一个天气、时间与强度的组合去构建完全覆盖的组合矩阵。
- **不添加**第二家天气数据提供商或面向用户展示的天气仪表盘面板。

## 架构决策 (Architecture Decisions)

- 将雷暴（thunderstorm）作为对白和页面 `body` 属性数据集语义下的主要 `weatherKind`，但在渲染时将其表现为“下雨 + 局部闪电叠加效果”。
- 将风（wind）作为轻量级氛围状态：晴天/多云伴随强风可直接转为 `windy`；雨、雪或雷暴可以通过 `windIntensity` 属性携带风力效果，而无需改变主要的降水类型。
- 外部 API 边界始终保留在 `weatherSyncService.js` 中；渲染进程代码**严禁**直接访问原始的 Open-Meteo 响应数据。
- 在 `WeatherParticleLayer` 中采用数量受限的 DOM/CSS 粒子，沿用现有的雨/雪渲染机制并自动适配 `scaleRatio` 缩放。
- 通过 `window.__DEBUG_WEATHER` 保留调试注入功能，以便人工测试与验收时可强制触发 `windy` 和 `thunderstorm` 状态。

## 依赖图 (Dependency Graph)

```text
Open-Meteo 数据负载标准化 (Payload Normalization)
    |
    v
渲染层天气状态解析 (Renderer Weather State Parsing)
    |
    +--> 对白天气键值 (Dialogue Weather Keys)
    |
    v
粒子层 DOM 模型 (WeatherParticleLayer DOM Model)
    |
    v
CSS 视觉特效 (CSS Visual Effects)
    |
    v
人工 QA 与文档 (Manual QA & Documentation)
```

## 任务列表 (Task List)

### 阶段 1：天气数据协议基础 (Phase 1: Weather Contract Foundation)

## 任务 1：标准化天气响应负载中的风力字段 (Normalize Wind Fields in Weather Payload)

**描述：** 扩展主进程返回的天气数据负载，接入来自 Open-Meteo 并经过清洗的安全风速 (`windSpeed`)、风向 (`windDirection`) 和阵风 (`windGusts`) 字段。如能在不破坏现有测试的前提下引入，优先采用现代的 `current=` 查询参数格式；否则在过渡期内同时支持 `current_weather` 和 `current` 两种响应数据结构。

**验收标准：**
- [x] `fetchWeather()` 能够正确返回 `windSpeed`、`windDirection` 和 `windGusts` 字段，类型为数字或 `null`。
- [x] 超出合理范围或格式错误的风力数值在主进程边界处立即被过滤丢弃。
- [x] 现有的温度 (`temperature`)、天气代码 (`weatherCode`)、白天/黑夜 (`isDay`)、异常兜底、缓存机制及超时控制行为保持不变。

**验证方式：**
- [x] 专项测试通过：`node --test test/weatherSyncService.test.js`
- [x] 为有效的风力字段和格式错误的异常风力数据补充或更新测试用例。

**依赖关系：** 无

**涉及文件：**
- `weatherSyncService.js`
- `test/weatherSyncService.test.js`

**预估工作量：** 小型：2 个文件

## 任务 2：在渲染进程映射雷暴与大风状态 (Map Thunderstorm and Wind State in Renderer)

**描述：** 更新 `WeatherAwarenessSystem`，使雷暴相关的气象代码能够映射为 `thunderstorm`；在没有更高优先级降水状态时，强风能够映射为 `windy`；同时，各类降水状态可额外携带独立的风力强度属性 (`windIntensity`)。

**验收标准：**
- [x] WMO 气象代码 `95`、`96` 和 `99` 正确映射为 `thunderstorm`。
- [x] 在晴朗或多云的基线天气下，强风或强阵风能够生成 `weatherKind: 'windy'` 状态。
- [x] 下雨、下雪和雷暴保留各自主要的天气类型，同时向外提供 `windIntensity` 属性。
- [x] `isKnownWeatherKind()` 方法支持并验证通过 `windy` 和 `thunderstorm`。

**验证方式：**
- [x] 专项测试通过：`node --test test/weatherAwarenessSystem.test.js test/timeWeatherRendererIntegration.test.js`
- [x] 为雷暴代码、晴天/多云刮风状态以及风雨叠加表现补充或更新测试用例。

**依赖关系：** 任务 1

**涉及文件：**
- `src/systems/WeatherAwarenessSystem.js`
- `test/weatherAwarenessSystem.test.js`
- `test/timeWeatherRendererIntegration.test.js`

**预估工作量：** 中型：3 个文件

### 里程碑检查点：协议基础 (Checkpoint: Contract)

- [x] 天气接口服务测试全部通过。
- [x] 天气感知系统测试全部通过。
- [x] 渲染进程状态与不包含风力字段的旧版本响应数据保持完全向后兼容。

### 阶段 2：视觉特效 (Phase 2: Visual Effects)

## 任务 3：向 WeatherParticleLayer 添加风层粒子 (Add Wind Particles to WeatherParticleLayer)

**描述：** 扩展 `WeatherParticleLayer`，当 `weatherKind: 'windy'` 或降水天气下的 `windIntensity` 高于 `none` 时，渲染数量受限的局部风丝粒子效果。

**验收标准：**
- [x] 纯大风天气下，在每个可见桌宠的附近生成局部的风层粒子组。
- [x] 伴随大风的雨雪天气在保留降水粒子的同时，叠加风力动效样式或受限的次级风粒子层。
- [x] 在频繁调用 `sync()` 时，粒子总数始终保持上限受控且稳定，无内存或节点膨胀。
- [x] 当桌宠被隐藏、`visible: false` 或天气停用时，粒子层能够立刻清空。

**验证方式：**
- [x] 专项测试通过：`node --test test/weatherParticleLayer.test.js test/weatherParticleStability.test.js`
- [x] 为 `windy` 纯风、风夹雨以及粒子层复用机制补充或更新测试用例。

**依赖关系：** 任务 2

**涉及文件：**
- `src/ui/WeatherParticleLayer.js`
- `test/weatherParticleLayer.test.js`
- `test/weatherParticleStability.test.js`

**预估工作量：** 中型：3 个文件

## 任务 4：添加局部雷暴闪电 CSS 特效 (Add Local Thunderstorm Lightning CSS)

**描述：** 为雷暴天气添加简短、仅限桌宠周围局部的闪电闪烁 CSS 特效及 DOM 挂载点。在视觉层面，雷暴应当清晰地表现为“下雨 + 偶发的局部闪电”，而非全屏笼罩的暴风雨遮罩。

**验收标准：**
- [x] 雷暴天气会在每个桌宠的天气粒子组内同时生成雨滴粒子与局部闪电 DOM 元素。
- [x] 闪电触发频率低、持续时间短，且绝不会覆盖整个透明窗口。
- [x] 当系统开启 `prefers-reduced-motion: reduce`（减弱动态效果）时，天气动画层能稳定保持禁用。
- [x] 除非同时伴随大风，否则现有的下雨和下雪视觉表现完全保持不变。

**验证方式：**
- [x] 专项测试通过：`node --test test/weatherParticleLayer.test.js test/weatherVisualScope.test.js`
- [x] 通过调试模式人工核对，确认闪电动画仅局限于桌宠附近闪烁。

**依赖关系：** 任务 3

**涉及文件：**
- `src/ui/WeatherParticleLayer.js`
- `src/effects.css`
- `test/weatherParticleLayer.test.js`
- `test/weatherVisualScope.test.js`

**预估工作量：** 中型：4 个文件

### 里程碑检查点：视觉特效 (Checkpoint: Visual)

- [x] 天气粒子层测试全部通过。
- [x] 视觉作用域测试确认所有天气特效严格限制在局部，不影响鼠标点击穿透。
- [x] 人工检查调试状态下的 `windy` 与 `thunderstorm` 特效，确认不干扰窗口点击穿透及悬停交互。

### 阶段 3：对白语录与调试工具 (Phase 3: Dialogue and Debugging)

## 任务 5：扩展大风与雷暴专属对白语录库 (Add Wind and Thunderstorm Dialogue Pools)

**描述：** 在兜底对白表及所有多语言区域字典中，为越祈（Yueqi）和神九（Shenjiu）新增 `weather_windy` 与 `weather_thunderstorm` 对白条目。

**验收标准：**
- [x] 中文默认兜底对白库包含新增的两种天气对白键值。
- [x] `zh`、`en` 和 `ja` 语言字典均包含针对两位桌宠的相关对应键值。
- [x] 现有的 `DialogBubble.showIdleChatter()` 方法可直接读取调用新键值，无需编写额外分支逻辑。
- [x] 调试模式的天气对白辅助方法支持正常触发 `windy` 和 `thunderstorm`。

**验证方式：**
- [x] 专项测试通过：`node --test test/i18nKeyCompleteness.test.js test/i18nFallback.test.js test/dialogBubble.test.js`
- [x] 补充或更新断言新天气对白键值存在的测试用例。

**依赖关系：** 任务 2

**涉及文件：**
- `src/data/dialogues.js`
- `src/data/i18n.js`
- `test/i18nKeyCompleteness.test.js`
- `test/dialogBubble.test.js`

**预估工作量：** 中型：4 个文件

## 任务 6：扩展天气调试注入工具 (Expand Debug Weather Injection)

**描述：** 扩展现有的 `window.__DEBUG_WEATHER` 调试工具，使其能够强制切换为 `windy`、`thunderstorm` 以及大风伴雨等状态，便于人工验收与测试而无需等待实际真实气象变化。

**验收标准：**
- [x] 调试工具支持设置 `weatherKind: 'windy'`。
- [x] 调试工具支持设置 `weatherKind: 'thunderstorm'`。
- [x] 调试工具支持设置带有非 `none` 风力强度 (`windIntensity`) 的下雨天气。
- [x] 调试工具的重置清理逻辑能够正确移除特效粒子并恢复正常的原始天气状态。

**验证方式：**
- [x] 专项测试通过：`node --test test/debugTools.test.js test/timeWeatherRendererIntegration.test.js`
- [x] 开发者控制台 (DevTools) 手动执行确认：运行 `window.__DEBUG_WEATHER.force('windy')` 或对应文档化指令运行正常。

**依赖关系：** 任务 2、3 与 4

**涉及文件：**
- `src/app.js`
- `test/debugTools.test.js`
- `test/timeWeatherRendererIntegration.test.js`

**预估工作量：** 小型：2-3 个文件

### 里程碑检查点：对白与调试 (Checkpoint: Dialogue and Debug)

- [x] 所有语言区域下的天气对白键值保持完整无缺失。
- [x] 调试工具能够强制模拟本 MVP 涉及的所有天气状态。
- [x] 天气闲聊触发概率及异常兜底逻辑保持原有行为不变。

### 阶段 4：文档与最终验证 (Phase 4: Documentation and Final Verification)

## 任务 7：更新架构文档与更新日志 (Update Architecture Documentation and Changelog)

**描述：** 记录新引入的天气状态、大风与雷暴的渲染边界以及 API 数据负载扩展说明。在 CHANGELOG.md 规范的英目标题下添加相应更新记录。

**验收标准：**
- [x] `docs/structure.md` 中提及 `windy`、`thunderstorm`、局部闪电以及风层粒子效果。
- [x] 如果 API 协议或第三方气象接口请求查询参数结构发生实质变化，同步更新 `ADR-038`。
- [x] `CHANGELOG.md` 包含位于 `Added` 或 `Changed` 分类下的条目。

**验证方式：**
- [x] 文档内部引用链接全部有效。
- [x] 如修改了 ADR 文件，通过 ADR 检查测试：`node --test test/checkAdrsScript.test.js`

**依赖关系：** 任务 1-6

**涉及文件：**
- `docs/structure.md`
- `docs/decisions/ADR-038-weather-sync.md`
- `CHANGELOG.md`
- `test/checkAdrsScript.test.js`（仅在需要时）

**预估工作量：** 小型：2-3 个文件

## 任务 8：运行专项验证与全量回归验证 (Run Focused and Full Validation)

**描述：** 运行天气、i18n、调试工具及视觉作用域的专项测试，随后执行全量项目测试套件。如当前环境支持，于 Electron 中进行简短的人工视觉验收 QA 流程。

**验收标准：**
- [x] 所有专项天气测试用例通过。
- [x] 运行 `npm test` 全量通过。
- [x] 人工 QA 确认大风和雷暴视觉特效仅限紧贴桌宠附近，且完全不影响鼠标操作穿透。
- [x] 在天气停用或桌宠隐藏后，DOM 树中无长久残留的多余节点。

**验证方式：**
- [x] `node --test test/weatherSyncService.test.js test/weatherAwarenessSystem.test.js test/weatherParticleLayer.test.js test/weatherParticleStability.test.js test/weatherVisualScope.test.js test/timeWeatherRendererIntegration.test.js test/dialogBubble.test.js test/i18nKeyCompleteness.test.js test/debugTools.test.js`
- [x] `npm test`
- [x] 可选人工验收：`npm run dev`

**依赖关系：** 任务 1-7

**涉及文件：**
- 预计不触及任何源码文件（除非在验证中发现需修复的问题）

**预估工作量：** 小型：仅验证

### 里程碑检查点：全面完成 (Checkpoint: Complete)

- [x] 所有非人工任务的验收标准全部达成。
- [x] 专项与全量测试全部通过，如有失败已明确记录其根本原因。
- [x] 人工视觉 QA 确认该功能具有良好氛围感、局域化表现且无打扰或干涉性。
- [x] 代码提交前已就绪待审。

## 风险与应对方案 (Risks and Mitigations)

| 风险点 | 影响程度 | 应对方案 |
|------|--------|------------|
| Open-Meteo 响应结构在 `current_weather` 与 `current` 之间存在差异 | 中 | 在标准化解析时同时兼容两种数据结构，并通过单测进行双向覆盖。 |
| 判定大风的阈值让人感觉触发过频或过于罕见 | 中 | 采用保守稳健的初始阈值，保留调试覆盖命令，先通过视觉走查调优后再决定是否增加复杂判断。 |
| 闪电特效过于抢眼或令人分心 | 中 | 限制闪电仅在局部展现、极短延时、低透明度，并在系统减弱动态效果设置开启时禁用。 |
| 粒子层层级变得过于复杂膨胀 | 中 | 严格约束粒子数量上限，复用现有的图层生命周期，避免嵌套构建繁杂的天气系统抽象层。 |
| 对白键值在不同多语言之间发生遗漏或错位 | 低 | 利用 i18n 完整性单测进行校验，并将新对白条目严格遵照现有字典结构追加。 |
| 天气视觉层意外阻挡了鼠标点击或操作穿透 | 高 | 严格保持 `pointer-events: none`，将所有特效放在现有天气层中，并执行视觉作用域相关测试校验。 |

## 并行开发机会 (Parallelization Opportunities)

- 在任务 2 明确渲染进程状态协议后，任务 5（新增对白语录）与任务 3（视觉层风粒子渲染）可以完全并行推进。
- 任务 7（文档更新）可在实现方案稳定后即可启动，但最后的更新日志描述应当在实际行为确认验证完毕后再最终定稿。
- 任务 8 必须按顺序排列在所有开发任务的最后执行。

## 开放问题 (Open Questions)

- **应采用什么标准发布确切的风力触发阈值？** 已发布以氛围优先的阈值配置：风速 >= 19.8 km/h (5.5 m/s) 或阵风 >= 28.8 km/h (8.0 m/s) 判定为 `windy`（微风/起风）；当风速 >= 28.8 km/h (8.0 m/s) 或阵风 >= 45 km/h (12.5 m/s) 判定为 `heavy`（强风）。
- **面对像 `96` 和 `99` 这种伴随降雪或冰雹的雷暴气象代码，视觉上应当优先呈现为“下雨 + 闪电”，还是在低温下呈现为“下雪 + 闪电”？** MVP 阶段建议方案：统一呈现为“下雨 + 闪电”以保障视觉可读性与直观度。
- **`windIntensity`（风力强度）应当被暴露到 `document.body.dataset` 属性上供纯 CSS 选择器挂载使用，还是仅保留在 `WeatherParticleLayer` 内部状态？** MVP 阶段建议方案：除非必须用 CSS 选择器驱动交互，否则默认将其保留在粒子图层的内部封装状态中。

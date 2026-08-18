# ADR-038: 天气感知与时空同步系统架构与隐私边界 (Weather Sync System)

## Status
Accepted

## Date
2026-06-18

## Updates
- 2026-07-13: 强化主进程地名解析 (`resolveCityToCoordinates`) 准确度与海外/多候选兼容性。新增高频常用国际都会别名映射库 (`WELL_KNOWN_CITY_ALIASES`)，自动将简称（如 `东京`、`大阪`、`伦敦`、`巴黎`、`纽约` 等）转换为底层强索引关键词；并将 Open-Meteo Geocoding 接口候选上限扩至 `count=10`，对有效候选基于常住人口 (`population`) 降序优选。这既解决了中文简写误命中同名村镇的痛点，又完美兼容带有国家/行政区修饰（如 `London, Canada`）的精确过滤查询。
- 2026-07-13: 明确并精简雷暴与大风同时发生时的视觉优先级。当主天气为雷雨/雷暴 (`thunderstorm`) 时，由于本身已具备高密度的局部降雨与低频闪电特效，系统层与渲染层统一将 `windIntensity` 抑制为 `'none'`，不额外叠加刮风特效，确保画面主次分明、避免元素过多造成杂乱。
- 2026-07-10: 天气同步与感知系统扩展对极端高温 (`heat`) 的支持。确定高温判定门槛 (≥35℃，即 `temperatureBand === 'hot'`)，确立降雨/雪/雷暴优先于高温的排他优先级；热浪采用通透白炽亮银/白金阳炎流光 (`S型蛇形摆动`) 与脚底真实投影区 (`top: 94%~100%`) 的地表呼吸光晕，确保不带黄色杂沙感且与饥饿桔红光圈 (`.pet--hungry`) 彻底隔离。同时为中、英、日三语补充专属的 `weather_heat` 炎热闲聊台词。
- 2026-07-03: 天气同步扩展 Open-Meteo `current` 查询字段，额外清洗 `precipitation`、`rain`、`showers`、`snowfall`，渲染进程用雨/雪量对 WMO code 做保守相态纠偏，避免 API 边界条件把实际下雨误显示为下雪。
- 2026-07-02: 天气同步扩展 Open-Meteo `current` 查询字段，主进程严格过滤 `null` 与空字符串并下发清洗后的 `windSpeed`、`windDirection`、`windGusts`；渲染进程新增 `windy`、`thunderstorm` 和 `windIntensity` 归一化，仍保持局部粒子表现和无行为惩罚边界。

## Context
我们希望为桌宠引入天气感知能力（如根据本地时间进入清晨、白天、黄昏、深夜；根据天气展示特效、台词）。但在桌面端引入网络功能面临以下挑战：
1. **隐私问题**：自动定位或上传本地状态可能引发用户隐私担忧。
2. **网络稳定性**：免费/免 Key 的 API（如 Open-Meteo）在中国大陆访问不稳定，而国内方案（和风天气等）需用户提供 API Key，会带来使用门槛。
3. **架构安全**：直接在 Renderer 层请求外部网络打破了现有的安全边界，并使得渲染层过于臃肿。

## Decision
我们决定实施一个分离的**时空同步架构**，分为“本地时段基础层”与“零配置天气同步层”，并制定严格的通讯合约与降级策略：

1. **服务隔离与边界**：
   - `WeatherSyncService`（主进程）：负责所有网络请求、缓存、轮询、城市地理编码与数据归一化。在解析用户输入的城市名称时，通过内置 `WELL_KNOWN_CITY_ALIASES` 预解析高频大都市别名，并采用 `count=10` 多候选与 `population` 常住人口降序优选策略，彻底杜绝简写单字命中重名乡村，并完美支持带修饰词 (`City, Country`) 的精确过滤查询。
   - `WeatherAwarenessSystem`（渲染进程）：只接收主进程通过 IPC 传来的抽象 Payload（例如 `timePhase: 'day', weatherKind: 'rain'`），绝对不接触原始 API 响应，也不包含网络请求代码。

2. **时段更替降级原则 (Local-First)**：
   - 渲染层必须根据本地机器时钟以 1 分钟为间隔独立计算时段 (`timePhase`: `morning`/`day`/`dusk`/`night`)。
   - 如果网络请求超时、断开或设置禁用，时段和本地光照遮罩不能受影响，此时将 `weatherKind` 降级为 `'unknown'`。

3. **权限与隐私**：
   - 天气功能默认关闭。用户需在设置中手动开启，并手动输入城市名称（不使用系统定位）。
   - 绝对不上传任何桌面宠物当前状态、截图或用户的标识数据到天气接口。

4. **Payload 合约**：
   - 包含字段：`active`, `source`, `timePhase`, `weatherKind`, `intensity`, `windIntensity`, `temperatureBand`, `isDay`, `stale`, `sampledAt`, `expiresAt`。
   - 主进程可额外携带经过值域清洗的 `weatherCode`, `temperature`, `precipitation`, `rain`, `showers`, `snowfall`, `windSpeed`, `windDirection`, `windGusts`，由 `WeatherAwarenessSystem` 转为 `clear`, `cloudy`, `overcast`, `rain`, `snow`, `windy`, `thunderstorm`, `heat`, `unknown` 等稳定状态。
   - 视觉排他优先级：当遇到雨、雪和雷暴 (`thunderstorm`) 时保持降水为主天气（优先级：`雷阵雨/雷暴 > 雨/雪 > 炎热 > 大风 > 晴/阴`）。其中当 `weatherKind === 'thunderstorm'` 时，为避免画面要素堆叠混乱，系统和粒子层会将 `windIntensity` 归一化为 `'none'`；大风仅在非雷暴状态下通过 `windIntensity` 叠加风痕；炎热 (`heat`) 通过自底向上的清透白金阳炎流线与脚底地表光晕表现，并伴有对应多语言 `weather_heat` 专属台词。
   - 性能约束：`WEATHER_MIN_REFRESH_MINUTES` 为 30 分钟，网络超时 `WEATHER_TIMEOUT_MS` 为 4000ms，连续失败冷却 `WEATHER_BACKOFF_MS` 为 20 分钟（常量统一维护在 `src/data/config.js`）。

## Alternatives Considered
- **强制使用和风天气 + 用户自带 Key (BYOK)**：虽然能解决国内网络问题，但对小白用户配置门槛太高，被否决。
- **由作者提供内置 API Key**：由于开源/免费分发模式，共用 Key 会被瞬间刷爆配额，被否决。
- **在 Renderer 直接用 `fetch` 请求天气**：违反 Electron 的隔离原则，并会导致重绘和网络逻辑耦合，被否决。

## Consequences
- 天气功能即使因网络问题失效，小白用户也只会感受到白天/黑夜的自然更替，体验平滑。
- 主进程和渲染进程的界限得到维护。
- 未来如果出现更好用的免 Key 国内服务，只需要修改 `WeatherSyncService`，Renderer 层代码无需改动。

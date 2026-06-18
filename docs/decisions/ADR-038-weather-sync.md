# ADR-038: 天气感知与时空同步系统架构与隐私边界 (Weather Sync System)

## Status
Accepted

## Date
2026-06-18

## Context
我们希望为桌宠引入天气感知能力（如根据本地时间进入清晨、白天、黄昏、深夜；根据天气展示特效、台词）。但在桌面端引入网络功能面临以下挑战：
1. **隐私问题**：自动定位或上传本地状态可能引发用户隐私担忧。
2. **网络稳定性**：免费/免 Key 的 API（如 Open-Meteo）在中国大陆访问不稳定，而国内方案（和风天气等）需用户提供 API Key，会带来使用门槛。
3. **架构安全**：直接在 Renderer 层请求外部网络打破了现有的安全边界，并使得渲染层过于臃肿。

## Decision
我们决定实施一个分离的**时空同步架构**，分为“本地时段基础层”与“零配置天气同步层”，并制定严格的通讯合约与降级策略：

1. **服务隔离与边界**：
   - `WeatherSyncService`（主进程）：负责所有网络请求、缓存、轮询和数据归一化（把不同 API 返回的代号转为 `weatherKind`, `intensity` 等）。
   - `WeatherAwarenessSystem`（渲染进程）：只接收主进程通过 IPC 传来的抽象 Payload（例如 `timePhase: 'day', weatherKind: 'rain'`），绝对不接触原始 API 响应，也不包含网络请求代码。

2. **零配置与静默降级策略（Graceful Degradation）**：
   - 考虑到大部分休闲用户不会自行申请 API Key，我们默认使用免 Key 的 Open-Meteo。
   - 针对 Open-Meteo 国内部分节点网络连通性差的问题，设置严格的 4 秒超时。如果请求失败/超时，**禁止向用户报错**，程序静默回退到纯“本地时段（早中晚）”模式，保证基础体验的流畅和陪伴感。

3. **权限与隐私**：
   - 天气功能默认关闭。用户需在设置中手动开启，并手动输入城市名称（不使用系统定位）。
   - 绝对不上传任何桌面宠物当前状态、截图或用户的标识数据到天气接口。

4. **Payload 合约**：
   - 包含字段：`active`, `source`, `timePhase`, `weatherKind`, `intensity`, `temperatureBand`, `isDay`, `stale`, `sampledAt`, `expiresAt`。
   - 性能约束：`WEATHER_MIN_REFRESH_MINUTES` 为 30 分钟，网络超时 `WEATHER_TIMEOUT_MS` 为 4000ms，连续失败冷却 `WEATHER_BACKOFF_MS` 为 20 分钟（常量统一维护在 `src/data/config.js`）。

## Alternatives Considered
- **强制使用和风天气 + 用户自带 Key (BYOK)**：虽然能解决国内网络问题，但对小白用户配置门槛太高，被否决。
- **由作者提供内置 API Key**：由于开源/免费分发模式，共用 Key 会被瞬间刷爆配额，被否决。
- **在 Renderer 直接用 `fetch` 请求天气**：违反 Electron 的隔离原则，并会导致重绘和网络逻辑耦合，被否决。

## Consequences
- 天气功能即使因网络问题失效，小白用户也只会感受到白天/黑夜的自然更替，体验平滑。
- 主进程和渲染进程的界限得到维护。
- 未来如果出现更好用的免 Key 国内服务，只需要修改 `WeatherSyncService`，Renderer 层代码无需改动。

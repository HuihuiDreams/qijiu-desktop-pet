# Outlook/Teams 日程提醒 MVP 实施计划

> 状态：Proposed
> 最后更新：2026-06-09

## Spec Alignment

### Objective

让桌宠读取用户授权后的 Microsoft Outlook 日程，并用低打扰、角色化的桌面提醒提示接下来的会议或事件。Teams 会议优先通过 Outlook Calendar 事件中的在线会议信息识别，不直接读取 Teams 聊天、频道或会议内容。

### Commands

- Dev: `npm run dev`
- Test all: `npm test`
- Focused tests: `node --test test/calendarReminderService.test.js test/calendarReminderScheduler.test.js`
- Build: `npm run build`

### Project Structure

- `calendarReminderService.js`: 主进程服务，负责 Microsoft Graph 调用、日程缓存、轮询和提醒调度。
- `calendarReminderAuth.js`: 主进程认证封装，负责 MSAL 登录、token 获取和登出。
- `main.js`: 启停服务、托盘入口、IPC handler 和应用生命周期协调。
- `preload.js`: 暴露安全的登录、登出、状态读取和提醒订阅 API。
- `src/app.js` / `src/ui/DialogBubble.js`: renderer 端提醒表现。
- `test/`: Graph client、调度、防抖、IPC 和 renderer 集成测试。
- `docs/structure.md` / `CHANGELOG.md`: 行为、边界和变更记录。

### Source References

- Microsoft Graph Calendar overview: https://learn.microsoft.com/en-us/graph/outlook-calendar-concept-overview
- Microsoft Graph event delta: https://learn.microsoft.com/en-us/graph/api/event-delta
- Microsoft Graph reminderView: https://learn.microsoft.com/zh-cn/graph/api/user-reminderview
- Outlook event online meeting / Teams join URL: https://learn.microsoft.com/en-us/graph/outlook-calendar-online-meetings
- Microsoft Graph change notifications: https://learn.microsoft.com/en-us/graph/change-notifications-overview
- Electron + MSAL desktop sign-in: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-desktop-app-nodejs-electron-sign-in
- Microsoft Graph permissions overview: https://learn.microsoft.com/en-us/graph/permissions-overview
- Microsoft identity platform consent types: https://learn.microsoft.com/en-gb/entra/identity-platform/consent-types-developer
- Okta Office 365 SSO configuration: https://help.okta.com/en-us/Content/Topics/Apps/Office365-Deployment/configure-sso.htm

### Code Style

使用现有 vanilla JavaScript / CommonJS 风格。Microsoft Graph、OAuth token 和本地缓存都停留在主进程；renderer 只能接收净化后的提醒 payload。网络请求、时间和存储依赖需要可注入，方便单元测试。IPC payload 使用普通对象并校验字段，避免把 access token、refresh token 或原始 Graph 响应暴露给 renderer。

### Boundaries

- Always: 使用 Microsoft Graph 官方 API 读取已授权用户的 Outlook calendar/reminder 数据。
- Always: 默认只请求读取日程所需的最小权限，优先评估 `Calendars.ReadBasic`，需要 Teams join URL 或更完整字段时再使用 `Calendars.Read`。
- Always: OAuth token 只保存在主进程可访问范围，不通过 `preload.js` 暴露给 renderer。
- Always: 提醒 payload 只包含必要字段，例如 subject、start time、web link、join URL、location summary 和 reminder time。
- Ask first: 引入 `@azure/msal-node`、新增 app registration/client id、增加应用设置页、申请更高权限或引入云端 webhook 服务。
- Never: 读取 Teams 聊天、频道消息、会议录制、参会记录、邮件正文、屏幕内容或本地 Outlook/Teams 客户端数据库。

### Success Criteria

- 用户可以在桌宠中登录 Microsoft 账号，并授权读取日程。
- 桌宠能展示或触发未来一段时间内的 Outlook 事件提醒。
- Teams 会议事件能提供打开 Outlook 事件或加入会议的入口（当 Graph 返回 `onlineMeeting.joinUrl` 时）。
- 日程变更能在合理时间内同步到本地缓存，MVP 允许低频轮询。
- 用户可关闭该功能或登出，登出后清除本地 token/cache。
- 网络失败、token 过期、权限不足或 Graph 限流时不崩溃，并给出可理解的状态。
- `npm test` 通过，相关 focused tests 通过。

### Testing Strategy

先用 fake Graph client 覆盖 reminderView/calendarView 响应、token 过期、401/403/429、网络失败和事件删除；再用 fake clock 覆盖提醒调度、重复提醒抑制和系统睡眠后的时间跳变。最后用 `npm run dev` 手动登录测试账号，验证登录、同步、提醒、打开 Outlook/Teams 链接和登出清理。

## Overview

实现一个 Outlook/Teams 日程提醒 MVP：用户授权 Microsoft Graph 后，桌宠周期性读取近期日程或提醒视图，在事件开始前用角色化气泡提醒用户。Teams 日程不需要单独接 Teams API；大多数 Teams 会议本质上是 Outlook Calendar event，Graph event 中可能包含 `isOnlineMeeting`、`onlineMeetingProvider` 和 `onlineMeeting.joinUrl`。

MVP 的产品重点不是复制 Outlook 弹窗，而是让桌宠成为更柔和的日程感知层：提前提醒、临近会议时停止闲逛、必要时提供“打开会议/打开事件”入口。技术重点是最小权限、主进程隔离、离线缓存和失败降级。

## MVP Behavior

- 默认关闭，需要用户主动登录并启用。
- 托盘提供“Microsoft 日程提醒”入口：登录、同步状态、启用/关闭、登出。
- 登录成功后读取未来 24 小时到 7 天内的日程或提醒。
- 默认提醒策略：
  - 优先尊重 Graph 返回的 `reminderFireTime`。
  - 若没有提醒时间，则在事件开始前 10 分钟提醒。
  - 事件开始前 1 分钟可追加一次轻提醒，但同一事件不重复轰炸。
- 桌宠隐藏、会议自动隐藏或全屏/展示延后场景下，不强行弹出提醒。
- 网络不可用时使用最近一次本地缓存继续调度未过期提醒，并在下次同步恢复。
- 用户点击提醒中的打开入口时，使用系统默认浏览器打开 `eventWebLink` 或 Teams `joinUrl`。
- 登出后清除 token、账号状态和日程缓存。

## Platform Implementation

### Microsoft Graph

MVP 优先使用两条读取路径：

- `GET /me/reminderView(startDateTime=...,endDateTime=...)`
  - 适合直接获取未来提醒。
  - 返回 `eventSubject`、`eventStartTime`、`eventWebLink`、`reminderFireTime` 等提醒字段。
  - 最小权限可评估 `Calendars.ReadBasic`。
- `GET /me/calendarView?startDateTime=...&endDateTime=...`
  - 适合展示接下来议程、读取在线会议信息和更完整事件字段。
  - 若需要 `onlineMeeting.joinUrl`，通常需要选择事件字段并使用 `Calendars.Read`。

后续可用 `calendarView/delta` 做增量同步，避免每次全量拉取固定窗口。Webhook/change notifications 暂不作为 MVP，因为本地 Electron 应用通常没有稳定公网 HTTPS 回调地址；引入 webhook 意味着需要云端服务、订阅续期和更多运维面。

### Authentication

使用 Microsoft identity platform + MSAL 的桌面应用登录方式。Electron 侧认证流程放在主进程：

- 首次启动不登录、不请求权限。
- 用户从托盘触发登录。
- 主进程打开浏览器或认证窗口完成 OAuth。
- token cache 由主进程/认证库管理。
- renderer 只接收 `{ signedIn, accountName, syncState }` 之类的状态。

是否需要用户自建 Azure App Registration 或项目内置 client id，需要单独决策。MVP 开发阶段可使用开发用 app registration；发布前必须确认品牌、redirect URI、权限说明和隐私文案。

### Enterprise Okta / SSO Feasibility

企业环境中使用 Okta 登录 Microsoft 365 不会天然阻止该方案。关键链路通常是：桌宠通过 MSAL 发起 Microsoft identity platform 登录，Microsoft Entra ID 根据租户配置跳转到 Okta 完成 SSO/MFA，认证成功后再由 Entra ID 颁发 Microsoft Graph access token。也就是说，Okta 是登录上游或联邦身份提供方，真正给 Graph 发 token 和执行 consent 策略的仍然是 Microsoft Entra ID。

MVP 需要提前验证以下企业策略：

- 用户是否允许自行 consent `Calendars.ReadBasic` 或 `Calendars.Read` delegated permission；若租户关闭用户 consent，需要管理员为该 app registration 做 admin consent。
- 公司是否允许 desktop/public client OAuth flow，以及 Electron 所需 redirect URI，例如 `msal{clientId}://auth` 或 localhost 方案。
- 条件访问、设备合规、Okta Verify/FastPass 或受管设备策略是否要求使用系统浏览器或企业认可的认证方式。
- 是否禁止未验证发布者、个人开发者 app、或非企业应用目录内的 app 访问 Microsoft Graph。
- 初始权限是否能停留在 `Calendars.ReadBasic`；如果要读取 Teams join URL、地点或更完整事件信息，可能需要升级到 `Calendars.Read` 并让 IT 明确接受原因。

最小企业验证路径：创建一个开发用 Entra desktop app registration，只申请 `User.Read`、`offline_access` 和 `Calendars.ReadBasic`，用公司账号完成 Okta SSO/MFA 后调用 `/me/reminderView`。如果该路径成功，说明认证、Graph token 和基础日程读取已经打通；如果失败，优先记录错误类型（用户无权 consent、条件访问拦截、redirect URI 配置错误、Graph 权限不足）再决定是否需要 IT 介入。

### Renderer Experience

renderer 不知道 Graph 存在，只处理主进程推送的 `calendar-reminder-triggered`：

- 暂停普通闲聊，展示短气泡。
- 可选地让两只宠物靠近当前工作区边缘或主显示器中心，但不遮挡关键操作。
- 文案保持角色化，例如“半炷香后有会，要收功啦”。
- 点击气泡或按钮后回传 dismiss/open intent。

## Architecture Decisions

- 新增 `calendarReminderService.js`，职责类似 `breakReminderService.js`：主进程纯服务、可注入时钟和客户端、负责调度。
- 新增 `calendarReminderAuth.js`，避免把 OAuth/MSAL 细节塞进 `main.js`。
- 新增 `calendarGraphClient.js` 或在 service 内注入 client wrapper，封装 Graph URL、重试和响应归一化。
- `main.js` 只负责生命周期、托盘、IPC 和窗口打开，不直接拼 Graph 业务逻辑。
- 使用 `electron-store` 保存非敏感设置，例如启用状态、同步窗口、提醒提前分钟数、上次同步时间；token cache 不走普通 renderer 可读存储。
- 日程缓存只保存未来短窗口，不长期保存历史日程。
- 提醒调度和久坐提醒、会议自动隐藏互相独立，但触发前共享“当前是否适合打扰”的判断。
- 不做 Graph webhook；MVP 使用轮询，后续再评估 delta sync。

## Performance Constraints

- 同步间隔默认不低于 5 分钟；错误后指数退避，避免触发 Graph throttling。
- 每次只读取有限时间窗口，例如未来 24 小时或 7 天。
- renderer 不做任何网络请求或轮询。
- 不把日程同步放进 `requestAnimationFrame` 或高频 timer。
- 同步和提醒调度失败不能阻塞主进程窗口、托盘或游戏循环。

## Proposed Data Model

持久化设置（保存到 `electron-store`）：

```js
{
  enabled: false,
  accountHint: null,
  lookaheadDays: 7,
  fallbackReminderMinutes: 10,
  syncIntervalMinutes: 5,
  lastSyncAt: 0
}
```

短期日程缓存（主进程持有，可持久化但需短期清理）：

```js
{
  events: [
    {
      id: "graph-event-id",
      subject: "Meeting title",
      startAt: "2026-06-09T10:00:00+09:00",
      endAt: "2026-06-09T10:30:00+09:00",
      reminderAt: "2026-06-09T09:50:00+09:00",
      webLink: "https://outlook.office.com/...",
      joinUrl: "https://teams.microsoft.com/...",
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      showAs: "busy"
    }
  ],
  syncedAt: 0,
  expiresAt: 0
}
```

renderer 提醒 payload：

```js
{
  reminderId: "event-id:reminder-at",
  subject: "Meeting title",
  startsInMinutes: 10,
  startAt: "2026-06-09T10:00:00+09:00",
  canOpenEvent: true,
  canJoinMeeting: true
}
```

## Task List

### Phase 1: 认证与 Graph 基础

#### Task 1: 决定 Microsoft app registration 策略

**Description:** 明确开发和发布时使用的 Microsoft Entra app registration、redirect URI、权限范围和隐私说明。

**Acceptance criteria:**
- [ ] 决定使用项目内置 client id 还是用户自配置 client id。
- [ ] 明确支持账号类型：个人 Microsoft 账号、工作/学校账号，或两者都支持。
- [ ] 明确初始权限范围：`Calendars.ReadBasic` 或 `Calendars.Read`。
- [ ] 记录 redirect URI 和 Electron/MSAL 登录方式。

**Verification:**
- [ ] 用测试租户或个人账号完成一次登录 consent。
- [ ] 登录失败时能看到可理解错误。

**Dependencies:** None

**Files likely touched:**
- `docs/plan/outlook-teams-calendar-reminder-plan.md`
- 后续可能新增 ADR

**Estimated scope:** Small

#### Task 2: 新增认证封装

**Description:** 新增主进程认证模块，封装登录、登出、获取 access token 和账号状态。

**Acceptance criteria:**
- [ ] 支持用户主动登录。
- [ ] 支持静默获取 token，失败时返回需要重新登录。
- [ ] 支持登出并清理本地认证状态。
- [ ] 不把 token 暴露给 renderer。

**Verification:**
- [ ] fake auth 单测覆盖登录成功、取消登录、token 过期、登出。
- [ ] `node --test test/calendarReminderAuth.test.js`

**Dependencies:** Task 1

**Files likely touched:**
- `calendarReminderAuth.js`
- `main.js`
- `test/calendarReminderAuth.test.js`

**Estimated scope:** Medium

#### Task 3: 新增 Graph client wrapper

**Description:** 封装 Microsoft Graph 请求、字段选择、错误归一化和基础重试。

**Acceptance criteria:**
- [ ] 支持读取 `reminderView`。
- [ ] 支持读取 `calendarView` 并选择 Teams online meeting 相关字段。
- [ ] 处理 401/403/429/5xx 和网络错误。
- [ ] Graph 原始响应归一化为应用内部 event/reminder 对象。

**Verification:**
- [ ] fake fetch 单测覆盖成功、空日程、权限不足、限流、网络失败。
- [ ] `node --test test/calendarGraphClient.test.js`

**Dependencies:** Task 2

**Files likely touched:**
- `calendarGraphClient.js`
- `test/calendarGraphClient.test.js`

**Estimated scope:** Medium

### Checkpoint: Graph 基础

- [ ] 用户可以登录并获取 token。
- [ ] 主进程可以读取测试账号未来日程。
- [ ] renderer 没有 token 或原始 Graph 响应访问能力。

### Phase 2: 同步与提醒调度

#### Task 4: 新增 CalendarReminderService

**Description:** 新增主进程服务，负责启用状态、周期同步、短期缓存和提醒调度。

**Acceptance criteria:**
- [ ] 默认关闭，启用后开始同步。
- [ ] 同步未来固定窗口内的日程或提醒。
- [ ] 网络失败时保留未过期缓存。
- [ ] 同一事件同一提醒时间只触发一次。
- [ ] 系统睡眠/恢复后重新计算未过期提醒。

**Verification:**
- [ ] fake clock 单测覆盖同步、缓存、触发、重复抑制、睡眠恢复。
- [ ] `node --test test/calendarReminderService.test.js`

**Dependencies:** Task 3

**Files likely touched:**
- `calendarReminderService.js`
- `test/calendarReminderService.test.js`

**Estimated scope:** Medium

#### Task 5: 接入 main.js 生命周期和托盘

**Description:** 在主进程中启动服务，并增加托盘入口用于登录、启用/关闭、同步状态和登出。

**Acceptance criteria:**
- [ ] `app.whenReady()` 后初始化服务，但默认不登录不同步。
- [ ] 托盘能触发登录/登出。
- [ ] 托盘能启用/关闭日程提醒。
- [ ] 托盘能显示最近同步状态或错误摘要。
- [ ] 应用退出时停止 timer 并保存必要状态。

**Verification:**
- [ ] 托盘测试覆盖菜单项启用状态和点击回调。
- [ ] `npm test`

**Dependencies:** Task 2, Task 4

**Files likely touched:**
- `main.js`
- `src/data/i18n.js`
- `test/skinTray.test.js`

**Estimated scope:** Medium

#### Task 6: 暴露安全 IPC

**Description:** 通过 `preload.js` 暴露最小 API，让 renderer 订阅提醒、dismiss 和请求打开事件/会议。

**Acceptance criteria:**
- [ ] `onCalendarReminder(callback)` 返回 unsubscribe。
- [ ] `dismissCalendarReminder(reminderId)` 只发送提醒 ID。
- [ ] `openCalendarEvent(reminderId)` / `joinCalendarMeeting(reminderId)` 由主进程根据缓存打开链接，renderer 不接收原始 URL。
- [ ] IPC 参数经过校验，非法 ID 被忽略或返回失败。

**Verification:**
- [ ] preload 订阅和取消订阅测试。
- [ ] IPC 校验测试覆盖非法 reminder ID。
- [ ] `npm test`

**Dependencies:** Task 4

**Files likely touched:**
- `preload.js`
- `main.js`
- `ipcContracts.js`
- `test/preloadSubscriptions.test.js`
- `test/ipcContracts.test.js`

**Estimated scope:** Small

### Checkpoint: 可用提醒链路

- [ ] 主进程能定时同步日程。
- [ ] 到点能向 renderer 发送净化提醒。
- [ ] 用户能从提醒打开 Outlook 事件或 Teams 会议。

### Phase 3: Renderer 提醒表现

#### Task 7: 实现日程提醒气泡

**Description:** renderer 收到日程提醒后，以角色化气泡展示事件标题、开始时间和轻量操作。

**Acceptance criteria:**
- [ ] 展示短提醒文案和事件开始倒计时。
- [ ] 标题做长度限制和 HTML 注入防护。
- [ ] 提供打开事件/加入会议操作（如果主进程允许）。
- [ ] 用户点击关闭后回传 dismiss。
- [ ] 桌宠隐藏或会议自动隐藏时不强行展示。

**Verification:**
- [ ] renderer 集成测试覆盖气泡展示、关闭和按钮回调。
- [ ] HTML 注入测试覆盖恶意 subject。
- [ ] `npm test`

**Dependencies:** Task 6

**Files likely touched:**
- `src/app.js`
- `src/ui/DialogBubble.js`
- `src/data/dialogues.js`
- `test/dialogBubble.test.js`
- `test/htmlInjectionHardening.test.js`

**Estimated scope:** Medium

#### Task 8: 增加开发调试入口

**Description:** 增加仅开发环境可用的调试触发方法，不必等待真实日程即可验证 UI。

**Acceptance criteria:**
- [ ] DevTools 可调用调试方法触发一条假日程提醒。
- [ ] 调试触发走同一条 renderer 表现路径。
- [ ] 打包环境不暴露危险能力。

**Verification:**
- [ ] 手动触发后观察气泡和按钮状态。
- [ ] `npm test`

**Dependencies:** Task 7

**Files likely touched:**
- `src/app.js`
- `src/debug.js`

**Estimated scope:** Small

### Checkpoint: 端到端体验

- [ ] 用真实测试账号登录后，未来日程能触发桌宠提醒。
- [ ] Teams 会议链接可打开。
- [ ] 登出后不再同步或提醒。

### Phase 4: 文档、QA 与发布准备

#### Task 9: Windows QA

**Description:** 在 Windows 上验证登录、同步、提醒和打开链接。

**Acceptance criteria:**
- [ ] 登录 Microsoft 账号成功。
- [ ] 未来日程同步成功。
- [ ] 到点提醒展示正常，不破坏鼠标穿透和拖拽。
- [ ] 打开 Outlook 事件/Teams 会议成功。
- [ ] 断网后不崩溃，恢复网络后同步恢复。
- [ ] 登出后清理状态。

**Verification:**
- [ ] 使用测试账号手动创建 3 条事件：普通事件、Teams 会议、无提醒事件。
- [ ] `npm test`

**Dependencies:** Task 1-8

**Files likely touched:**
- None unless QA finds bugs.

**Estimated scope:** Small

#### Task 10: macOS QA

**Description:** 在 macOS 上验证同一套 Graph 和提醒路径，确认不触发额外系统隐私权限。

**Acceptance criteria:**
- [ ] 登录和同步路径正常。
- [ ] 不请求 Accessibility、Input Monitoring 或 Screen Recording 权限。
- [ ] 打开 Outlook/Teams 链接使用默认浏览器或系统处理器。
- [ ] 睡眠/恢复后提醒调度合理。

**Verification:**
- [ ] 使用测试账号手动验证普通事件和 Teams 会议。
- [ ] `npm test`

**Dependencies:** Task 1-8

**Files likely touched:**
- None unless QA finds bugs.

**Estimated scope:** Small

#### Task 11: 更新文档和变更记录

**Description:** 实现落地后更新架构文档、ADR 和 CHANGELOG。

**Acceptance criteria:**
- [ ] `docs/structure.md` 说明 `calendarReminderService.js`、认证模块和 IPC 边界。
- [ ] 新增 ADR 记录 Microsoft Graph 读取日程、最小权限和不读取 Teams 内容的隐私边界。
- [ ] `CHANGELOG.md` 按 `Added` / `Changed` / `Fixed` / `Removed` 标题记录。

**Verification:**
- [ ] 文档链接有效。
- [ ] `npm test`

**Dependencies:** Task 1-10

**Files likely touched:**
- `docs/structure.md`
- `docs/decisions/ADR-0xx-calendar-reminders.md`
- `CHANGELOG.md`

**Estimated scope:** Small

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Microsoft app registration 和权限 consent 配置复杂 | High | 先用开发 app registration 验证；发布前单独做 ADR 和隐私文案。 |
| 公司租户禁止用户同意 Graph 权限 | High | 明确错误提示；支持用户关闭功能；后续考虑管理员部署说明。 |
| `Calendars.ReadBasic` 字段不足以拿 Teams join URL | Medium | MVP 先用最小权限；需要 join URL 时升级到 `Calendars.Read` 并解释原因。 |
| Graph 限流或网络失败 | Medium | 低频同步、指数退避、短期缓存、错误状态展示。 |
| token 泄漏到 renderer | High | token 仅主进程持有；preload 不暴露 URL/token/原始响应；增加 IPC 测试。 |
| 日程标题属于敏感信息 | Medium | 只短期缓存未来窗口；允许关闭功能和登出清理；提醒标题可做用户设置隐藏（后续）。 |
| 提醒与久坐提醒/会议隐藏互相打扰 | Medium | 调度独立，触发前统一检查当前是否适合打扰。 |
| Webhook 需要公网服务导致复杂度膨胀 | Medium | MVP 不做 webhook，只做轮询和后续 delta sync。 |
| Teams 会议信息不在事件字段中 | Low | 提供打开 Outlook 事件作为兜底；不直接读 Teams 聊天或会议资源。 |

## Not Doing in MVP

- 不读取 Teams 聊天、频道、会议录制、会议纪要或参会记录。
- 不接入 Microsoft Graph change notification webhook。
- 不做跨设备同步或云端服务。
- 不创建、修改或删除日程。
- 不自动接受、拒绝或暂定会议邀请。
- 不读取邮件正文或从邮件推断行程。
- 不做完整日历视图，只做提醒和轻量状态。
- 不把 access token、refresh token、Graph 原始响应或原始 URL 暴露给 renderer。
- 不在 renderer 中发起 Microsoft Graph 网络请求。

## Open Questions

- 发布版是否使用项目内置 Microsoft app registration，还是要求用户/企业自行配置？
- 初始权限用 `Calendars.ReadBasic` 还是直接用 `Calendars.Read`？如果要 Teams join URL，可能需要后者。
- 是否支持个人 Microsoft 账号、工作/学校账号，还是先只支持一种？
- 日程标题是否默认显示？是否需要“隐私模式”只显示“接下来有日程”？
- 提醒提前时间是否固定 10 分钟，还是尊重 Outlook 原提醒时间优先？
- 是否需要在托盘显示“下一场会议还有 X 分钟”？

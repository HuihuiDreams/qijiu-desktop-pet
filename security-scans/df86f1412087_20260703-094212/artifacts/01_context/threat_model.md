# qijiu-desktop-pet 安全威胁建模报告 (Threat Model)

**项目名称**：qijiu-desktop-pet (岳清源 & 沈清秋 桌面爱宠)  
**当前版本**：v0.8.4  
**架构形态**：Electron (`^42.2.0`) 本地桌面跨平台应用 (Windows / macOS)  
**建模范围**：运行时主进程、渲染进程、预加载脚本、本地扫描服务及远程更新链路  
**业务上下文**：面向个人与粉丝爱好向分发；允许无代码签名证书自动更新；可接受本地配置明文存储风险。

---

## 一、 系统模型与范围剥离

### 1. 核心组件与运行时链路
本应用为纯本地静态资源驱动的互动型桌宠，核心运行时由以下边界组成：
* **主进程 (Main Process - `main.js`)**：负责生命周期管理、原生窗体创建（主宠物窗、浮动状态窗、番茄钟、城市设置、更新进度窗）、系统托盘、系统电源事件监听、数据持久化（`electron-store`）以及外部网络调度。
* **隔离安全桥 (Preload - `preload.js`, `updateProgressPreload.js`)**：利用 `contextBridge.exposeInMainWorld` 构建安全通道，严格限制渲染进程对 Node.js 原生能力的触达。
* **渲染进程 (Renderer Process - `src/*.html`)**：纯前端静态资源页面，负责宠物骨骼/帧动画渲染、多语言文案展示及用户交互事件处理。
* **后台扫描与同步服务**：
  * `weatherSyncService.js`：通过 HTTPS 向 Open-Meteo 发起天气与地理编码查询。
  * `meetingDetector.js`：调用系统原生工具（`pgrep`, `tasklist`, `netstat`, PowerShell）检测前台会议进程及 UDP 连接数。
  * `activeWindowProvider.js`：调用 PowerShell 实时采样前台活动窗口标题与坐标。

### 2. 运行时与开发/构建期剥离 (Runtime vs CI/Dev Tooling)
* **运行时范围 (In-Scope)**：打包发行的应用本体代码（`main.js`, `preload.js`, `src/**`, 核心依赖服务）。
* **开发与构建范围 (Out-of-Scope)**：
  * 构建与打包测试脚本：`tools/playwright-electron-smoke.js`, `scripts/verify-installer.js`, `scripts/afterPack.js`。
  * 开发者工具与测试用例：`test/**`, `src/debug.js`，以及 CI 自动化部署流程（`.github/**`）。

---

## 二、 信任边界与核心资产

### 1. 信任边界 (Trust Boundaries)
1. **TB-01: 公网外部 API $\rightarrow$ 主进程网络层**  
   主进程通过 HTTPS 客户端访问 `open-meteo.com`（天气数据）与 `github.com`（Release 更新检查）。该边界为公网未认证 HTTPS 流量，受公网 DNS 路由与公钥基础设施（PKI）安全约束。
2. **TB-02: 沙盒渲染进程 $\rightarrow$ 主进程 (IPC 通信边界)**  
   由 Electron 沙盒机制隔离的渲染进程上下文，通过 `ipcRenderer.send/invoke` 向主进程发起的事件边界。受 `contextIsolation: true`, `sandbox: true` 及输入白名单合约约束。
3. **TB-03: 主进程扫描服务 $\rightarrow$ 本地操作系统 shell/子进程**  
   主进程通过 `child_process.execFile` 向底层 OS 调度执行系统二进制文件（如 `powershell.exe`, `pgrep`）的边界，受系统环境变量与操作对象隔离约束。
4. **TB-04: 本地文件系统 $\rightarrow$ electron-store 配置加载**  
   操作系统普通用户空间下的应用数据目录（如 `%APPDATA%/desktop-pet`）与应用主进程读取 JSON 文件的边界。

### 2. 核心资产 (Assets)
* **高危资产 (High Sensitivity)**：
  * **主机系统控制权**：主进程拥有的当前登录用户本地 OS 执行权限。
  * **应用可执行包完整性**：下发给粉丝与用户的应用软件及更新安装包代码纯洁性。
* **中危资产 (Medium Sensitivity)**：
  * **用户本地工作状态隐私**：`activeWindowProvider.js` 实时采样的当前前台窗口标题、软件名称及 `meetingDetector.js` 检测到的会议状态。
* **低危资产 (Low Sensitivity)**：
  * **用户偏好设定**：番茄钟时长、提醒周期、当前选用的皮肤 ID 等配置项。

### 3. 攻击者能力校准 (Attacker Capabilities)
* **具备的能力**：
  * 控制公网局域网节点或公共 Wi-Fi 发起网络中间人攻击（MITM），或劫持公网 DNS。
  * 向公网第三方 API（如 Open-Meteo）注入畸形地理名称或特殊文案。
  * 在目标主机上已获得**普通用户同等权限**，可读取 AppData 目录或窥探本地环境。
* **明确不具备的能力 (Non-capabilities)**：
  * 不具备本地操作系统内核驱动级（Ring0）注入或绕过 OS 基础进程内存隔离的能力。
  * 不具备直接篡改 GitHub 官方底层存储服务器的能力（但考虑官方发布账号凭证被盗的极端面）。

---

## 三、 威胁滥用路径与风险量化表

依据 **Likelihood $\times$ Impact** 评估矩阵，结合用户明确的“面向粉丝/允许无证书/本地明文可接受”业务上下文，得出以下滥用路径排序：

| 编号 | STRIDE 分类 | 威胁滥用路径描述 (Attacker Goal & Abuse Path) | 受影响资产 | 可能性 (Likelihood) | 严重度 (Impact) | 综合评级 (Priority) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TH-01** | 篡改 (Tampering) / 权限提升 (Elevation) | **公网中间人或发布源劫持更新包导致远程代码执行**：攻击者劫持 `github.com` 更新源流量或篡改 Release 二进制包，利用**允许无代码签名证书**的基线，诱导客户端自动下载并静默覆盖安装带有后门的恶意程序。 | 主机系统控制权 / 应用完整性 | **Medium** | **High** | **已修复**（原 High） |
| **TH-02** | 跨站脚本 (XSS) / 拒绝服务 (DoS) | **第三方天气 API 畸形响应注入**：攻击者通过劫持或污染 Open-Meteo 地理编码查询结果，返回包含超长控制字符或 `<img src=x onerror=...>` 等恶意标签的城市名称，导致桌宠 UI 渲染卡死或尝试在渲染进程执行脚本。 | UI 渲染完整性 / 应用可用性 | **Low** | **Medium** | **已修复**（原 Medium） |
| **TH-03** | 篡改 (Tampering) / 信息泄露 (Information Disclosure) | **本地子进程 PATH 劫持与参数注入**：本地恶意软件篡改系统 `PATH` 环境变量，放置同名伪造的 `pgrep` 或 `powershell.exe`；或构造含特殊符号的窗口标题，诱导扫描服务在拼接命令时执行注入代码。 | 本地 OS 进程执行完整性 | **Low** | **High** | **已修复**（原 Medium） |
| **TH-04** | 信息泄露 (Information Disclosure) | **本地配置及敏感活动窗口记录探查**：本地第三方程序或恶意外挂直接读取明文 `config.json`，窃取用户开会规律及前台浏览的窗口标题记录。 | 用户本地工作状态隐私 | **High** | **Low** | **Low** |
| **TH-05** | 拒绝服务 (DoS) | **IPC 数据保存接口恶意刷写**：若渲染进程因某种隐患被攻破，攻击者疯狂调用 `window.electronAPI.saveData` 发起高频磁盘写操作，导致 IO 资源耗尽。 | 本地文件系统性能 | **Low** | **Low** | **Low** |

---

## 四、 深度风险解析与加固指南

### 1. [TH-01] 更新链路中间人攻击与无证书伪造 (高危 - 已修复)
* **技术证据**：`updateManager.js` (L16-L19) 依赖 `electron-updater` 请求 GitHub Releases。在业务确认**允许无签名证书**的分发模式下，操作系统不会在安装时弹窗拦截未签名或自签名伪造的升级包。
* **现有防御**：强制走 HTTPS 协议访问 GitHub 官方接口。
* **修复状态**：已完成更新包完整性校验与安装前验证路径加固；该威胁不再作为当前版本待修复项。
* **已完成加固**：
  1. **哈希严苛比对**：在 `autoUpdater` 的 `update-downloaded` 事件中，不要仅依赖内置校验，建议显式比对 `latest.yml` 中定义的 `sha512` 校验和。
  2. **应用层轻量级非对称验签**：即使无官方 EV 证书，也可在打包脚本 `scripts/afterPack.js` 中使用开发者自己的 Ed25519 私钥对 `.exe/.zip` 生成签名文件，并在 `updateManager.js` 触发 `quitAndInstall` 前用内置公钥验签，成本为零但能彻底封锁网络中间人替换安装包的路径。

### 2. [TH-02] 第三方天气数据 DOM 注入与污染 (中危 - 已修复)
* **技术证据**：`weatherSyncService.js` (L166-L173) 返回远程天气与城市搜索结果。
* **现有防御**：
  * `main.js` 中所有窗口启用了严格的沙盒基线 (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`)。
  * `index.html` 配置了严格的 CSP：`script-src 'self'; style-src 'self' 'unsafe-inline'`。
  * `ipcContracts.js` 对参数进行了归一化限制。
* **修复状态**：已完成天气与地理编码响应清洗、数值范围约束及前端安全渲染约束；该威胁不再作为当前版本待修复项。
* **已完成加固**：
  1. **前端文案渲染规范**：在 `src/*.js` 渲染城市名称与天气描述时，严禁使用 `element.innerHTML = ...`，务必统一使用 `element.textContent = data.city`。
  2. **结构化数值清洗**：在 `weatherSyncService.js` 拿到 Open-Meteo 数据返回给主进程前，对数值属性（如 `temperature`, `weathercode`）强制执行 `Number(val)` 及范围拦截，隔绝非法控制字符。

### 3. [TH-03] 后台扫描工具的 PATH 劫持与参数安全 (中危 - 已修复)
* **技术证据**：`meetingDetector.js` (L1) 与 `activeWindowProvider.js` (L1) 频繁通过 `child_process.execFile` 执行系统二进制命令。
* **现有防御**：
  * 弃用了危险的 `child_process.exec`（避免了系统 Shell 直接解析字符串参数）。
  * 对 PowerShell 传递参数使用了单引号严苛转义 (`quotePowerShellString`)。
* **修复状态**：已完成系统二进制调用路径锁定与参数安全处理；该威胁不再作为当前版本待修复项。
* **已完成加固**：
  1. **绝对路径绑定**：在调用 `execFile` 时，不要直接传入 `'powershell.exe'` 或 `'pgrep'`，建议使用绝对路径锁定：
     * Windows: `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
     * macOS: `/usr/bin/pgrep`  
     防止因用户系统的 `PATH` 环境变量被第三方软件恶意修改，导致桌宠误启动伪造的同名二进制程序。

### 4. [TH-04] 本地数据明文窥探 (低危 - 已确认可接受)
* **技术证据**：`electron-store` 默认以纯文本 JSON 存放在 `%APPDATA%/desktop-pet/config.json`。
* **业务校准**：基于用户确认的**“粉丝向个人爱好软件，可接受配置明文风险”**，该项判定为 Low 级合理基线。
* **边界加固建议**：当前 `ipcContracts.js` 已经白名单锁定了 `ALLOWED_STORE_KEYS`，防止渲染进程越权读取或覆盖核心系统配置，继续保持该优秀实践即可。

### 5. [TH-05] IPC 数据保存接口恶意刷写 (低危 - 暂缓修复)
* **技术证据**：`preload.js` 暴露 `window.electronAPI.saveData(key, value)`，主进程在 `main.js` 的 `save-data` IPC 处理器中调用 `electron-store` 写入本地配置。
* **现有防御**：
  * `save-data` 仅允许写入 `ALLOWED_STORE_KEYS` 白名单内的键，避免渲染进程任意创建或覆盖系统级配置。
  * 正常业务路径中的宠物状态保存主要发生在退出、系统休眠前、皮肤切换等低频事件，不存在已知的高频自动刷盘入口。
  * 该攻击路径需要“渲染进程已被攻破”作为前置条件；在当前沙盒、CSP 与 IPC 白名单基线下，风险评级维持 Low。
* **暂缓原因**：当前影响面主要是本机磁盘 IO 性能，且无法直接从外部网络触发；修复优先级低于更新链路验签、子进程绝对路径绑定等完整性风险。
* **后续加固方案**：
  1. **保存频率节流**：在 `save-data` 处理器中对同一 `webContents.id + key` 增加最小写入间隔（例如 500ms-1000ms），对过快请求直接返回失败或合并写入。
  2. **写入体积限制**：对 `petState` 等可由渲染进程提交的对象进行 JSON 序列化长度上限检查，拒绝异常大的 payload，避免单次写入造成磁盘或内存压力。
  3. **接口收敛**：后续若重构 IPC，可将通用 `saveData(key, value)` 逐步替换为更具体的 `savePetState(state)`、`saveLocale(locale)` 等专用接口，在主进程内分别执行 schema 校验。

---

## 五、 总结与安全成熟度评价

代码库在架构设计上展现了**极高的现代 Electron 安全水准**：通过 ADR-014 严格落实了沙盒隔离、权限全拦截与导航封锁；通过 `ipcContracts.js` 在主进程入口筑起了参数白名单防火墙；通过拆分 `updateProgressPreload.js` 实现了最小 API 暴露面。

在当前业务定位下，**TH-01（更新链路完整性）**、**TH-02（天气数据清洗与安全渲染）**、**TH-03（子进程路径与参数安全）** 已完成修复。**TH-04（本地明文配置）** 为已确认可接受风险；**TH-05（IPC 保存接口刷写）** 已记录节流、体积限制与接口收敛方案，但因当前前置条件苛刻、影响面较低，暂不作为当前版本必须修复项。

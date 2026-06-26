# qijiu-desktop-pet 安全最佳实践审查报告 (Security Best Practices Report)

**项目名称**：qijiu-desktop-pet (岳清源 & 沈清秋 桌面爱宠)  
**审查目标**：评估本地桌面桌宠应用代码库在运行时隔离、网络接入、数据输入边界及更新链路安全最佳实践的遵循情况。  
**当前版本**：v0.8.3  
**审查日期**：2026-06-25

---

## 一、 执行摘要 (Executive Summary)

本次审查依据行业通用安全开发最佳实践（OWASP Top 10）与官方 Electron Security Guidelines，对 `qijiu-desktop-pet` 代码库进行了全链路安全审计。审查结果表明：**应用既有安全基线优秀**，核心主进程对所有渲染窗口启用了严格的 Chromium OS 级沙盒（`sandbox: true`）与上下文隔离，严格杜绝了常规 XSS 跨站脚本执行与任意页面导航能力；同时对 IPC 跨进程数据持久化施加了白名单准入合约。

当前代码库中**不存在可被直接远程触发的 Critical 级零日运行时漏洞**。但结合业务上下文（允许无代码签名证书自动更新、公网天气查询），在**远程升级包完整性校验**与**第三方 API 响应数据运行时清洗**方面存在 2 项中高危加固空间。建议开发团队按照严重度优先级逐步实施加固，以构建“默认安全（Secure by Default）”的跨平台桌宠应用。

---

## 二、 语言与框架识别证据 (Language & Framework Identification)

1. **核心编程语言**：JavaScript / HTML / CSS
   * *证据*：`package.json` 中声明项目主入口为 `main.js`；源码由主进程 `main.js`、预加载桥 `preload.js` / `updateProgressPreload.js`、业务逻辑 `src/*.js` 及多语言配置文件构成。
2. **核心运行时与框架**：Electron (`^42.2.0`) + Node.js (后台主进程服务)
   * *证据*：`package.json` 的 `devDependencies` 明确依赖 `electron@^42.2.0` 与 `electron-builder@^26.8.1`。
3. **最佳实践指南指引**：
   * *说明*：经检索安全技能库 `references/` 目录，未发现特定于 `javascript-electron` 栈的专属参考说明。本次审查综合加载并应用了项目内置规则《Security and Hardening》、官方 [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security) 及 OWASP Top 10:2021 防御规范。

---

## 三、 分级安全发现与加固建议 (Findings by Severity & Urgency)

### 🔴 高危发现 (High Severity / High Urgency)

#### SBP-001: 远程自动升级包缺乏独立的应用层完整性与非对称签名校验
* **代码位置**：`updateManager.js` (L484-L510，具体为 `handleUpdateDownloaded` 函数中的 L509-510)
  ```javascript
  if (result.response === 0) {
    autoUpdater.quitAndInstall(false, true);
  }
  ```
* **一句话影响声明 (Impact Statement)**：若官方 GitHub Release 分发源或网络 DNS 路由被中间人劫持，攻击者可向客户端推送并让应用自动静默覆盖安装带有后门的任意恶意程序，导致用户主机系统控制权完全沦陷。
* **违背的最佳实践**：OWASP A08:2021 (软件和数据完整性故障) / 供应链安全原则。
* **详细描述**：项目在 macOS 与 Windows 上采用 `electron-updater` 进行自动升级。由于业务基线允许**无代码签名证书**的分发模式，底层操作系统在静默更新时不会拦截未签名的二进制包。当前代码在下载完成触发 `update-downloaded` 事件后，直接调用 `quitAndInstall()` 释放执行。仅依赖更新器默认机制不足以抵御网络中间人（MITM）替换二进制包或 Release 资产被劫持的极端风险。
* **加固建议**：
  1. **应用层哈希硬校验**：在触发安装前，显式比对下载文件与 `latest.yml` 中定义的 `sha512` 哈希值。
  2. **轻量级非对称自验签**：在打包后置脚本 `scripts/afterPack.js` 中使用开发者私钥对安装包签名，并在 `updateManager.js` 调用 `quitAndInstall` 前使用内置公钥验签。

---

### 🟡 中危发现 (Moderate Severity / Moderate Urgency)

#### SBP-002: 公网第三方外部 HTTP API 响应数据边界运行时类型与范围校验缺失
* **代码位置**：`weatherSyncService.js` (L170-L183 `resolveCityToCoordinates`, L190-L240 `fetchWeather`)
  ```javascript
  // L176-L177 直接提取地理编码数值
  lat: parsed.results[0].latitude,
  lon: parsed.results[0].longitude,
  // L217-L218 直接提取天气属性
  weatherCode: cw.weathercode ?? -1,
  temperature: cw.temperature ?? null,
  ```
* **违背的最佳实践**：OWASP A03:2021 (注入与边界数据验证) 与项目《Security and Hardening》规范“Validate all external input at the system boundary”。
* **详细描述**：后台服务通过 HTTPS 向公网未认证接口 (`open-meteo.com`) 发起天气查询。在收到 JSON 响应后，代码直接通过可选链和空值合并运算符解析数值属性，未显式验证变量类型（是否确为 `number`）以及物理值域（如纬度是否在 `[-90, 90]` 区间）。若遇 DNS 劫持、公共 Wi-Fi 污染或第三方接口异常，返回包含畸形超长控制字符或非数值字符串的伪造 payload，可能导致内存缓存数据污染或 UI 异常解析。
* **加固建议**：
  在将 API 结果存入 `currentWeatherData` 缓存并经 IPC 发送给渲染窗体前，显式执行数值强转与边界归一化：
  ```javascript
  const latVal = Number(parsed.results[0].latitude);
  const lonVal = Number(parsed.results[0].longitude);
  if (!Number.isFinite(latVal) || latVal < -90 || latVal > 90) return null;
  ```

---

### 🟢 低危与安全规范加固建议 (Low Severity / Best Practice Recommendations)

#### SBP-003: 子进程调用 PATH 环境变量干净兜底分支的隔离确认
* **代码位置**：`meetingDetector.js` (L39-L61 `getSystemBinaryPath`, L70-L80 `runExecFile`)、`activeWindowProvider.js` (L80-L89)
* **现状评估**：应用已遵循最佳实践，彻底弃用了危险的 `child_process.exec`（避免了 Shell 解释器直接拼接字符串参数），并显式限定了绝对路径（如 Windows 下的 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` 及 macOS 下的 `/usr/bin/pgrep`），有效防范了 PATH 劫持与参数注入。
* **建议说明**：在 `meetingDetector.js:L60` 针对非标准命令返回裸字符串 `return command;` 的兜底分支中，建议显式绑定运行时的 `env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin' }` 最小 PATH 白名单，彻底堵死自定义环境变量劫持路径。

---

## 四、 既有优秀安全架构实践 (Secure by Default Highlights)

项目在前期架构与演进（ADR-014, ADR-029）中已落实多项业界领先的防护设计：
1. **严格的沙盒隔离白名单**：`main.js` (L599, L776, L904, L1187, L1555) 中创建的所有 5 类窗体均默认声明 `contextIsolation: true`、`nodeIntegration: false` 及 `sandbox: true`，确保渲染层被黑客通过前端漏洞攻破后无法触达本地文件或执行系统命令。
2. **零导航与零新窗准入**：全局启用 `setWindowOpenHandler(() => ({ action: 'deny' }))` 与 `will-navigate` 事件拦截。
3. **安全白名单持久化合约**：在 `main.js:L1686-1708` 的 `save-data` 与 `load-data` IPC 处理器中，通过 `ALLOWED_STORE_KEYS` 白名单准入拦截，防范了任意键值写与恶意刷盘 DoS。
4. **纯粹 DOM API 驱动**：渲染进程渲染宠物骨骼与文案统一采用 `textContent` 与 `createElement`，杜绝了 `innerHTML` 带来的 XSS 隐患。

---

## 五、 修复执行建议 (Proposed Fix Roadmap)

建议遵循“每次聚焦修复单一发现（Single finding at a time）”原则并确保无功能退化，按以下顺序开展加固工作：
1. **第一阶段（建议首选）**：修复 **SBP-002**（第三方天气 API 数值边界清洗），单文件逻辑清晰，零破坏性，能显著提升公网数据容错稳定性。
2. **第二阶段**：修复 **SBP-001**（自动更新包下载完成后的 SHA512 哈希校验前置比对）。

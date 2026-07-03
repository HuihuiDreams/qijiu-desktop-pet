# Security Review: HuihuiDreams/qijiu-desktop-pet

## Scope

对整个仓库执行 repository-wide 安全扫描，重点覆盖 Electron 主进程/预加载/渲染器边界、自动更新链路、构建打包与开发辅助脚本。

- Scan mode: repository
- Target kind: git_revision
- Target ID: df86f1412087da414245d001018eead8b6a3cbe8
- Revision: df86f1412087da414245d001018eead8b6a3cbe8
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: 执行了定向 Node 测试（71/71 通过）；未做真实 GitHub 发布通道接管或中间人在线复现。
- Artifacts reviewed: artifacts/01_context/threat_model.md, artifacts/02_discovery/rank_input.jsonl, artifacts/02_discovery/deep_review_input.jsonl, artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/05_findings/validation_summary.md, artifacts/05_findings/attack_path_analysis_report.md
- Scan context: 本次扫描复用了仓库已有 threat model 文档副本，并将其复制到当前 scan context 作为审计基线。

Limitations and exclusions:
- 没有对真实 GitHub Release 做在线篡改复现。
- 没有对本地构建产物执行完整解包验证，只依据 `electron-builder` 配置和当前工作树状态判断暴露面。

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 2 |
| Severity mix | high: 1, medium: 1 |
| Confidence mix | high: 2 |
| Coverage | complete |
| Validation mode | 静态源码审计 + 发布工作流审计 + 当前工作树检查 + 定向单元测试 |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

该 Electron 桌宠应用的关键安全边界在于：渲染器到预加载/主进程的 IPC 边界、GitHub Releases 自动更新链路、主进程发起的本地命令与外部网络请求，以及本地构建/发布流程对内部工作区内容的处理。

### Assets

- 打包后客户端的代码执行完整性
- 本地工作区中的内部脚本、临时工作树与扫描报告
- Electron 主进程拥有的系统级能力
- 本地持久化配置与 UI 运行状态

### Trust Boundaries

- Renderer -\> Preload -\> Main IPC
- GitHub Releases -\> `electron-updater` -\> 本地安装器执行
- Main process -\> child_process / 本地系统命令
- Developer workspace -\> build / push helper scripts

### Attacker Capabilities

- 能控制或替换 GitHub Release 资产与元数据的人
- 能诱导开发者在脏工作树上本地构建或执行辅助推送脚本的人
- 能向渲染面提供普通网络数据但不能突破现有 sandbox 的远端服务

### Security Objectives

- 更新包在执行前必须具备独立真实性保证
- 内部工作区与扫描产物不应进入发行包或远程仓库
- 渲染器输入不应直接到达特权 Electron API
- 主进程的本地命令调用不得由用户输入控制

### Assumptions

- 用户运行的是打包后的桌面客户端。
- Windows 更新依赖 GitHub Releases 通道。
- 扫描时的仓库状态代表项目当前的实际开发工作流。

## Findings

| Finding | Severity | Confidence |
| --- | --- | --- |
| [未签名 Windows 发布路径使自动更新缺少带外真实性锚点](#finding-1) | high | high |
| [构建与推送规则会泄漏内部工作区与扫描产物](#finding-2) | medium | high |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] 未签名 Windows 发布路径使自动更新缺少带外真实性锚点

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | 发布工作流、运行时代码和发布配置三处证据直接闭环证明：存在 unsigned 发布路径，运行时只做同通道哈希比对，验证通过后会进入安装。 |
| Category | software update integrity |
| CWE | CWE-345 |
| Affected lines | .github/workflows/build-installer.yml:91-117, updateManager.js:149-159, updateManager.js:497-536, package.json:75-80 |

#### Summary

Windows 自动更新链当前允许发布未签名安装包，而客户端只把下载内容与同一发布通道中的 `sha512` 元数据做比对；一旦发布通道或其凭据被拿下，恶意更新仍会被当成合法版本安装。

#### Root Cause

被破坏的安全不变量是“更新包在执行前必须由独立于下载元数据的真实性机制证明来源可信”。当前实现一方面允许 Windows 发布走 unsigned 分支，另一方面在客户端只复核同一通道下发的 `sha512`，因此丢失了带外信任锚点。

**Workflow explicitly falls back to an unsigned Windows publish path** — `.github/workflows/build-installer.yml:89-117`

当签名密钥不存在时，工作流不会失败，而是直接发布 unsigned Windows 安装包。

```yaml
if ($hasSigningSecrets) {
  "SIGNING_ENABLED=true" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
} else {
  "SIGNING_ENABLED=false" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  Write-Warning "Windows signing secrets are not configured. Building an unsigned release for small-group distribution."
}

- name: Build and publish unsigned release
  if: env.SIGNING_ENABLED != 'true'
  run: npx electron-builder --publish ...
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_IDENTITY_AUTO_DISCOVERY: false
```

**Runtime trusts only the hash carried by the same update metadata channel** — `updateManager.js:149-159`

客户端没有校验独立签名或证书链，只校验与同一更新元数据一起下发的哈希值。

```javascript
const expectedSha512 = info.sha512 || info.files?.[0]?.sha512;
if (!expectedSha512) {
  return true;
}
const fileBuffer = fs.readFileSync(info.downloadedFile);
const actualHash = crypto.createHash('sha512').update(fileBuffer).digest('base64');
const actualHex = crypto.createHash('sha512').update(fileBuffer).digest('hex');
return actualHash === expectedSha512 || actualHex === expectedSha512.toLowerCase();
```

#### Validation

验证从发布配置开始，确认存在 unsigned Windows 发布分支；再追踪客户端更新处理，确认唯一真实性检查是同通道哈希比对，随后即可进入安装。

Validation method: static source trace + release workflow review

**Workflow explicitly falls back to an unsigned Windows publish path** — `.github/workflows/build-installer.yml:89-117`

当签名密钥不存在时，工作流不会失败，而是直接发布 unsigned Windows 安装包。

```yaml
if ($hasSigningSecrets) {
  "SIGNING_ENABLED=true" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
} else {
  "SIGNING_ENABLED=false" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  Write-Warning "Windows signing secrets are not configured. Building an unsigned release for small-group distribution."
}

- name: Build and publish unsigned release
  if: env.SIGNING_ENABLED != 'true'
  run: npx electron-builder --publish ...
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_IDENTITY_AUTO_DISCOVERY: false
```

**Runtime trusts only the hash carried by the same update metadata channel** — `updateManager.js:149-159`

客户端没有校验独立签名或证书链，只校验与同一更新元数据一起下发的哈希值。

```javascript
const expectedSha512 = info.sha512 || info.files?.[0]?.sha512;
if (!expectedSha512) {
  return true;
}
const fileBuffer = fs.readFileSync(info.downloadedFile);
const actualHash = crypto.createHash('sha512').update(fileBuffer).digest('base64');
const actualHex = crypto.createHash('sha512').update(fileBuffer).digest('hex');
return actualHash === expectedSha512 || actualHex === expectedSha512.toLowerCase();
```

**Successful hash comparison unlocks installer execution** — `updateManager.js:497-536`

只要同通道哈希比对通过，客户端就会在用户确认后执行下载到本地的安装包。

```javascript
if (!verifyDownloadedPackageIntegrity(info)) {
  ...
  return;
}
...
if (result.response === 0) {
  autoUpdater.quitAndInstall(false, true);
}
```

**The app publishes updates from GitHub Releases** — `package.json:75-80`

更新信任直接绑定到 GitHub Releases 通道，没有第二条独立真实性链。

```json
"publish": [
  {
    "provider": "github",
    "owner": "HuihuiDreams",
    "repo": "qijiu-desktop-pet"
  }
]
```

#### Dataflow

`GitHub Releases` 元数据 -\> `electron-updater` 下载 -\> `verifyDownloadedPackageIntegrity()` -\> `quitAndInstall()`

- **Source:** 攻击者替换的 Release 元数据与安装包

- **Sink:** `autoUpdater.quitAndInstall(false, true)`

- **Outcome:** Windows 客户端把恶意安装包当成合法更新执行

**Workflow explicitly falls back to an unsigned Windows publish path** — `.github/workflows/build-installer.yml:89-117`

当签名密钥不存在时，工作流不会失败，而是直接发布 unsigned Windows 安装包。

```yaml
if ($hasSigningSecrets) {
  "SIGNING_ENABLED=true" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
} else {
  "SIGNING_ENABLED=false" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  Write-Warning "Windows signing secrets are not configured. Building an unsigned release for small-group distribution."
}

- name: Build and publish unsigned release
  if: env.SIGNING_ENABLED != 'true'
  run: npx electron-builder --publish ...
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_IDENTITY_AUTO_DISCOVERY: false
```

**Successful hash comparison unlocks installer execution** — `updateManager.js:497-536`

只要同通道哈希比对通过，客户端就会在用户确认后执行下载到本地的安装包。

```javascript
if (!verifyDownloadedPackageIntegrity(info)) {
  ...
  return;
}
...
if (result.response === 0) {
  autoUpdater.quitAndInstall(false, true);
}
```

**The app publishes updates from GitHub Releases** — `package.json:75-80`

更新信任直接绑定到 GitHub Releases 通道，没有第二条独立真实性链。

```json
"publish": [
  {
    "provider": "github",
    "owner": "HuihuiDreams",
    "repo": "qijiu-desktop-pet"
  }
]
```

#### Reachability

攻击者需要拿到 GitHub Release 发布能力或相关凭据；对普通用户而言，触发路径是应用内更新流程，门槛低而后果重。

- **Attacker:** 能控制发布通道的人

- **Entry point:** 应用内“检查更新 / 下载更新”流程

- **Outcome:** 客户端执行攻击者控制的安装器

#### Severity

**High** — 一旦攻击者能够控制 GitHub Release 的元数据与安装包，客户端将执行攻击者提供的 Windows 安装器，直接形成任意代码执行。之所以不是 critical，是因为仍需要先攻陷发布通道或其发布凭据，而不是普通远程匿名攻击即可直接触发。

若项目保证 Windows 发行永远强制签名并在客户端校验证书链，可显著降低严重性；若确认更新流程可以静默安装或发布凭据暴露频繁，则严重性还会升高。

#### Remediation

把 Windows 发布改为“没有签名密钥就失败”，并在客户端增加对 Authenticode 或独立发布签名的验证；不要把 unsigned 分支作为可发布路径。

Tests:
- 在 CI 中加入断言：当 `WIN_CSC_*` 缺失时，Windows 发布工作流必须失败而不是发布 unsigned 版本。
- 增加更新链测试：模拟篡改 `latest.yml` 与安装包但不提供有效签名时，客户端必须拒绝安装。

Preventive controls:
- 对发布产物强制代码签名并校验签名证书链。
- 为发布凭据启用最小权限、轮换和独立审计。

<a id="finding-2"></a>

### [2] 构建与推送规则会泄漏内部工作区与扫描产物

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | 配置文件、辅助脚本、当前仓库跟踪状态与本次生成的扫描工作集共同提供了直接证据，不依赖推测性的运行时行为。 |
| Category | sensitive artifact exposure |
| CWE | CWE-538 |
| Affected lines | package.json:30-35, .gitignore:11-19, push.ps1:36-45, push.sh:46-55 |

#### Summary

项目的本地打包规则会把隐藏工作区内容一并纳入发行包，而辅助推送脚本又会直接 `git add .`；当前仓库已跟踪 `.codex` 内部报告，本次扫描也实际枚举到了 `.codex/tmp-baebae-pet/**`，说明内部产物可以进入后续对外链路。

#### Root Cause

被破坏的安全不变量是“开发工具产生的内部目录与扫描产物不应进入发行包或远程仓库”。当前实现既没有在打包规则里排除这些目录，也提供了会无差别暂存整个工作树的辅助脚本，因此内部产物容易沿构建或提交链路外泄。

**Packaging configuration includes the whole worktree by default** — `package.json:30-35`

打包规则默认收进整个工作树，但没有排除 `.codex/**`、`.agents/**` 或 `security-scans/**`。

```json
"files": [
  "**/*",
  "!docs/**",
  "!test/**",
  "!.github/**",
  "!dist/**"
]
```

**Ignore rules do not cover scan output or all Codex workspace files** — `.gitignore:11-19`

这里只忽略了 `.codex/tmp-*` 与 `.agents/`，没有忽略 `security-scans/`，也没有统一排除 `.codex/**`。

```gitignore
.codex/tmp-*/
*.key
*.cer
*.crt
*.der
*.p12
*.pfx
*.pem
.agents/
```

**Push helpers stage the entire worktree** — `push.ps1:36-37`

辅助脚本直接暂存整个工作树，会把扫描输出和隐藏目录变化一起带进提交。

```powershell
git add .
git commit -m "$commitMessage"
```

#### Validation

验证同时覆盖了打包规则、忽略规则、辅助提交脚本和当前仓库状态，确认该暴露面已经从理论问题变成当前工作树中的实际可见状态。

Validation method: static config review + workspace inspection

**Packaging configuration includes the whole worktree by default** — `package.json:30-35`

打包规则默认收进整个工作树，但没有排除 `.codex/**`、`.agents/**` 或 `security-scans/**`。

```json
"files": [
  "**/*",
  "!docs/**",
  "!test/**",
  "!.github/**",
  "!dist/**"
]
```

**Ignore rules do not cover scan output or all Codex workspace files** — `.gitignore:11-19`

这里只忽略了 `.codex/tmp-*` 与 `.agents/`，没有忽略 `security-scans/`，也没有统一排除 `.codex/**`。

```gitignore
.codex/tmp-*/
*.key
*.cer
*.crt
*.der
*.p12
*.pfx
*.pem
.agents/
```

**Push helpers stage the entire worktree** — `push.ps1:36-37`

辅助脚本直接暂存整个工作树，会把扫描输出和隐藏目录变化一起带进提交。

```powershell
git add .
git commit -m "$commitMessage"
```

**An internal Codex artifact is already tracked in the repository** — `.codex/migrate-to-codex-report.txt:1-13`

这证明 `.codex` 目录内容已经可以进入版本控制，而不仅仅是理论上的暴露面。

```text
Migration inventory:
  active: instruction files - 1 found
    - AGENTS.md
...
Migration report:
  rewritten: AGENTS.md - Existing Codex instructions already present at AGENTS.md.
```

#### Dataflow

开发者本地隐藏目录 / 扫描输出 -\> `package.json` 打包 glob 或 `git add .` -\> 发行包 / 仓库

- **Source:** 本地内部工作区与扫描目录

- **Sink:** 发行包内容或远程仓库提交

- **Outcome:** 内部迁移报告、临时代码片段与扫描结论对外暴露

**Packaging configuration includes the whole worktree by default** — `package.json:30-35`

打包规则默认收进整个工作树，但没有排除 `.codex/**`、`.agents/**` 或 `security-scans/**`。

```json
"files": [
  "**/*",
  "!docs/**",
  "!test/**",
  "!.github/**",
  "!dist/**"
]
```

**Push helpers stage the entire worktree** — `push.ps1:36-37`

辅助脚本直接暂存整个工作树，会把扫描输出和隐藏目录变化一起带进提交。

```powershell
git add .
git commit -m "$commitMessage"
```

**An internal Codex artifact is already tracked in the repository** — `.codex/migrate-to-codex-report.txt:1-13`

这证明 `.codex` 目录内容已经可以进入版本控制，而不仅仅是理论上的暴露面。

```text
Migration inventory:
  active: instruction files - 1 found
    - AGENTS.md
...
Migration report:
  rewritten: AGENTS.md - Existing Codex instructions already present at AGENTS.md.
```

#### Reachability

不需要远程攻击能力，只需要开发者在脏工作树上执行本地构建或辅助推送脚本；这让问题更容易在日常开发中被误触发。

- **Attacker:** 获得发行包或仓库读取权限的外部接收者

- **Entry point:** 本地构建与辅助推送工作流

- **Outcome:** 读取内部产物与临时代码片段

#### Severity

**Medium** — 该问题通常导致信息暴露而非直接代码执行，但触发前提并不高，只要开发者在带有残留产物的工作树上本地打包或使用辅助脚本推送即可发生，而且一旦暴露会影响所有发行包接收者或仓库读者。

若确认构建永远在干净 CI checkout 中执行且本地辅助脚本不用于正式发布，可降低严重性；若这些目录中出现凭据或更敏感内部内容，则严重性应上调。

#### Remediation

在 `package.json` 中显式排除 `.codex/**`、`.agents/**`、`security-scans/**` 等内部目录，并把辅助推送脚本改成仅暂存显式允许的已跟踪文件。

Tests:
- 构建前放入伪造的 `.codex/secret.txt` 与 `security-scans/demo.txt`，打包后验证二者不会出现在 `app.asar` 中。
- 为辅助推送脚本增加测试：存在未跟踪扫描目录时，脚本应拒绝直接 `git add .` 或至少给出阻断。

Preventive controls:
- 把内部工具目录统一列入打包排除清单与 `.gitignore`。
- 正式发布只允许在干净 CI checkout 上构建，避免使用带残留状态的本地工作树。

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Windows 自动更新 / GitHub Releases | 软件更新真实性 / 供应链完整性 | Reported | 高优先级问题。Windows 发布工作流允许 unsigned 发布，而客户端只验证同通道哈希后即可安装。 Evidence: artifacts/02_discovery/finding_discovery_report.md, artifacts/05_findings/f01-unsigned-windows-update-chain/candidate_ledger.jsonl, artifacts/05_findings/f01-unsigned-windows-update-chain/validation_report.md, artifacts/05_findings/f01-unsigned-windows-update-chain/attack_path_analysis_report.md, artifacts/05_findings/validation_summary.md, artifacts/05_findings/attack_path_analysis_report.md |
| 构建与推送辅助脚本 | 敏感产物暴露 | Reported | 中优先级问题。内部工作区与扫描产物可通过本地打包或 `git add .` 辅助脚本进入对外链路。 Evidence: artifacts/02_discovery/finding_discovery_report.md, artifacts/02_discovery/work_ledger.jsonl, artifacts/05_findings/f02-workspace-artifact-packaging-leak/candidate_ledger.jsonl, artifacts/05_findings/f02-workspace-artifact-packaging-leak/validation_report.md, artifacts/05_findings/f02-workspace-artifact-packaging-leak/attack_path_analysis_report.md, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| Electron IPC 边界 | XSS 到特权升级 / IPC 滥用 | No issue found | 复核了 `preload.js`、`main.js`、`ipcContracts.js`，未发现原始桥接泄漏或权限放开。 Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| Renderer DOM 与窗口页面 | DOM XSS / 导航逃逸 | No issue found | 已审 HTML 页面具有 CSP，动态 UI 构建主要使用 `textContent`、`createElement`、`replaceChildren` 等安全 API。 Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| 会议检测与活动窗口获取 | 命令注入 / PATH 劫持 | No issue found | 本地命令调用采用 `execFile` 与受控参数拼装，未发现可利用的命令注入。 Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| 天气同步与城市设置 | SSRF / 远端内容注入 | No issue found | 请求目标固定为 Open-Meteo 相关主机，未发现可控 HTML 直达渲染或广义 SSRF。 Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| `.codex/tmp-baebae-pet/**` 临时目录 | 临时目录误纳入后续链路 | Reported | 该临时目录不作为运行时代码独立成洞，但它被工作集实际枚举，作为产物暴露问题的直接证据保留。 Evidence: artifacts/02_discovery/rank_input.jsonl, artifacts/02_discovery/deep_review_input.jsonl, artifacts/02_discovery/work_ledger.jsonl, artifacts/03_coverage/repository_coverage_ledger.md |

## Open Questions And Follow Up

- 是否计划彻底取消 unsigned Windows 发布路径，并把发布失败而非降级发布作为默认策略？
  - Follow-up prompt: 请基于 commit `df86f1412087` 之后涉及 `.github/workflows/build-installer.yml` 与 `updateManager.js` 的改动，复核 Windows 更新链是否已改成强制签名与客户端签名校验。
- 本地正式发布是否允许在带有 `security-scans/` 或 `.codex/**` 残留的工作树上执行？
  - Follow-up prompt: 请基于 commit `df86f1412087` 之后涉及 `package.json`、`.gitignore`、`push.ps1`、`push.sh` 的改动，复核是否已统一排除内部工具目录与扫描产物。

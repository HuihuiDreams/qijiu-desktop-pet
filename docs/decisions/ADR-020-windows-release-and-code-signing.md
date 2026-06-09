# ADR-020: Windows Release 与代码签名发布策略

## Status
Accepted

## Date
2026-05-11

## 2026-05-11 补充
`0.1.8` 起，Windows 代码签名从强制要求调整为可选能力。当前应用只面向小范围分发，
因此当仓库未配置 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD` 时，发布 workflow
可以继续构建未签名的 NSIS 安装包。后续如果分发范围扩大，公开发布仍应优先使用
Authenticode 签名。

## Context
项目已经具备 Windows NSIS 安装包能力，并通过 GitHub Releases 面向普通用户分发。近期发布链路连续做了几类调整：

1. `package.json` 中配置 GitHub Releases 作为 `electron-builder` 的发布源。
2. `.github/workflows/build-installer.yml` 支持 `v*` tag 触发发布构建。
3. 手动执行 workflow 时，先创建或复用与 `package.json` version 匹配的 tag，再在同一次 workflow 中继续构建发布，避免“只创建 tag、不构建安装包”的问题。
4. 发布版本升级到 `0.1.7`。
5. 针对 Microsoft Edge / SmartScreen 对未签名 `.exe` 的提示，新增 Windows Authenticode 代码签名发布流程。

这些改动共同指向同一个决策：Windows 安装包不再只是“能构建”，而是要形成可重复、可验证、适合公开分发的发布链路。

## Decision
我们决定将 Windows 发布流程固定为：

1. **发布源使用 GitHub Releases**
   - `electron-builder` 的 `publish` 配置指向当前 GitHub 仓库。
   - Release 资产包含安装包、`.blockmap` 和 `latest.yml`，为后续自动更新能力保留基础。

2. **版本与 tag 强绑定**
   - 手动 workflow 输入版本号时，统一归一化为 `vX.Y.Z`。
   - 该 tag 必须与 `package.json` 中的 `version` 一致。
   - 如果远端 tag 已存在且指向当前提交，则允许继续；如果指向其它提交，则中止。

3. **手动发布与 tag 发布共用同一构建 job**
   - `workflow_dispatch` 先运行 `create-release-tag`。
   - `build-windows-installer` 通过 `needs` 和条件表达式在同一次 workflow 中继续执行。
   - `push tags: v*` 仍可直接触发发布构建。

4. **代码签名作为可选发布能力**
   - GitHub Actions 会检测是否存在 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`。
   - 如果存在签名 secrets，workflow 将其映射到 `electron-builder` 使用的 `CSC_LINK` / `CSC_KEY_PASSWORD`，并临时启用 `build.win.signAndEditExecutable`。
   - 如果不存在签名 secrets，workflow 继续构建未签名安装包，并生成 `dist/UNSIGNED-RELEASE.txt` 标记当前发布状态。
   - 仅在签名发布时执行 `npm run verify:signatures`，用 `Get-AuthenticodeSignature` 验证生成的 `dist/*.exe`。

5. **签名材料不得进入仓库**
   - `.gitignore` 忽略 `.pfx`、`.p12`、`.pem` 等证书/私钥文件。
   - `docs/release-code-signing.md` 记录如何配置 GitHub Secrets、如何本地测试签名、以及 SmartScreen 的预期。

## Alternatives Considered
### 仅上传 GitHub Actions artifact
- Pros: 实现简单，便于调试。
- Cons: artifact 不是稳定的面向用户分发源，也不能作为自动更新客户端的正式发布源。
- Rejected: 公开安装包和后续自动更新都需要 GitHub Releases 资产。

### 手动 workflow 只创建 tag，让另一个 tag workflow 再构建
- Pros: 流程概念上分离。
- Cons: GitHub Actions 使用 `GITHUB_TOKEN` 创建 tag 时，后续 tag 触发链路容易被事件递归保护影响，导致只创建 tag、不继续发布。
- Rejected: 手动发布必须在同一次 workflow 中完成 tag 创建和安装包构建，减少不可见失败。

### 允许发布未签名安装包
- Pros: 不需要证书成本，发布门槛低。
- Cons: Edge / SmartScreen / Windows 安全提示会显著影响普通用户信任；企业环境和杀软误报风险也更高。
- Accepted for small-group release: 当前小范围分发可以接受未签名安装包；面向外部用户扩大分发时，不应把未签名安装包作为长期策略。

### 使用自签名证书
- Pros: 本地测试方便。
- Cons: 对普通用户和 SmartScreen 信誉几乎没有帮助，还可能制造“看似签名但不可信”的误解。
- Rejected: 正式发布必须使用受信任的代码签名证书或等价的受信任签名服务。

### 将证书文件放入仓库
- Pros: CI 配置更直接。
- Cons: 私钥泄漏风险不可接受。
- Rejected: 签名材料必须通过 GitHub Secrets 或专用签名服务管理。

## Consequences
- 发布流程更灵活：缺少签名 secret 时，发布 workflow 会继续生成未签名安装包，并明确记录该发布状态。
- 版本发布更可追踪：tag、`package.json` version、Release 资产保持一致。
- 签名发布时用户信任度更高：安装包可以显示已验证发布者，并减少“未知发布者”的安全提示。
- SmartScreen 警告不会立刻完全消失：新应用和新文件 hash 仍需要积累文件信誉和发布者信誉。
- 本地开发和小范围发布可继续使用 `npm run build` 生成未签名安装包；公开发布以 CI 签名结果为准。
- 后续若接入 Microsoft Trusted Signing、EV/OV 证书轮换或硬件密钥签名，只需要替换签名 secret / 签名服务配置，发布策略本身不变。

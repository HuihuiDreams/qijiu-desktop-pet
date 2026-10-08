# Git 提交与发布流程 (Git & Release Workflow)

基于 `git-workflow-and-versioning` 技能规范，本项目采用严格但高效的 Trunk-Based Development（主干开发）模式。

为了保证每一次变更都可追溯、可读，且符合本项目的文档规范，特制定此提交、推送与发布工作流（Workflow）。无论是由人类开发者还是 AI Agent 执行推送，都**必须严格遵守此流程**。

---

## 🌐 跨平台 Git 配置 (Cross-Platform Git Setup)

本项目会在 Windows、WSL 和 macOS 上共同开发。仓库通过根目录 `.gitattributes` 统一文本文件换行符为 `LF`，避免不同系统的 `core.autocrlf` 默认值把大量文件误标记为 modified。

在一台新机器上首次开发本项目时，建议执行：

```bash
git config --global core.autocrlf false
git config --global core.eol lf
```

在本仓库内也可以固定本地配置，避免被全局配置影响：

```bash
git config core.autocrlf false
git config core.eol lf
git config core.filemode false
```

如果刚切换到这套规则后看到大量仅由换行符引起的变更，请单独执行一次归一化并独立提交，避免和业务改动混在一起：

```bash
git add --renormalize .
git status
```

---

## 🚀 推送工作流 (Push Workflow)

在执行任何 `git push` 操作前，必须遵循以下步骤：

### Step 1: 检查 `CHANGELOG.md` 是否已更新
**规则**：每次推送新功能、修复或重构前，必须检查本次代码变更是否已经记录在 `CHANGELOG.md` 中。
* **Agent 操作指南**：使用 `git status` 或读取文件状态，检查 `CHANGELOG.md` 是否在修改列表中，并确认条目覆盖本次准备提交的改动。文档与技能更新也必须记录；仅有文件变动不代表内容已正确同步。

### Step 2: 补充 `CHANGELOG.md`（若未更新）
如果发现代码已改动但 CHANGELOG 未更新，必须先进行更新：
1. 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。
2. 在 `[Unreleased]` 下归类到合适的英文标题：`Added`、`Changed`、`Fixed`、`Removed` 或 `Security`。条目正文必须使用清晰中文（代码术语与专有名词除外），追加到对应分类末尾；同一版本内不得重复分类标题。
3. 关联相关的决策文档：如果本次更新有重大架构变动，需在条目末尾附加上 `(ADR-XXX)` 链接。

### Step 3: 执行原子化提交 (Atomic Commits)
所有的提交信息必须包含“原因（Why）”而不仅仅是“做了什么（What）”。

**Commit 格式规范**：
```text
<type>: <short description>

<body explaining why>
```
* **可选 Type**: `feat` (新功能), `fix` (修复), `refactor` (重构), `test` (测试), `docs` (文档), `chore` (构建/依赖配置)。

提交信息应作为一个包含真实换行的参数传给下文的 `push.ps1` 或 `push.sh`，由脚本完成提交与推送。

### Step 4: 推送至远程仓库 (Push)
提交前检查当前分支与待提交内容：

```bash
git branch --show-current
git status --short
git diff --check
git diff
git diff --cached
```

行为变更先更新 `test/` 中的对应测试，运行聚焦检查和 `npm test`；真实 Electron 集成检查按需使用 `npm run test:e2e`。同步相关结构文档或 ADR。纯文档修改核对路径、命令及说明即可。

完成检查后使用下文的项目推送脚本。两个脚本都会执行 `git add .` 并推送本地 `main` 到 `origin main`，因此运行前须确认当前在 `main`，且工作区全部改动属于本次原子提交；脚本不会替你拆分无关改动，也不会自动运行测试。

---

## 🛠️ 自动化工具 (Automation Tools)

项目根目录提供 `push.ps1`（Windows PowerShell）和 `push.sh`（macOS / Linux / WSL），提交推送使用对应脚本。

**使用方法**：
在 PowerShell 中运行：
```powershell
$commitMessage = @'
fix: 修复拖曳状态下意外触发互动的问题

在 InteractionSystem 中增加 isDragging 守卫，避免拖曳中的坐标重叠触发互动。
'@
.\push.ps1 -commitMessage $commitMessage
```

macOS / Linux / WSL 在 Bash 中运行：

```bash
./push.sh 'fix: 修复拖曳状态下意外触发互动的问题

在 InteractionSystem 中增加 isDragging 守卫，避免拖曳中的坐标重叠触发互动。'
```

该脚本的工作流逻辑：
1. 拦截检查：自动检测 `git status` 中是否包含 `CHANGELOG.md`。
2. 如果未包含，脚本会拦截提交，并自动用系统默认编辑器打开 `CHANGELOG.md`，强制要求你填写更新记录。
3. 填写保存后重新运行，脚本执行 `git add .`，检查暂存区新增或修改的 `.codex/`、`.agents/`、`security-scans/` 文件；`.agents/skills/` 是允许纳入版本管理的例外。发现受限制路径时会执行 `git reset` 取消暂存并停止。
4. 检查通过后执行 `git commit -m "你的信息"`，成功后执行 `git push origin main`。WSL 中 Bash Git 推送失败且存在 `git.exe` 时，`push.sh` 会尝试通过 Windows Git 凭据重试。

脚本只检查 `CHANGELOG.md` 是否出现在文件状态中，不校验中文条目、分类、提交信息或测试结果。脚本打印的 `[WIP]` 模板是旧提示，实际应按 `[Unreleased]` 规范填写。

---

## 🛑 避坑指南 (Red Flags)
* ❌ **"修复了几个bug"** —— 这是不合格的 commit message。必须具体说明修复了什么、为什么这么修。
* ❌ **把新功能和格式化代码混在一个 commit 里** —— 请遵循“分离关注点”（Keep Concerns Separate）。重构是重构，功能是功能。
* ❌ **连续好几天不 commit** —— Commit 是存档点。每完成一个独立的小模块就该 commit 一次（Commit Early, Commit Often）。

---

## 发布流程

本项目通过 GitHub Actions 发布 Windows 和 macOS 安装包。当前主流程是：

1. 准备版本、发布说明和用户说明。
2. 运行 `Release Preflight` 做发布前检查。
3. 运行 `Build Installers` 创建或复用 tag，同时构建 Windows 与 macOS 产物并上传到草稿 Release。
4. 检查两个平台的产物、安装启动与发布说明，然后手动发布 Release。
5. 发布后在真实安装包中验证更新路径。

实现依据为 [Release Preflight](../.github/workflows/release-preflight.yml)、[Build Installers](../.github/workflows/build-installer.yml) 与 [package.json](../package.json)。本地提交推送遵循本文前面的流程。

### 1. 准备版本改动

发布前先在仓库中准备好版本和文档：

1. 将 `[Unreleased]` 中本次发布的条目移入目标版本段落，例如 `## [0.8.4] - 2026-06-29`，保留新的空 `[Unreleased]`；按 `Added`、`Changed`、`Fixed`、`Removed`、`Security` 归类，每个分类标题只出现一次。
2. 同步根目录 `README.md` 与 `readme_zh.txt`、`readme_en.txt`、`readme_ja.txt` 的用户说明，其中三份 `.txt` 会作为 Release 资产上传。
3. 如果发布策略、打包行为或更新机制变化，更新相关文档或 ADR，例如 `docs/release-code-signing.md`、`docs/decisions/ADR-020-windows-release-and-code-signing.md`、`docs/decisions/ADR-026-macos-manual-update-executable-name.md`。
4. 本地使用 `npm version <version> --no-git-tag-version --allow-same-version` 同步 `package.json` 与 `package-lock.json`，然后通过项目推送脚本提交准备改动。`Release Preflight` 手动运行时，若 `package.json` 与输入版本不一致，会自动执行该命令并推送版本同步提交；若两者已一致，它不会单独检查锁文件版本，因此仍需本地核对锁文件。

### 2. 本地检查

Windows 本地检查：

```powershell
npm test
npm run verify:installer
npm audit --omit=dev --audit-level=high
npm run protect:assets
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win --dir --config.win.signAndEditExecutable=false --publish never
npm run verify:package
```

macOS 本地检查应在 macOS 机器上执行：

```bash
npm test
npm audit --omit=dev --audit-level=high
npm run protect:assets
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir --publish never
npm run verify:package
```

`verify:installer` 检查 Windows 构建所需配置与脚本是否存在，不校验成品安装包。直接调用 `npx electron-builder` 不会执行 npm 的 `prebuild`，因此必须先生成受保护皮肤资源。`verify:package` 在构建后检查 `dist/**/app.asar`，拒绝将内部指引或工作目录打入应用；它不替代下载完整性或代码签名验证。

macOS 打包后需要确认 `.app` 包内真实可执行文件名仍是 `DeskPet`，并且 `CFBundleExecutable` 也是 `DeskPet`。CI 会自动做这项检查；本地若改动了 `package.json`、`scripts/afterPack.js` 或 macOS 打包配置，也应手动确认。

### 3. 运行 Release Preflight

在 GitHub Actions 手动运行 `Release Preflight`：

- `version`: 填目标版本，可写 `0.8.4` 或 `v0.8.4`。

这个 workflow 也会在相关 pull request 上自动运行。手动运行时，它会验证：

- 输入版本是否为 `X.Y.Z` 或 `vX.Y.Z`（不接受预发布或构建元数据），以及 `package.json` 是否匹配；不一致时同步两个版本文件并推送版本提交。
- `CHANGELOG.md` 是否包含目标版本段落。
- 目标 GitHub tag 是否已经存在。
- 根目录三份 `readme*.txt` 是否存在。
- Windows 签名 secrets 是否存在；缺失时只提示将发布未签名 Windows 安装包。
- Windows 单元测试、安装包前置检查、生产依赖安全审计、受保护皮肤资源生成、未签名 `--dir` smoke build 和包内容检查。
- macOS 单元测试、生产依赖安全审计、受保护皮肤资源生成、未签名 `--dir` smoke build、包内容检查，以及 `DeskPet` 包内可执行文件元数据检查。

版本、日志与 tag 的元数据检查仅在手动运行时执行；两个平台的构建检查也会在匹配路径的 pull request 上运行。若预检生成了新提交，应同步本地与所选分支，并针对同步后的提交重新运行预检，再启动正式构建。`Build Installers` 没有强制依赖预检，也不自动运行 `npm test` 或 E2E，因此需要自行确认预检覆盖的是将要发布的源码。

### 4. 运行 Build Installers

`Release Preflight` 通过后，手动运行 `Build Installers`：

- `version`: 填同一个版本，可写 `0.8.4` 或 `v0.8.4`。

手动运行时，workflow 会先执行 `create-release-tag`：

- 要求输入版本与 `package.json` 的 `version` 对应。
- 如果 `vX.Y.Z` tag 不存在，会在当前提交上创建并推送。
- 如果 tag 已存在，会复用已有 tag，两个平台的构建 job 会检出该 tag；不会将 tag 移到本次所选提交。运行前必须确认 tag 指向预检通过的源码。

随后 workflow 会同时构建：

- Windows NSIS 安装包。
- macOS DMG 和 ZIP。

直接推送 `v*` tag 也可以触发同一套构建 job。

两个平台都先生成受保护皮肤资源，以 `--publish never` 构建，再检查包内容。随后通过 `gh release upload --clobber` 上传资产；Release 不存在时创建草稿，已存在时保留其原状态，同名资产会被覆盖。重新运行已公开版本的构建前，应确认是否确实需要替换资产。

两个 job 全部成功后，在 GitHub Releases 中检查安装包、更新元数据、三语说明和发布说明。先从草稿下载产物验证安装与启动，再手动发布；工作流没有自动发布草稿的步骤。GitHub Actions 构件仅保留 7 天，正式分发使用 Release 资产。

### 5. Windows 发布行为

Windows 使用 `electron-builder --publish never` 生成安装包，由 GitHub CLI 上传到 Release；应用内继续使用 `electron-updater` 检查、下载和安装更新。

签名规则：

- 如果配置了 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`，workflow 会启用 Windows Authenticode 签名，并运行 `npm run verify:signatures`。
- 如果没有配置签名 secrets，workflow 会构建未签名安装包，并生成 `UNSIGNED-RELEASE.txt`。小范围分发可以接受这个状态；扩大公开分发时应优先配置受信任代码签名。

Windows Release 资产应至少包含：

- `desktop-pet-setup-<version>.exe`
- `.blockmap`
- `latest.yml`
- `readme_zh.txt`
- `readme_en.txt`
- `readme_ja.txt`
- 未签名发布时的 `UNSIGNED-RELEASE.txt`

### 6. macOS 发布行为

macOS 当前没有 Apple Developer ID 签名和公证流程；workflow 关闭证书自动发现，`scripts/afterPack.js` 将启动文件改为 `DeskPet` 后，对 `.app` 执行递归 ad-hoc 签名。这不是 Developer ID 签名或公证，用户仍可能遇到 Gatekeeper 拦截。应用内检查更新时，macOS 不走 Squirrel.Mac 自动安装，而是读取 GitHub 最新 Release，并引导用户打开下载页面手动下载 DMG。

macOS Release 资产应至少包含：

- `desktop-pet-setup-<version>-x64.dmg`
- `desktop-pet-setup-<version>-arm64.dmg`
- 对应架构的 `.zip`
- `latest-mac.yml`
- `readme_zh.txt`
- `readme_en.txt`
- `readme_ja.txt`

macOS 手动更新说明必须保持一致：

1. 先从托盘菜单完全退出当前应用。
2. 下载新版 DMG。
3. 将应用拖入 Applications 并替换旧版本。
4. 如果首次打开被 Gatekeeper 拦截，再在“系统设置 -> 隐私与安全性”中允许打开，或按说明运行 `xattr -cr /Applications/七九爱宠.app`。

### 7. 发布后的更新验证

手动发布草稿后，至少做一次真实安装包验证；草稿阶段不能验证普通用户的最新 Release 更新发现路径。

Windows：

- 安装上一个已发布版本。
- 通过托盘菜单执行“检查更新”。
- 如果 GitHub Releases 上存在更高版本和完整 `latest.yml`，应提示下载。
- 下载完成且 SHA-512 完整性校验通过后应提示重启并安装；校验失败应显示错误，不能安装该下载包。
- 如果当前已经是最新版本，应显示当前版本已是最新版本。
- 如果 Release 元数据暂时缺失或 GitHub 返回 404，应用会降级为“已是最新版本”一类的用户可理解提示；正式公开发布前仍应补齐 `latest.yml`。

macOS：

- 安装上一个已发布版本。
- 通过托盘菜单执行“检查更新”。
- 如果 GitHub 最新 Release 版本更高，应提示前往下载页面，而不是尝试静默自动安装。
- 按 DMG 覆盖安装流程验证新版可启动。
- 确认 macOS 包内 `CFBundleExecutable` 和真实启动文件仍为 `DeskPet`。

### 8. 失败处理

- `CHANGELOG.md` 缺少版本段落：补齐目标版本段落后重新运行 `Release Preflight`。
- `package.json` / `package-lock.json` 版本不一致：优先本地修正并提交；仅当 `package.json` 与输入版本不一致时，手动 `Release Preflight` 才会自动同步，不能依赖它修复单独的锁文件不一致。
- tag 已存在：确认 tag 指向的提交就是要发布的源码；如果不是，不要复用该 tag。
- Windows 未签名发布：用户可能看到 Windows 或 Edge 的未知发布者提示，这是未签名小范围分发的预期行为。
- Windows 签名失败：检查 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`、证书有效期和 `docs/release-code-signing.md`。
- macOS 启动失败：优先检查包内可执行文件是否为 `DeskPet`，以及用户是否先退出旧版本再覆盖安装。
- 包内容检查失败：检查 `package.json` 的打包排除规则，修正后重新生成并验证产物，避免分发包含内部工作目录的包。
- 构建成功但用户检查不到新版：确认两个平台的资产和更新元数据齐全，且 Release 已从草稿手动发布。
- 源码压缩包：workflow 只能删除上传资产列表中名称匹配 `source code` 的文件；[GitHub 自动提供的源码链接](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)（`Source code (zip)` / `Source code (tar.gz)`） 不属于普通上传资产，不能靠该步骤移除。下载说明应明确让用户选择 `.exe` 或对应架构的 `.dmg`。

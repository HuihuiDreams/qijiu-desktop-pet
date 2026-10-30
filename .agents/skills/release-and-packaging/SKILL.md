---
name: release-and-packaging
description: >-
  Build, verify, sign, and release DeskPet desktop application packages for Windows and macOS.
  Use when building NSIS installers, DMGs, or ZIP packages, auditing ASAR package contents,
  verifying code signatures, preparing releases, or triggering and debugging GitHub Actions release workflows.
---

# DeskPet 发布打包与签名合规流水线 (Release and Packaging Pipeline)

本技能定义了《DeskPet 岳清&沈九修仙桌宠》从本地预检、安装包构建、ASAR 内容安全审计，到云端 GitHub Actions 双平台交叉验证与正式发布的完整端到端标准作业流程（SOP）。

---

## 架构原则与安全防线

1. **ASAR 产物内容隔离（防代码与敏感配置泄露）**
   - 最终打包的 `app.asar` 必须经过 [`scripts/verify-package-contents.js`](scripts/verify-package-contents.js) 严密审计。
   - 严禁包含 `.agents/`、`.codex/`、`.claude/`、`.geminirules`、`AGENTS.md`、`CLAUDE.md`、`security-scans/` 以及明文源码 WebP。
2. **受保护皮肤资产机制**
   - 打包前必须运行 `npm run protect:assets` 生成 `protected-assets/` 密文；`package.json` 中的 `build.files` 会主动排除 `src/assets/*/*.webp` 明文图片（详见 [ADR-040](docs/decisions/ADR-040-encrypted-skin-assets.md)）。
3. **macOS 二进制执行文件名 ASCII 规范化**
   - 在 [`scripts/afterPack.js`](scripts/afterPack.js) 中，打包后自动将 `Contents/MacOS/七九爱宠` 重命名为 `Contents/MacOS/DeskPet`，更新 `Info.plist` 的 `CFBundleExecutable` 并执行 ad-hoc 重新签名（`codesign --force --deep --sign -`），杜绝中文执行文件名引发的更新异常及 ARM64 启动崩溃（详见 [ADR-026](docs/decisions/ADR-026-macos-manual-update-executable-name.md)）。
4. **Windows 代码签名与 PowerShell 安全边界**
   - 打包脚本调用 PowerShell（如 `scripts/set-win-icon.ps1`）必须通过 `resolveWindowsPowerShellPath` 从 `SystemRoot` 解析绝对路径，杜绝路径劫持（详见 [ADR-020](docs/decisions/ADR-020-windows-release-and-code-signing.md) 与 [ADR-029](docs/decisions/ADR-029-security-audit-and-local-hardening.md)）。
5. **本地预检 vs 云端 CI 的互补防线**
   - **本地技能**：执行快速自测（Fail-Fast），在提交前拦截测试失败、CHANGELOG 格式错误、ASAR 漏打文件等本地可查问题。
   - **云端 Preflight**：提供 Windows 与 macOS 真实虚拟机的并发交叉验证、Secrets 证书探测以及自动版本号同步。

---

## 阶段一：本地发布前自测 SOP (Local Preflight)

在提交代码或发起发版之前，必须在本地完成以下检查：

### 1. 安装包环境与依赖校验
```bash
npm run verify:installer
```
确认 `package.json`、`main.js`、`preload.js`、`build/installer.nsh`、`scripts/afterPack.js` 均存在。

### 2. 全量自动化测试与三语 Readme 校验
```bash
npm test
```
同时确认根目录存在三语说明文件：`readme_zh.txt`、`readme_en.txt`、`readme_ja.txt`。

### 3. 版本号与 CHANGELOG.md 对齐
- 确定本次发布版本号（严格遵守 SemVer，如 `0.11.3`）。
- 检查 `package.json` 中的 `"version": "0.11.3"`。
- 在 `CHANGELOG.md` 中，将本次发布的改动从 `## [Unreleased]` 整理归档到正式小节：
  ```markdown
  ## [0.11.3] - YYYY-MM-DD
  
  ### Added
  - ...
  ### Changed
  - ...
  ### Fixed
  - ...
  ```
  > **注意**：每个分类标题（`Added`, `Changed`, `Fixed` 等）在同一版本下**严禁重复出现**。

### 4. 刷新受保护皮肤资产
```bash
npm run protect:assets
```
确保 `protected-assets/manifest.json` 与 `.dat` 密文为最新状态。

### 5. 本地快速冒烟打包 (Smoke Package)
在本地生成免安装目录包，验证打包配置无语法错误：

```bash
# macOS 本地打包
npx electron-builder --mac --dir

# Windows 本地打包 (PowerShell)
npx electron-builder --win --dir --config.win.signAndEditExecutable=false
```

### 6. 审计 ASAR 产物合规性
```bash
npm run verify:package
```
验证解包产物中无内部 Agent 目录、无本地临时配置、无明文 WebP。

### 7. (Windows 本地可选) 验证代码签名
若配置了本地 Windows Authenticode 证书（详见 [`docs/release-code-signing.md`](docs/release-code-signing.md)）：
```powershell
npm run verify:signatures
```

### 8. 提交并推送到仓库
使用项目安全提交脚本：
```bash
# macOS / Linux
./push.sh "chore(release): prepare v0.11.3"

# Windows PowerShell
.\push.ps1 "chore(release): prepare v0.11.3"
```

---

## 阶段二：云端双平台终检守卫 (Release Preflight)

代码推送到 `main` 后，在正式构建安装包前，触发 GitHub Actions 的 Preflight 工作流进行 Windows + macOS 跨平台终检。

### 触发方式
* **网页端**：
  1. 进入 GitHub 仓库 -> **Actions** -> 选择 **Release Preflight**。
  2. 点击 **Run workflow**。
  3. 在 `Release version to validate` 输入框中填入版本号（例如 `0.11.3`）。
* **GitHub CLI (`gh`)**：
  ```bash
  gh workflow run release-preflight.yml -f version="0.11.3"
  ```

### Preflight 自动执行的校验
1. **版本与元数据**：验证 SemVer 格式；检查 `CHANGELOG.md` 是否存在 `## [0.11.3]`；若 `package.json` 版本不一致，自动提交并推回仓库。
2. **签名机密探测**：检测 `WIN_CSC_LINK` 与 `WIN_CSC_KEY_PASSWORD`，确认是否具备已签名构建条件。
3. **Windows 虚拟机 (`windows-latest`)**：执行 `npm ci`、`npm test`、`npm audit`、`npm run protect:assets`、构建 Windows smoke package 并运行 `npm run verify:package`。
4. **macOS 虚拟机 (`macos-latest`)**：执行 `npm ci`、`npm test`、`npm audit`、`npm run protect:assets`、构建 macOS smoke package、运行 `npm run verify:package`，并通过 `plutil` 严格核验 `七九爱宠.app` 内的 `DeskPet` 可执行文件名与 plist 元数据。

---

## 阶段三：云端正式构建与发布 (Build Installers)

当 Release Preflight 变成绿色成功状态后，触发正式安装包构建。

### 触发方式
* **网页端**：
  1. 进入 GitHub 仓库 -> **Actions** -> 选择 **Build Installers**。
  2. 点击 **Run workflow**。
  3. 输入确认的版本号（如 `0.11.3`）。
* **GitHub CLI (`gh`)**：
  ```bash
  gh workflow run build-installer.yml -f version="0.11.3"
  ```

### 产物与交付
1. **自动打 Tag**：工作流会自动创建并推送 `v0.11.3` Git Tag。
2. **Windows 交付物**：
   - `desktop-pet-setup-0.11.3.exe` (NSIS 安装程序)
   - `latest.yml` (自动更新元数据)
3. **macOS 交付物**：
   - `desktop-pet-setup-0.11.3-x64.dmg` / `.zip`
   - `desktop-pet-setup-0.11.3-arm64.dmg` / `.zip`
   - `latest-mac.yml` (自动更新元数据)
4. **GitHub Release**：产物将自动上传至对应的 GitHub Release 草稿或公开发布页。

---

## 常见故障排查 Runbook

| 现象 / 报错 | 原因分析 | 解决措施 |
| :--- | :--- | :--- |
| `Forbidden internal files found in packaged app` | 打包产物中混入了 `.agents`、`.claude`、`.codex` 等本地配置 | 检查 `package.json` 的 `build.files` 排除项，并运行 `npm run verify:package` 定位具体违规文件 |
| `Expected CFBundleExecutable to be DeskPet, got: 七九爱宠` | macOS 打包后未完成可执行文件重命名 | 检查 `scripts/afterPack.js` 是否被 `package.json` 的 `afterPack` 正确挂载，并确认 `plutil` 执行权限 |
| macOS 启动闪退 `Permission Denied (1100)` | 修改 `Info.plist` 后未重新进行 ad-hoc 签名 | 确保 `scripts/afterPack.js` 中包含 `codesign --force --deep --sign -` 逻辑 |
| `CHANGELOG.md is missing a '## [x.y.z]' release section` | Preflight 无法在更新日志中找到对应版本段落 | 检查 `CHANGELOG.md` 标题格式，必须为 `## [0.11.3]`，且不要有多余的前缀或空格 |
| `Cannot resolve trusted Windows PowerShell path` | Windows 宿主环境缺失 `SystemRoot` 环境变量 | 确保运行环境为合法的 Windows 宿主，检查系统环境变量 `SystemRoot` 是否指向 `C:\Windows` |

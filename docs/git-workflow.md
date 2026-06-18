# Git 提交流程与规范 (Git Workflow & Versioning)

基于 `git-workflow-and-versioning` 技能规范，本项目采用严格但高效的 Trunk-Based Development（主干开发）模式。

为了保证每一次变更都可追溯、可读，且符合本项目的文档规范，特制定此提交与上传工作流（Workflow）。无论是由人类开发者还是 AI Agent 执行推送，都**必须严格遵守此流程**。

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
* **Agent 操作指南**：使用 `git status` 或读取文件状态，检查 `CHANGELOG.md` 是否在修改列表中。如果你在前面的对话中已经修改了代码，但没有修改 CHANGELOG，则**禁止直接 Push**。

### Step 2: 补充 `CHANGELOG.md`（若未更新）
如果发现代码已改动但 CHANGELOG 未更新，必须先进行更新：
1. 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。
2. 归类到合适的英文标题下：`Added` (新增), `Changed` (修改), `Fixed` (修复), `Removed` (移除)。条目正文可以使用中文。
3. 关联相关的决策文档：如果本次更新有重大架构变动，需在条目末尾附加上 `(ADR-XXX)` 链接。

### Step 3: 执行原子化提交 (Atomic Commits)
所有的提交信息必须包含“原因（Why）”而不仅仅是“做了什么（What）”。

**Commit 格式规范**：
```text
<type>: <short description>

<optional body explaining why, not what>
```
* **可选 Type**: `feat` (新功能), `fix` (修复), `refactor` (重构), `test` (测试), `docs` (文档), `chore` (构建/依赖配置)。

**示例**：
```bash
git add .
git commit -m "fix: 修复拖曳状态下意外触发互动的问题

在 InteractionSystem 中增加 isDragging 守卫，防止拖曳中的坐标重叠导致互动被意外消耗，从而优化拖放体验。"
```

### Step 4: 推送至远程仓库 (Push)
确保上述所有步骤都已完成，代码已本地 commit 后，最后执行：
```bash
git push -u origin main
```

---

## 🏷️ Release 准备工作流 (Release Prep Workflow)

准备正式版本发布时，除了上面的 Push Workflow，还必须先同步版本文件：

1. 确认目标版本号，例如 `0.7.0`，并使用同一个版本号贯穿所有文件与 GitHub Actions 输入。
2. 本地运行：

   ```bash
   npm version 0.7.0 --no-git-tag-version --allow-same-version
   ```

   这会同时更新 `package.json` 和 `package-lock.json`，避免两者版本不一致。
3. 将 `CHANGELOG.md` 顶部的 `[Unreleased]` 内容落版为 `## [0.7.0] - YYYY-MM-DD`，并保留新的空 `[Unreleased]` 段供后续开发使用。
4. 如果发布说明、安装包行为、自动更新或签名策略变化，同步更新 `docs/release-workflow.md`、`docs/release-code-signing.md` 或相关 ADR。
5. 提交后先运行 `Release Preflight`，输入 `0.7.0` 或 `v0.7.0`；通过后再运行 `Build Installers`。发布 tag 使用 `v0.7.0` 形式，并且必须与 `package.json` 的 `version` 保持一致。

---

## 🛠️ 自动化工具 (Automation Tools)

为了方便人类开发者快速执行，我们在项目根目录提供了一个自动化脚本 `push.ps1`（针对 Windows 环境）。

**使用方法**：
在 PowerShell 中运行：
```powershell
.\push.ps1 "feat: 增加了新功能"
```

该脚本的工作流逻辑：
1. 拦截检查：自动检测 `git status` 中是否包含 `CHANGELOG.md`。
2. 如果未包含，脚本会拦截提交，并自动用系统默认编辑器打开 `CHANGELOG.md`，强制要求你填写更新记录。
3. 填写保存后重新运行，脚本会自动执行 `git add .` -> `git commit -m "你的信息"` -> `git push`。

---

## 🛑 避坑指南 (Red Flags)
* ❌ **"修复了几个bug"** —— 这是不合格的 commit message。必须具体说明修复了什么、为什么这么修。
* ❌ **把新功能和格式化代码混在一个 commit 里** —— 请遵循“分离关注点”（Keep Concerns Separate）。重构是重构，功能是功能。
* ❌ **连续好几天不 commit** —— Commit 是存档点。每完成一个独立的小模块就该 commit 一次（Commit Early, Commit Often）。

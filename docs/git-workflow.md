# Git 提交流程与规范 (Git Workflow & Versioning)

基于 `git-workflow-and-versioning` 技能规范，本项目采用严格但高效的 Trunk-Based Development（主干开发）模式。

为了保证每一次变更都可追溯、可读，且符合本项目的文档规范，特制定此提交与上传工作流（Workflow）。无论是由人类开发者还是 AI Agent 执行推送，都**必须严格遵守此流程**。

---

## 🚀 推送工作流 (Push Workflow)

在执行任何 `git push` 操作前，必须遵循以下步骤：

### Step 1: 检查 `CHANGELOG.md` 是否已更新
**规则**：每次推送新功能、修复或重构前，必须检查本次代码变更是否已经记录在 `CHANGELOG.md` 中。
* **Agent 操作指南**：使用 `git status` 或读取文件状态，检查 `CHANGELOG.md` 是否在修改列表中。如果你在前面的对话中已经修改了代码，但没有修改 CHANGELOG，则**禁止直接 Push**。

### Step 2: 补充 `CHANGELOG.md`（若未更新）
如果发现代码已改动但 CHANGELOG 未更新，必须先进行更新：
1. 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。
2. 归类到合适的标签下：`Added` (新增), `Changed` (修改), `Fixed` (修复), `Removed` (移除)。
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

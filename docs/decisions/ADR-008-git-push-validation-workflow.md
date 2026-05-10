# ADR-008: Git 提交强制验证工作流 (Git Push Validation Workflow)

## 状态 (Status)
Accepted

## 日期 (Date)
2026-04-28

## 背景 (Context)
随着开发迭代加快，开发者（包括 AI Agent）容易在修改代码后忘记更新 `CHANGELOG.md`。这会导致项目版本记录与实际代码脱节，不利于长期维护。

## 决策 (Decision)
1. **规范化**：建立 `docs/git-workflow.md` 规范，规定所有 Push 操作前必须同步更新 Changelog。
2. **工具自动化**：编写项目专属的 `push.ps1` PowerShell 脚本，替代原生的 `git push`。
3. **拦截逻辑**：
   - 脚本通过 `git status --porcelain` 检查暂存区/工作区。
   - 若检测不到 `CHANGELOG.md` 的变动，则强制中止流程并弹出文件提示更新。
   - 只有验证通过后，才自动执行 `git add`, `git commit` 和 `git push`。

## 替代方案 (Alternatives Considered)
- **Git Pre-commit Hook**: 比较标准的做法。
  - *Rejected*: 在 Windows 环境下配置 Husky 或原生的 Hook 对普通用户不够友好，且难以实现“自动打开文件提醒填写”的强交互效果。
- **CI/CD Check**: 
  - *Rejected*: GitHub Actions 只能在上传后发现问题，无法在本地上传前拦截，且无法引导开发者补写记录。

## 影响 (Consequences)
- 保证了项目文档的实时性。
- 降低了因人为疏忽导致的版本混乱风险。
- 开发者需要适应使用脚本提交的新习惯。

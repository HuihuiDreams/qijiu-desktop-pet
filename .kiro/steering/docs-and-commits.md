---
inclusion: always
---

# 文档、版本与提交规范

## 计划与文档同步
每完成一个任务或阶段,立即:
1. 在当前 `docs/plan/*.md` 中勾选已完成项(`- [x]`),让 macOS / Windows 上的其他 agent 看到准确进度。
2. 更新 `CHANGELOG.md`、`docs/structure.md` 以及相关 ADR(`docs/decisions/`),并加上明确的交叉链接,例如 `[ADR-048](docs/decisions/ADR-048-modern-web-standards-adoption.md)`。
3. 多阶段计划按阶段做原子提交:每个阶段连同测试、计划勾选与文档一起提交,不把多个阶段合并成一个大提交。
4. 涉及安全或复杂重构的改动,要向用户给出手动验证步骤,确认行为没有退化。

## CHANGELOG.md
- 变更只能归入这几个英文标题:`Added`、`Changed`、`Fixed`、`Removed`、`Security`。
- 同一版本标题下不得重复出现同名小节(例如两个 `Fixed`),要合并。
- `Unreleased` 下的条目直接写在 `## [Unreleased]` 之后,用清晰的中文书写(代码术语和专有名词除外),并与已发布版本标题严格分开。
- 相关时链接 ADR。
- 尽早运行 `./push.sh`(或 `.\push.ps1`),让预检提前发现 CHANGELOG 格式错误。

## 提交
使用原子提交,格式如下:

```text
<type>: <short description>

<body explaining why>
```

提交与推送使用 `./push.sh` 或 `.\push.ps1`,让项目安全检查运行。

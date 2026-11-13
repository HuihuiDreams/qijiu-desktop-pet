# ADR-049: 主分支向好兆头分支自动同步

## Status
Accepted

## Date
2026-11-07

## Context
`main`（岳七 & 沈九）与 `cp/crowley-aziraphale`（好兆头）共享引擎代码，但皮肤、台词与应用身份各自独立。此前通用修复需要手动 cherry-pick，容易遗漏，也容易把专属内容带过去。

## Decision
1. **GitHub Actions + 脚本**：`main` 推送触发 [sync-to-cp.yml](../../.github/workflows/sync-to-cp.yml)，由 [sync-to-cp.js](../../scripts/sync-to-cp.js) 在临时 `git worktree` 中逐提交 cherry-pick、跑 `npm test`，通过后立即推送；冲突或测试失败时回滚当前提交并停止批次，使后续运行从失败项重试。尚无同步标记时从两分支共同祖先恢复。每验证成功 1 条即推向远端，避免超时丢弃已验证提交。
2. **启发式优先，AI 只能否决**：专属路径、品牌文案与 workflow 文件由确定性规则拒绝且不可被 AI 推翻；AI 仅对触及共享敏感配置的提交做二次否决，避免提示词注入把专属内容带入；AI 复核失败时保持 fail-open 但在报告中明确标注原因留痕。
3. **精准去重与日志脱敏**：提交去重严格依赖 `(cherry picked from commit <sha>)` 标记与补丁空 staged diff 兜底，不使用提交标题查重以免误吞同名提交；合并 `CHANGELOG.md` 时自动过滤包含七九专属设定的 bullet 条目，杜绝原版角色名泄漏至好兆头分支。
4. **仅使用 GitHub Models + 临时 `GITHUB_TOKEN`**（`permissions: models: read`），不引入 Gemini / OpenAI 等长期第三方 Key。
5. **凭据隔离**：checkout 使用 `persist-credentials: false`；`fetch` / `push` 的 `http.extraheader` 仅通过 Git 子进程的配置环境变量传递，避免失败时命令参数泄漏编码后的 Token。`npm ci` / `npm test` 子进程剥离 Token 环境变量。
6. **改动 `.github/workflows/*` 的提交不自动同步**：默认 `GITHUB_TOKEN` 无 `workflows` 权限，推送会被拒绝，需手动同步。
7. **目标分支依赖隔离**：首次验证前在临时工作树按目标分支锁文件执行 `npm ci`；依赖文件改变后重新安装，不复用 main 的 `node_modules`。
8. **合并提交**：按 main 第一父提交遍历；合并提交作为一个整体，以第一父提交为基准评估与 cherry-pick，保留冲突解决结果。被合并提交中的显式跳过指令同样拒绝整个合并提交。

## Alternatives Considered
以下取舍均来自上文 Context 与 Decision 的理由，此处集中列出被放弃的方案：
- **继续手动 cherry-pick**：Context 已指出容易遗漏，也容易把专属内容带过去。放弃。
- **以 AI 判定为主**：提示词注入可能把专属内容带入好兆头分支。保留确定性启发式规则作为不可推翻的拒绝依据，AI 只能否决。
- **接入 Gemini / OpenAI 等长期第三方 Key**：多一份需要保管的长期凭据。改用 GitHub Models 和临时 `GITHUB_TOKEN`。
- **批次结束后一次性推送**：大批次触发 Actions 超时时，已验证的提交会被整体丢弃并重复挑拣。改为每验证 1 条就推送。
- **按提交标题查重**：常见标题（如 `fix: typo`）会误吞新的修复提交。改用 `(cherry picked from commit <sha>)` 标记与空补丁检测。
- **复用 main 的 `node_modules` 做验证**：两个分支的锁文件可能不同，验证结果不可信。改为在临时工作树按目标分支锁文件安装依赖。
- **同步 `.github/workflows/*` 改动**：默认 `GITHUB_TOKEN` 没有 `workflows` 权限，推送会被拒绝。这类提交需手动同步。

## Consequences
- 被判定不适用的提交不会推进同步锚点，会在最多 50 个提交的窗口内被重复评估；更大积压需用 `workflow_dispatch` 的 `commits` 参数手动补跑。
- 详细流程见 [docs/git-workflow.md](../git-workflow.md)。

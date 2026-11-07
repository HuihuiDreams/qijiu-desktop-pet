# ADR-049: 主分支向好兆头分支自动同步

## Status
Accepted

## Date
2026-11-07

## Context
`main`（岳七 & 沈九）与 `cp/crowley-aziraphale`（好兆头）共享引擎代码，但皮肤、台词与应用身份各自独立。此前通用修复需要手动 cherry-pick，容易遗漏，也容易把专属内容带过去。

## Decision
1. **GitHub Actions + 脚本**：`main` 推送触发 [sync-to-cp.yml](../../.github/workflows/sync-to-cp.yml)，由 [sync-to-cp.js](../../scripts/sync-to-cp.js) 在临时 `git worktree` 中逐提交 cherry-pick、跑 `npm test`，通过后推送；失败只回滚单个提交。
2. **启发式优先，AI 只能否决**：专属路径、品牌文案与 workflow 文件由确定性规则拒绝且不可被 AI 推翻；AI 仅对触及共享敏感配置的提交做二次否决，避免提示词注入把专属内容带入。
3. **仅使用 GitHub Models + 临时 `GITHUB_TOKEN`**（`permissions: models: read`），不引入 Gemini / OpenAI 等长期第三方 Key。
4. **凭据隔离**：checkout 使用 `persist-credentials: false`，仅在 `fetch` / `push` 时通过一次性 `http.extraheader` 注入认证，`npm ci` / `npm test` 子进程剥离 Token 环境变量。
5. **改动 `.github/workflows/*` 的提交不自动同步**：默认 `GITHUB_TOKEN` 无 `workflows` 权限，推送会被拒绝，需手动同步。

## Consequences
- 被判定不适用的提交不会推进同步锚点，会在最多 50 个提交的窗口内被重复评估；更大积压需用 `workflow_dispatch` 的 `commits` 参数手动补跑。
- 详细流程见 [docs/git-workflow.md](../git-workflow.md)。

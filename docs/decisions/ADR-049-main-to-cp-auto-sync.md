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
9. **仅属于 main 的工作文档**：`MAIN_ONLY_WORKING_DOC_FILES`（目前是 `docs/plan/audit-verification-remediation-plan.md`）与同步基建文件一样，在 cherry-pick 时被丢弃，且只改动它们的提交判定为不适用。该文件只记录 main 的修复进度，目标分支没有它；被整体跳过的提交（如修改 workflow 的提交）对它的改动丢失后，后续提交的上下文就会在目标分支冲突。
10. **文档冲突不阻塞代码同步**：`docs/**/*.md` 在目标分支有意分叉（例如好兆头分支没有 `docs/git-workflow.md` 的同步章节），cherry-pick 时这类文件的冲突改为保留目标分支版本，代码部分照常同步，并在报告的说明里列出被跳过的文档。根目录的 `AGENTS.md` 与 `.geminirules` 同样适用：它们描述各分支自己的脚本（好兆头分支没有 `sync:cp`、`test:e2e:ci` 与 `test/docLinks.test.js`），main 改到这些行时曾让 `82d4ff9` 冲突并卡住后续所有提交。若跳过上述冲突后只剩 `CHANGELOG.md`（或没有任何文件）存在暂存改动，则整体回退并跳过本次提交，不再写入失实的纯日志提交。代价是 main 对这两个文件的冲突改动不会进入目标分支，需要时在目标分支手动对齐。其余文件的冲突仍然回滚当前提交并停止批次。
11. **纯锁文件冲突自动重生成**：当分支间传递依赖锁定版本轻微漂移导致 `package-lock.json` 冲突时，若 `package.json` 的依赖声明字段（`dependencies` / `devDependencies` / `overrides` 等，不含纯 `scripts` 或元信息修改）在本提交中实际发生变更且无冲突、唯一剩余的非文档/非日志冲突仅为 `package-lock.json`，且目标分支与来源提交均存在该锁文件，则在恢复目标分支锁文件与好兆头包身份后运行 `npm install --package-lock-only --ignore-scripts` 就地重生成锁文件，并核对来源提交 `package-lock.json` 中新增或升级的依赖版本均已保留在重生成后的锁文件中，最后再交由 `npm ci` 与 `npm test` 门禁验证；若来源依赖升级未保留（如 npm 保留了满足范围的旧传递依赖）、仅修改了 `package.json` 非依赖字段、属于纯锁文件升级或伴随其他文件冲突，则回滚并阻塞本次同步。

## Alternatives Considered
以下取舍均来自上文 Context 与 Decision 的理由，此处集中列出被放弃的方案：
- **继续手动 cherry-pick**：Context 已指出容易遗漏，也容易把专属内容带过去。放弃。
- **以 AI 判定为主**：提示词注入可能把专属内容带入好兆头分支。保留确定性启发式规则作为不可推翻的拒绝依据，AI 只能否决。
- **接入 Gemini / OpenAI 等长期第三方 Key**：多一份需要保管的长期凭据。改用 GitHub Models 和临时 `GITHUB_TOKEN`。
- **批次结束后一次性推送**：大批次触发 Actions 超时时，已验证的提交会被整体丢弃并重复挑拣。改为每验证 1 条就推送。
- **按提交标题查重**：常见标题（如 `fix: typo`）会误吞新的修复提交。改用 `(cherry picked from commit <sha>)` 标记与空补丁检测。
- **复用 main 的 `node_modules` 做验证**：两个分支的锁文件可能不同，验证结果不可信。改为在临时工作树按目标分支锁文件安装依赖。
- **同步 `.github/workflows/*` 改动**：默认 `GITHUB_TOKEN` 没有 `workflows` 权限，推送会被拒绝。这类提交需手动同步。
- **冲突时删除锁文件重建或直接覆盖目标锁文件**：删除重建会顺带升级所有无关传递依赖，直接采用 main 锁文件则会丢失目标分支基线。改用保留目标分支现有锁文件并执行 `npm install --package-lock-only --ignore-scripts`。

## Consequences
- 被判定不适用的提交不会推进同步锚点，会在最多 50 个提交的窗口内被重复评估；更大积压需用 `workflow_dispatch` 的 `commits` 参数手动补跑。
- 性能优化（2026-11-22）：`scripts/sync-to-cp.js` 在遍历提交前通过单次 `git log` 批量预读取已同步 `(cherry picked from commit <sha>)` 集合与候选提交元数据（含作者、父节点与变更文件），并仅在敏感共享文件校验或实际触发 AI 复核时延迟拉取 `git show` diff，减少大量重复子进程派生开销。变更文件列表使用 `--no-renames`，改名提交同时列出新旧路径，专属文件改名后仍会被拦截；合并提交只列第一父提交带入的文件，与 `cherry-pick -m 1` 实际应用的内容一致。批量读取失败时逐个提交用同一组参数重读，两条路径的判定结果相同。
- 详细流程见 [docs/git-workflow.md](../git-workflow.md)。

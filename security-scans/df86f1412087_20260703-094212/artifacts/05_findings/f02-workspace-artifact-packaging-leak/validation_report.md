# 验证报告：构建与推送规则会泄漏内部工作区与扫描产物

- 方法：静态配置审计 + 当前工作树检查 + 扫描工件检查
- 关键证据：
  - `package.json` 使用 `**/*` 打包而未显式排除 `.codex/**` / `security-scans/**`
  - `.gitignore` 仅忽略 `.codex/tmp-*/` 与 `.agents/`，未忽略 `security-scans/`
  - `push.ps1` 与 `push.sh` 都使用 `git add .`
  - 当前仓库已跟踪 `.codex/migrate-to-codex-report.txt`，且本次扫描工作集实际枚举了 `.codex/tmp-baebae-pet/**`
- 结论：该问题成立。它既能让内部产物进入发行包，也能让扫描输出被辅助脚本误提交。

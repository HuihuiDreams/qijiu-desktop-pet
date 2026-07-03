# 验证汇总

## 方法
- 静态源码追踪
- GitHub Actions 发布工作流复核
- 当前工作树与已生成扫描工件检查
- 定向单元测试运行

## 结果
1. `f01-unsigned-windows-update-chain`：保留。证据直接来自 `updateManager.js`、`.github/workflows/build-installer.yml` 与 `package.json`。
2. `f02-workspace-artifact-packaging-leak`：保留。证据直接来自 `package.json`、`.gitignore`、`push.ps1`、`push.sh` 与当前仓库状态。

## 未保留候选
- Renderer / preload / IPC / child_process / weather 输入面未发现可落地问题。

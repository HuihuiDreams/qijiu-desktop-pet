# 验证报告：未签名 Windows 发布路径使自动更新缺少带外真实性锚点

- 方法：静态源码追踪 + 发布工作流审计
- 关键证据：
  - `updateManager.js` 仅将下载包与同通道元数据中的 `sha512` 比对
  - 验证通过后会进入 `autoUpdater.quitAndInstall(false, true)`
  - `.github/workflows/build-installer.yml` 明确存在 unsigned Windows 发布分支
  - `package.json` 把发布源固定到 GitHub Releases
- 结论：该问题成立。当前实现没有要求 Windows 更新包具备独立签名或其他带外真实性证明。
- 未做的复现：未实际篡改 GitHub Release 做线上攻击复现。

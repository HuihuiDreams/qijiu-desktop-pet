# 攻击路径报告：未签名 Windows 发布路径使自动更新缺少带外真实性锚点

## 数据流
`GitHub Releases metadata/latest.yml` -> `electron-updater` 下载更新 -> `verifyDownloadedPackageIntegrity()` 使用同通道 `sha512` 校验 -> `quitAndInstall()`

## 可达性
- 触发者：能控制 GitHub Release 资产与元数据的人，或能使用相应发布凭据的人
- 入口：打包后的 Windows 客户端执行“检查更新 / 下载更新”
- 结果：客户端把攻击者提供的安装包当成合法更新执行

## 影响
- 后果是用户设备上的任意代码执行
- 缺失 Authenticode 或独立签名验证，使发布账户安全成为单点信任

# Windows 代码签名发布说明 (Windows Code Signing Release Notes)

本项目使用 `electron-builder` 构建 Windows NSIS 安装包。公开版本发布建议使用 Authenticode 签名，以便 Windows 和 Microsoft Edge 能够显示已验证的发布者，而不是将安装包视为未知应用。对于小范围分发版本，在付费购买代码签名证书尚不划算时，可以选择在不签名的情况下进行构建。

## 变更内容

- 默认禁用 `build.win.signAndEditExecutable`，以便小范围分发版本在没有付费签名凭据的情况下也能完成构建。
- GitHub release 工作流会自动检测签名机密（secrets）。如果存在这些机密，它会构建并验证已签名的安装包；如果缺失，它将构建未签名的安装包，并将此情况记录在 `dist/UNSIGNED-RELEASE.txt` 中。
- `scripts/verify-signatures.ps1` 脚本使用 `Get-AuthenticodeSignature` 来检查生成的 `.exe` 文件。
- git 会忽略证书文件扩展名，以降低意外提交私有签名材料的风险。

## 可选的 GitHub 密钥 (GitHub Secrets)

如果您希望发布已签名的公开版本，请添加以下仓库机密。该工作流会将它们映射到 `electron-builder` 所需的 `WIN_CSC_*` 和 `CSC_*` 环境变量。如果未配置这些机密，发布工作流仍将创建未签名的安装包。

| 密钥 (Secret) | 值 (Value) |
| --- | --- |
| `WIN_CSC_LINK` | Base64 编码的 `.pfx` 或 `.p12` 证书，或其他 `electron-builder` 支持的证书引用 |
| `WIN_CSC_KEY_PASSWORD` | 证书的密码 |

要在 Windows 本地对证书文件进行编码：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\windows-code-signing.pfx")) | Set-Content -NoNewline "WIN_CSC_LINK.txt"
```

将 `WIN_CSC_LINK.txt` 的内容填入名为 `WIN_CSC_LINK` 的 GitHub 仓库密钥中，将证书密码填入 `WIN_CSC_KEY_PASSWORD`。

**切勿将证书文件或密码提交至此仓库。**

## 本地构建

默认进行未签名的本地构建：

```powershell
npm run build
```

要在本地测试签名，请设置当前终端会话的环境变量，并在构建前启用签名：

```powershell
$env:WIN_CSC_LINK = "C:\path\to\windows-code-signing.pfx"
$env:WIN_CSC_KEY_PASSWORD = "certificate-password"
npx electron-builder --config.win.signAndEditExecutable=true
npm run verify:signatures
```

## 发布验证

完成发布构建后，验证生成的安装包：

```powershell
npm run verify:signatures
```

预期结果：
- 所有生成的 `dist/*.exe` 文件均报告 `Status: Valid`（状态：有效）。
- 签名者主题显示预期的发布者身份。

## SmartScreen 预期行为

代码签名能提升应用可信度，但可能无法立即消除新应用或新文件哈希的 SmartScreen 警告。Microsoft SmartScreen 会评估发布者声誉和文件声誉。在新安装包的警告完全消失之前，可能仍需要积累一定的下载量/历史记录。

参考链接：
- https://www.electron.build/code-signing.html
- https://www.electron.build/code-signing-win.html
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options

# Release Workflow

本项目的 Windows 发布分为两步：先做发布前检查，再构建并发布安装包。

## 1. 准备版本改动

1. 更新 `package.json` 和 `package-lock.json` 的 `version`。
2. 在 `CHANGELOG.md` 新增对应版本段落，例如 `## [0.3.0] - 2026-05-21`。
3. 确认根目录存在 `readme.txt`、`readme_en.txt`、`readme_ja.txt` 三份面向用户的发布说明。
4. 如果发布策略变化，补充 `docs/decisions/` 下的 ADR 或更新相关文档。
5. 本地运行：

```powershell
npm test
npm run verify:installer
npm audit --omit=dev --audit-level=high
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win --dir --config.win.signAndEditExecutable=false
```

## 2. 运行 Release Preflight

在 GitHub Actions 手动运行 `Release Preflight`：

- `version`: 填目标版本，例如 `0.3.0`

这个 workflow 会自动验证：

- `package.json`、`package-lock.json`、`CHANGELOG.md` 的版本一致性
- GitHub tag 是否已经存在
- Windows 签名 secrets 是否存在
- 单元测试、安装包前置检查、生产依赖安全审计
- 未签名 Windows `--dir` 构建烟测

## 3. 发布安装包

`Release Preflight` 通过后，手动运行 `Build Windows Installer`：

- `version`: 填同一个版本，例如 `0.3.0`

如果仓库没有配置 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`，workflow 会生成未签名安装包，并上传 `UNSIGNED-RELEASE.txt` 说明。小范围分发可以接受这个状态；扩大公开分发时再配置受信任代码签名。

## 4. 发布后的更新验证

GitHub Release 应包含这些更新相关资产：

- Windows 安装包 `.exe`，文件名应与 `latest.yml` 中的 `path` / `files[].url` 一致。
- 安装包 `.blockmap`
- `latest.yml`
- `readme.txt`、`readme_en.txt`、`readme_ja.txt`

发布完成后，在已安装版本中通过托盘菜单手动执行“检查更新”。预期行为：

- 如果 GitHub Releases 上存在更高版本和完整元数据，应提示可下载更新。
- 如果当前版本已经是最新版本，应显示当前版本已是最新版本。
- 如果小范围发布暂时缺少 `latest.yml` 或 GitHub 返回 404，应用会降级为“已是最新版本”提示，避免把元数据缺失展示成用户侧错误；正式公开发布前仍应补齐 `latest.yml`。
- 本项目保留中文 `productName` 用于应用展示，但发布资产使用 ASCII `artifactName`，避免自动更新元数据引用的文件名与 GitHub Release 资产不一致。

## 5. 失败处理

- 版本不一致：先修 `package.json`、`package-lock.json` 和 `CHANGELOG.md`。
- tag 已存在：重新运行 `Build Windows Installer` 会复用既有 tag。
- 未签名发布：用户可能看到 Windows 或 Edge 的未知发布者提示，这是预期行为。
- 签名发布失败：检查 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD` 和证书有效期。

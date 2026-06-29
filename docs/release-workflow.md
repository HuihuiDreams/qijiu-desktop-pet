# Release Workflow

本项目通过 GitHub Actions 发布 Windows 和 macOS 安装包。当前主流程是：

1. 准备版本、发布说明和用户说明。
2. 运行 `Release Preflight` 做发布前检查。
3. 运行 `Build Installers` 创建或复用 tag，并同时构建 Windows 与 macOS 产物。
4. 在真实安装包中验证更新路径。

## 1. 准备版本改动

发布前先在仓库中准备好版本和文档：

1. 确认 `CHANGELOG.md` 有目标版本段落，例如 `## [0.8.4] - 2026-06-29`，并按 `Added`、`Changed`、`Fixed`、`Removed` 归类。
2. 更新根目录 `readme.txt`、`readme_en.txt`、`readme_ja.txt`，这些文件会作为 Release 资产上传。
3. 如果发布策略、打包行为或更新机制变化，更新相关文档或 ADR，例如 `docs/release-code-signing.md`、`docs/decisions/ADR-020-windows-release-and-code-signing.md`、`docs/decisions/ADR-026-macos-manual-update-executable-name.md`。
4. 推荐本地先把 `package.json` 和 `package-lock.json` 的 `version` 改到目标版本。`Release Preflight` 的手动运行可以在版本不一致时自动执行 `npm version <version> --no-git-tag-version --allow-same-version` 并推送同步提交，但正式发布前仍要确认提交历史清晰。

## 2. 本地检查

Windows 本地检查：

```powershell
npm test
npm run verify:installer
npm audit --omit=dev --audit-level=high
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win --dir --config.win.signAndEditExecutable=false
```

macOS 本地检查应在 macOS 机器上执行：

```bash
npm test
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir
```

macOS 打包后需要确认 `.app` 包内真实可执行文件名仍是 `DeskPet`，并且 `CFBundleExecutable` 也是 `DeskPet`。CI 会自动做这项检查；本地若改动了 `package.json`、`scripts/afterPack.js` 或 macOS 打包配置，也应手动确认。

## 3. 运行 Release Preflight

在 GitHub Actions 手动运行 `Release Preflight`：

- `version`: 填目标版本，可写 `0.8.4` 或 `v0.8.4`。

这个 workflow 也会在相关 pull request 上自动运行。手动运行时，它会验证：

- `package.json`、`package-lock.json` 与输入版本是否一致；不一致时自动同步并推送版本提交。
- `CHANGELOG.md` 是否包含目标版本段落。
- 目标 GitHub tag 是否已经存在。
- 根目录三份 `readme*.txt` 是否存在。
- Windows 签名 secrets 是否存在；缺失时只提示将发布未签名 Windows 安装包。
- Windows 单元测试、安装包前置检查、生产依赖安全审计和未签名 `--dir` smoke build。
- macOS 单元测试、未签名 `--dir` smoke build，以及 `DeskPet` 包内可执行文件元数据检查。

## 4. 运行 Build Installers

`Release Preflight` 通过后，手动运行 `Build Installers`：

- `version`: 填同一个版本，可写 `0.8.4` 或 `v0.8.4`。

手动运行时，workflow 会先执行 `create-release-tag`：

- 要求输入版本与 `package.json` 的 `version` 对应。
- 如果 `vX.Y.Z` tag 不存在，会在当前提交上创建并推送。
- 如果 tag 已存在，会复用已有 tag，然后继续构建。

随后 workflow 会同时构建：

- Windows NSIS 安装包。
- macOS DMG 和 ZIP。

直接推送 `v*` tag 也可以触发同一套构建 job。

## 5. Windows 发布行为

Windows 使用 `electron-builder` 发布到 GitHub Releases，并继续使用 `electron-updater` 做应用内更新检查、下载和安装。

签名规则：

- 如果配置了 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`，workflow 会启用 Windows Authenticode 签名，并运行 `npm run verify:signatures`。
- 如果没有配置签名 secrets，workflow 会构建未签名安装包，并生成 `UNSIGNED-RELEASE.txt`。小范围分发可以接受这个状态；扩大公开分发时应优先配置受信任代码签名。

Windows Release 资产应至少包含：

- `desktop-pet-setup-<version>.exe`
- `.blockmap`
- `latest.yml`
- `readme.txt`
- `readme_en.txt`
- `readme_ja.txt`
- 未签名发布时的 `UNSIGNED-RELEASE.txt`

## 6. macOS 发布行为

macOS 当前没有 Apple Developer ID 签名和公证流程，因此发布 workflow 构建未签名 DMG/ZIP。应用内检查更新时，macOS 不走 Squirrel.Mac 自动安装，而是读取 GitHub 最新 Release，并引导用户打开下载页面手动下载 DMG。

macOS Release 资产应至少包含：

- `desktop-pet-setup-<version>-x64.dmg`
- `desktop-pet-setup-<version>-arm64.dmg`
- 对应架构的 `.zip`
- `latest-mac.yml`
- `readme.txt`
- `readme_en.txt`
- `readme_ja.txt`

macOS 手动更新说明必须保持一致：

1. 先从托盘菜单完全退出当前应用。
2. 下载新版 DMG。
3. 将应用拖入 Applications 并替换旧版本。
4. 如果首次打开被 Gatekeeper 拦截，再在“系统设置 -> 隐私与安全性”中允许打开，或按说明运行 `xattr -cr /Applications/七九爱宠.app`。

## 7. 发布后的更新验证

发布完成后，至少做一次真实安装包验证。

Windows：

- 安装上一个已发布版本。
- 通过托盘菜单执行“检查更新”。
- 如果 GitHub Releases 上存在更高版本和完整 `latest.yml`，应提示下载。
- 下载完成后应提示重启并安装。
- 如果当前已经是最新版本，应显示当前版本已是最新版本。
- 如果 Release 元数据暂时缺失或 GitHub 返回 404，应用会降级为“已是最新版本”一类的用户可理解提示；正式公开发布前仍应补齐 `latest.yml`。

macOS：

- 安装上一个已发布版本。
- 通过托盘菜单执行“检查更新”。
- 如果 GitHub 最新 Release 版本更高，应提示前往下载页面，而不是尝试静默自动安装。
- 按 DMG 覆盖安装流程验证新版可启动。
- 确认 macOS 包内 `CFBundleExecutable` 和真实启动文件仍为 `DeskPet`。

## 8. 失败处理

- `CHANGELOG.md` 缺少版本段落：补齐目标版本段落后重新运行 `Release Preflight`。
- `package.json` / `package-lock.json` 版本不一致：优先本地修正并提交；也可以让手动 `Release Preflight` 自动同步后再确认提交。
- tag 已存在：确认 tag 指向的提交就是要发布的源码；如果不是，不要复用该 tag。
- Windows 未签名发布：用户可能看到 Windows 或 Edge 的未知发布者提示，这是未签名小范围分发的预期行为。
- Windows 签名失败：检查 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`、证书有效期和 `docs/release-code-signing.md`。
- macOS 启动失败：优先检查包内可执行文件是否为 `DeskPet`，以及用户是否先退出旧版本再覆盖安装。
- Release 资产里出现自动生成的 `Source code (zip)` / `Source code (tar.gz)`：`Build Installers` 会尝试删除这些资产；如果 GitHub 侧仍保留，可手动删除，避免用户误下源码包。

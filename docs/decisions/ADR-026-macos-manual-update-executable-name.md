# ADR-026: macOS 手动更新启动兼容性与包内可执行文件命名

## 状态 (Status)
Accepted

## 日期 (Date)
2026-05-26

## 背景 (Context)
macOS 用户反馈：首次安装旧版本并绕过“无法验证开发者”后可以正常运行，但使用 `0.4.1` DMG 覆盖安装更新后，Dock 图标只跳动，应用无法加载。

本项目没有 Apple Developer ID 证书，因此 macOS 自动更新不能依赖 Squirrel.Mac 的签名校验。`0.4.1` 已将 macOS 更新路径改为手动下载 DMG 并拖入 Applications 覆盖安装。

排查时发现两个容易混淆的问题：

1. 手动覆盖安装前，旧版本可能仍在后台运行。此时用户再次打开应用会命中单实例锁，看起来像“没打开”。因此更新说明必须明确要求先从托盘菜单“退出”，这里的退出是关闭正在运行的旧进程，不是卸载。
2. 打包后的 macOS `.app` 外层名称、`CFBundleExecutable` 和 `Contents/MacOS/` 下真实启动文件都使用了中文 `七九爱宠`。在部分 macOS / LaunchServices 场景中，覆盖安装后可能无法正确解析包内中文可执行文件，表现为 Dock 图标跳动后无法加载。

## 决策 (Decision)
macOS 包继续保留用户可见的中文应用名 `七九爱宠.app`，但包内真实可执行文件统一改为 ASCII 名称 `DeskPet`。

具体实现：

1. `scripts/afterPack.js` 在 `darwin` 打包后执行 macOS 专用修正。
2. 将 `Contents/MacOS/七九爱宠` 重命名为 `Contents/MacOS/DeskPet`。
3. 使用 `plutil` 将 `Info.plist` 中的 `CFBundleExecutable` 改为 `DeskPet`。
4. 如果 `DeskPet` 不存在，打包直接失败，避免生成损坏安装包。
5. 保持 `CFBundleDisplayName` / `CFBundleName` / 外层 `.app` 名称为中文，用户看到的应用名称不变。

同时更新 macOS 手动更新说明：

1. 先从托盘菜单点击“退出”，完全关闭旧版本。
2. 打开新版 DMG，将 `七九爱宠.app` 拖入 Applications。
3. 选择替换旧版本。
4. 如果首次打开仍被系统拦截，再在“系统设置 -> 隐私与安全性”中点击“仍要打开”，或运行 `xattr -cr /Applications/七九爱宠.app`。

显式设置 `mac.minimumSystemVersion` 为 `12.0`，并将 README / 发布说明中的 macOS 最低版本同步为 macOS 12.0 (Monterey)。Electron 42 生成的包本身已经声明 `LSMinimumSystemVersion = 12.0`，文档不能继续写 11.0。

## 替代方案 (Alternatives Considered)

### 要求用户先卸载旧版本
- 优点：表面上能减少覆盖安装时的旧进程干扰。
- 缺点：容易让用户误以为存档会丢失，也不能解决包内中文可执行文件被 LaunchServices 解析失败的问题。
- 结论：拒绝。正确动作是关闭旧进程，不是卸载。

### 将整个 `.app` 改名为 `DeskPet.app`
- 优点：完全 ASCII，系统兼容性最好。
- 缺点：用户可见品牌名会变化；README、DMG 展示名和 Applications 中的名称都要调整。
- 结论：拒绝。问题只需要修包内可执行文件名，外层用户可见名称可以保留中文。

### 购买 Apple Developer ID 并走签名公证
- 优点：长期最标准，Gatekeeper 体验最好，也能恢复更自动化的更新路径。
- 缺点：需要付费证书和新的发布流程；不能作为当前小范围分发的即时修复。
- 结论：作为未来改进方向保留，本次不依赖它。

### 仅更新用户说明，不改打包产物
- 优点：改动最小。
- 缺点：只能解决“旧版本仍在运行”的误操作，不能解决 `.app` 包内启动文件名兼容性。
- 结论：拒绝。需要同时修产物和说明。

## 影响 (Consequences)
- 用户在 Finder / Applications 中看到的仍是 `七九爱宠.app`。
- 包内启动文件变为 `DeskPet`，降低 LaunchServices 对中文可执行文件名的兼容风险。
- 覆盖安装流程仍然适用于无证书分发，但用户必须先退出正在运行的旧版本。
- macOS 11 用户不再被文档误导；当前 Electron 42 包最低支持 macOS 12.0。
- 如果未来改动打包逻辑导致 `CFBundleExecutable` 回退为中文名，CI 会阻止发布。

## 验证 (Verification)
- `npm test` 通过，新增 `test/macosPackaging.test.js` 覆盖 macOS 包内可执行文件命名和手动更新提示。
- `npm run verify:installer` 通过。
- 本地执行 `npx electron-builder --mac --dir` 后验证：
  - `Info.plist` 中 `CFBundleExecutable = DeskPet`。
  - `Contents/MacOS/DeskPet` 存在且可执行。
  - `Contents/MacOS/七九爱宠` 不存在。
  - `codesign --verify --deep --strict` 通过。
- 本地完整构建 `desktop-pet-setup-0.4.1-arm64.dmg` 后挂载验证，DMG 内 `.app` 同样满足上述条件。

## CI 保护 (CI Guardrails)
两个 GitHub Actions workflow 都增加了 macOS 包内元数据检查：

- `.github/workflows/release-preflight.yml`
- `.github/workflows/build-installer.yml`

检查内容：

1. 在 `dist/mac*/七九爱宠.app` 中查找打包后的 macOS 应用。
2. 读取 `Info.plist`，要求 `CFBundleExecutable` 必须是 `DeskPet`。
3. 要求 `Contents/MacOS/DeskPet` 存在且可执行。
4. 要求 `Contents/MacOS/七九爱宠` 不存在。
5. 执行 `codesign --verify --deep --strict`。

## 涉及文件 (Files Changed)
| 文件 | 用途 |
|---|---|
| `scripts/afterPack.js` | macOS 打包后重写包内可执行文件名和 `CFBundleExecutable`。 |
| `package.json` | 显式设置 `mac.minimumSystemVersion = 12.0`。 |
| `src/data/i18n.js` | 更新 macOS 手动更新弹窗文案，提示先退出旧版本。 |
| `README.md` / `readme*.txt` | 更新 macOS 系统版本、手动更新和 Gatekeeper 说明。 |
| `.github/workflows/release-preflight.yml` | 在 macOS 预检中校验包内可执行文件元数据。 |
| `.github/workflows/build-installer.yml` | 在正式 macOS 发布中校验包内可执行文件元数据。 |
| `test/macosPackaging.test.js` | 增加打包命名和更新提示回归测试。 |
| `CHANGELOG.md` | 记录本次 macOS 更新修复和发布流程保护。 |

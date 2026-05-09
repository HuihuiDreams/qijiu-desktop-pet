# macOS 支持分析与计划

本项目目前主要针对 Windows 平台开发。若要支持 macOS 平台，需要进行以下改动。

## 1. 代码层面改动 (低成本)

### 1.1 隐藏 Dock 图标
macOS 默认会为每个运行的应用显示 Dock 图标。作为桌宠，通常需要隐藏它。
```javascript
// 在 main.js 中
if (process.platform === 'darwin') {
  app.dock.hide(); 
}
```

### 1.2 适配开机自启动
目前 `main.js` 中显式禁用了非 Windows 平台的自启动逻辑。需要重构 `setLoginItemSettings` 以支持 macOS。

### 1.3 状态栏图标 (Tray Icon)
- **尺寸**：macOS 菜单栏图标通常为 16x16 或 22x22。
- **模板图像**：建议使用以 `IconTemplate.png` 结尾的黑白透明图标，以自动适配 macOS 的深色/浅色菜单栏。

### 1.4 窗口层级与 Mission Control
确保 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` 正确配置，使桌宠能在所有桌面空间显示。

## 2. 打包与资源配置 (中等成本)

### 2.1 图标转换
- 需要将现有的图标转换为 `.icns` 格式，或提供 512x512 以上的 PNG。

### 2.2 electron-builder 配置
在 `package.json` 中增加 `mac` 配置：
```json
"mac": {
  "target": ["dmg", "zip"],
  "icon": "build/icon.icns",
  "category": "public.app-category.utilities"
}
```

## 3. 发布与合规成本 (核心成本)

### 3.1 苹果开发者账号
- **费用**：99美元/年。
- **目的**：用于应用签名和公证 (Notarization)，避免用户安装时出现“应用已损坏”或“身份不明的开发者”警告。

### 3.2 硬件要求
- 需要 Mac 电脑进行构建、签名和本地测试。

## 成本总结

| 维度 | 成本评级 | 说明 |
| :--- | :--- | :--- |
| **开发工作量** | 🟢 低 | 核心逻辑（Dock、自启动等）适配，约需 2-4 小时。 |
| **UI 适配** | 🟢 低 | 制作 macOS 专用的图标（.icns）及状态栏模板图像。 |
| **打包环境** | 🟠 中 | 需要 Mac 电脑进行构建、签名和实际运行测试。 |
| **分发成本** | 🔴 高 | 每年 $99 的年费（若需通过 Gatekeeper 的安全检查）。 |

---
**建议**：如果仅用于个人或小范围分发，可忽略签名步骤，由用户手动在系统设置中允许运行。如果面向大众发布，签名与公证是必须的。

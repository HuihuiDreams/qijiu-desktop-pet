---
inclusion: fileMatch
fileMatchPattern: '{skinGallery.js,protectedAssetLoader.js,protectedAssetProtocol.js,skinSelectorPreload.js,src/skinSelectorWindow.js,src/skin-selector.*,src/assets/**,readme_*.txt,scripts/protect-assets.js}'
---

# 皮肤与资源管线

新增或修改角色皮肤、精灵图时,严格遵循 #[[file:docs/skin-pipeline-guide.md]]。

1. 格式使用 `webp`,保持标准朝向前缀(`walk_left`、`walk_right`)。
2. 任何皮肤增改必须同步到:`skinGallery.js`、`protectedAssetLoader.js`,以及三份语言说明 `readme_zh.txt`、`readme_en.txt`、`readme_ja.txt`。
3. 使用 `pet-asset://` 协议时,所有子窗口 HTML 的 CSP 都要允许 `pet-asset:`。
4. 皮肤选择器必须支持“预览-确认”流程(`isPreview`):选中皮肤只在当前宠物上预览,不提交;点击取消要安全还原之前的皮肤。
5. 皮肤的 `.webp` 文件不进入安装包,由 `npm run protect:assets` 在构建前处理,改动打包规则前先看 `package.json` 的 `build.files`。

# 桌面宠物皮肤素材处理指南

本指南记录了为《DeskPet 岳清&沈九修仙桌宠》添加或修改皮肤素材（PNG 转 WebP）的标准作业流程（SOP），以避免在处理透明边距、画幅归一化及透明度通道时踩坑。

## 核心原则

1. **绝对不要破坏原有的 Alpha 透明通道**
   - 很多绘图软件导出的 PNG 已经带有完美的透明背景。
   - 不要使用会“强行去除白色背景”（例如将 RGB > 240 转换为透明）的脚本，这会导致人物身上原本的白色部分（眼白、白衣服、白发）被错误地掏空。

2. **动画序列必须统一画布尺寸**
   - 如果一个动画（例如 `walk_left01` 到 `walk_left04`）在不同帧被切割成了不同大小，直接转换会导致桌宠在走路时发生剧烈的拉伸、抖动和位移。
   - 属于同一组动画的图片，必须先计算出它们共有的最大内容边界（Bounding Box），然后在转换前统一填充（Padding）到相同的画布尺寸中。

3. **最大化 256x256 画布利用率**
   - 运行时要求所有的 WebP 渲染资产均为 `256x256`。
   - 为了让桌宠在屏幕上看起来足够大且清晰，在将图片缩放到 `256x256` 之前，必须尽可能**精准切除多余的透明边距**。
   - 不要把所有不相关的图片（如单幅原画 `throwup` 和帧动画 `walk_left`）放进同一个巨大的画幅里，这样会导致本来可以填满画面的小图在强行居中时被缩积极小。

4. **行走动画帧必须水平居中**
   - 对于行走等会产生位移的动画帧（如 `walk_left`、`walk_right`），其非透明内容的左右边界到画布边缘的留白必须尽量一致。
   - 如果序列帧内各图的左右留白不对称，桌宠在持续水平移动播放动画时，会产生不自然的横向抖动或平移错位感。
   - 建议在处理时，通过脚本计算单张图片的 Bounding Box，并确保将其在画幅内严格水平居中。

## 标准处理流程（SOP）

假设你获得了一批新的 `*.png` 皮肤原图，准备替换或新增一套皮肤：

### 1. 对原图进行分组裁切与画幅归一化

项目提供了专用脚本 `tools/run_trim.py`（依赖 `tools/trim_sprites.py`）。
你需要根据图片命名和动画关系，修改 `run_trim.py` 中的 `groups` 数组，将同属于一组动画的图片通过 Glob 模式分为一组。例如：

```python
# tools/run_trim.py 示例
groups = [
    "src/assets/animal_ears/left*.png",
    "src/assets/animal_ears/right*.png",
    "src/assets/animal_ears/shenjiu/walk_left*.png",
    "src/assets/animal_ears/shenjiu/walk_right*.png",
    # ...
]
```

执行该脚本：
```powershell
$env:PYTHONIOENCODING="utf8"
python tools/run_trim.py
```
**脚本的作用**：它会自动遍历每组内的所有图片，找出组内并集的最大边界（Bounding Box），将多余透明边距切除，并为这组图片加上极小的安全边距（`PADDING=6`），使得它们拥有完全一致的新画布尺寸，同时保留完美的动画对齐效果。对于没有落入任何分组的独立图片（如 `hug.png`），脚本会将其单独切边，确保它能被放到最大。

*(注：执行此脚本会直接覆盖修改对应路径下的 `.png` 原图文件)*

### 2. 将优化后的 PNG 转换为 WebP (256x256)

执行 Node.js 转换脚本：
```powershell
node scripts/convert_images.js
```
**脚本的作用**：调用 `ffmpeg` 递归遍历对应文件夹，将所有 `*.png` 按比例缩放并居中放置到严格的 `256x256` 黑色透明画布中（`color=black@0`），输出最终运行时使用的 `*.webp` 渲染资产。

### 3. 清理冗余的 PNG 文件

WebP 转换成功且在本地 `npm run dev` 验证无误后，可以删除 `src/assets/` 目录中冗余的 `.png` 文件（注意保留好你在其他地方的原始备份）。
```powershell
Get-ChildItem -Path src/assets/<YOUR_SKIN_NAME> -Filter *.png -Recurse | Remove-Item -Force
```

### 4. （可选）微调皮肤的全局显示比例

如果你觉得这套皮肤在游戏中显示得略微偏大或偏小，不要在切图工具里反复调整，而是直接前往 `src/systems/SkinManager.js` 修改这套皮肤在引擎中的全局缩放倍率：

```javascript
static SKIN_IMAGE_SCALES = {
  animal_ears: 1.08, // 大于 1 放大，小于 1 缩小，如果不配置则默认为 1.0
};
```

### 5. 皮肤素材加密与开发/构建须知

本项目采用了受保护皮肤资产机制（通过 `pet-asset://` 协议与 `protected-assets/*.dat` 密文加载，详见 `ADR-040`）。在转换完 WebP 后，你需要注意以下运行与构建行为：

- **开发调试 (`npm run dev`)**：
  - **新增全新皮肤**：如果本地 `protected-assets/` 清单中还不存在你的新皮肤，主进程会自动触发开发环境回退机制，直接读取 `src/assets/<YOUR_SKIN_NAME>/*.webp` 明文图片，可以直接启动调试。
  - **修改已有皮肤（重要防坑）**：如果你是在调优修改**原本就已经存在**的皮肤 WebP（如 `default/left.webp`），并且本地由于之前的构建或生成操作已经存在了 `protected-assets/` 目录，主进程会优先匹配并加载密文缓存，这会导致你在 `npm run dev` 中看到的依然是修改前的旧图。此时只需手动执行一次加密更新命令即可刷新预览：
    ```powershell
    npm run protect:assets
    ```
    *(或者直接删除 `protected-assets/` 目录，让主进程自动走明文回退加载。)*

- **发版打包 (`npm run build`)**：
  - `package.json` 中已经配置了 `"prebuild": "node scripts/protect-assets.js"` 自动钩子。
  - **无需手动先跑加密**：每次运行构建打包（`npm run build` / `electron-builder`）时，系统会在打包前自动将 `src/assets/` 下的所有最新皮肤 WebP 加密输出到 `protected-assets/` 目录，并从最终生成的安装包产物（asar / 安装目录）中自动剔除明文 `*.webp`，保障安全与包体积瘦身。


---
name: skin-asset-pipeline
description: >-
  Process, trim, normalize, and convert desktop pet character skin assets (PNG to WebP 256x256),
  synchronize skin manifests, and encrypt protected assets for DeskPet.
  Use when adding or updating character skins, converting sprite frames, trimming transparent borders,
  normalizing animation canvas bounds, encrypting assets, or troubleshooting skin rendering.
---

# DeskPet 皮肤素材处理流水线 (Skin Asset Pipeline)

本技能定义了为《DeskPet 岳清&沈九修仙桌宠》添加、修改或转换皮肤素材的标准作业流程（SOP）。
在执行切图、画布归一化、WebP 转换与加密同步时，必须严格遵守以下规范以保障桌宠在运行时的清晰度与动画稳定性。

---

## 核心原则与防踩坑红线

1. **绝对禁止暴力抠白（破坏 Alpha 通道）**
   - 画师导出的 PNG 原图通常带有原生透明通道。
   - **严禁**使用将 RGB > 240 强制置为透明的简易阈值算法，否则角色身上的眼白、白衣、白发会被错误掏空。
2. **同组动画帧必须归一化画布尺寸（Bounding Box Union）**
   - 行走等序列帧（如 `walk_left01` ~ `walk_left04`）必须提取全组帧的共同最大内容包围盒并统一画布大小。
   - 严禁各帧单张自由切图，否则桌宠在连续行走时会产生剧烈的拉伸、抖动和错位。
3. **行走动画帧必须水平居中并底部对齐**
   - 行走序列帧的左右留白必须严格对称，避免动画播放时横向抽搐。
   - 垂直方向统一采用**底部对齐**（`paste_y = canvas_h - ch - padding`），确保双脚始终踩在同一地面基准线上。
4. **运行时严格限制 256x256 WebP**
   - 运行时要求所有皮肤图片均为严格的 `256x256` WebP 格式。
   - 转换时按原比例缩放并在黑色透明画布（`color=black@0`）中居中填充。

---

## 标准皮肤文件目录骨架

新增皮肤（如 `src/assets/<skin_id>/`）应遵循如下命名与结构：

```text
src/assets/<skin_id>/
├── left.webp                     # 岳七静止待机 (256x256)
├── right.webp                    # 沈九静止待机 (256x256)
├── left_cultivate.webp           # 岳七打坐
├── left_hungry.webp              # 岳七饥饿
├── left_sleep.webp               # 岳七睡眠
├── left_eat.webp                 # 岳七进食
├── left_pat.webp                 # 岳七摸头
├── right_cultivate.webp          # 沈九打坐
├── right_hungry.webp             # 沈九饥饿
├── right_sleep.webp              # 沈九睡眠
├── right_eat.webp                # 沈九进食
├── right_pat.webp                # 沈九摸头
├── hug.webp                      # 双人拥抱
├── kiss.webp                     # 双人亲亲（默认画廊预览图）
├── shareFood.webp                # 分享食物
├── throwup.webp                  # 吐口水/炸毛
├── cultivate.webp                # 双修打坐
├── yueqi/
│   ├── walk_left01.webp .. 04.webp   # 岳七向左行走 (4帧)
│   └── walk_right01.webp .. 04.webp  # 岳七向右行走 (4帧)
└── shenjiu/
    ├── walk_left01.webp .. 04.webp   # 沈九向左行走 (4帧)
    └── walk_right01.webp .. 04.webp  # 沈九向右行走 (4帧)
```

---

## 标准作业流程 (SOP)

### 步骤 1：导入原始 PNG 素材
将带有透明通道的原图 PNG 放入 `src/assets/<skin_id>/` 对应目录中（包含 `yueqi/` 和 `shenjiu/` 子文件夹）。

### 步骤 2：动画分组裁切与画布归一化
运行批量裁切工具，为动画帧计算最大包围盒并保留安全边距（`PADDING=12`）：

```bash
# macOS / Linux
python3 tools/run_trim.py src/assets/<skin_id>

# Windows PowerShell
$env:PYTHONIOENCODING="utf8"
python tools\run_trim.py src/assets/<skin_id>
```

> **注意**：脚本会自动将 `left*.png`、`right*.png`、`yueqi/walk_*.png`、`shenjiu/walk_*.png` 按组归一化，其余独立单图（如 `hug.png`）单独切边居中。该操作会直接覆盖 `.png` 文件。

### 步骤 3：将优化后的 PNG 转换为 256x256 WebP
执行转换脚本（优先使用 `ffmpeg`，失败自动回退至 Python PIL）：

```bash
node scripts/convert_images.js src/assets/<skin_id>
```

脚本会递归扫描目标目录，将所有 `.png` 按比例缩放并居中放置在 `256x256` 透明底画幅中，输出对应的 `.webp` 文件。

### 步骤 4：清理冗余 PNG
在 WebP 转换成功后，删除源码目录中多余的 `.png` 文件（请先在外部妥善备份原图）：

```bash
# macOS / Linux
find src/assets/<skin_id> -type f -name "*.png" -delete

# Windows PowerShell
Get-ChildItem -Path src/assets/<skin_id> -Filter *.png -Recurse | Remove-Item -Force
```

### 步骤 5：（可选）微调皮肤在引擎中的显示比例
若新皮肤在游戏内视觉观感偏大或偏小，前往 `src/systems/SkinManager.js` 配置全局缩放比例，无需反复重新切图：

```javascript
static SKIN_IMAGE_SCALES = {
  <skin_id>: 1.08, // 大于 1 放大，小于 1 缩小，默认 1.0
};
```

### 步骤 6：生成受保护皮肤密文与缓存刷新
本项目使用受保护皮肤资产机制（[ADR-040](docs/decisions/ADR-040-encrypted-skin-assets.md)）。

```bash
npm run protect:assets
```

- **开发调试注意事项**：如果本地 `protected-assets/` 目录已存在旧密文，主进程会优先读取密文缓存；此时修改已有的 `.webp` 图片必须重新运行 `npm run protect:assets` 刷新密文，或者临时删除 `protected-assets/` 走明文回退加载。
- **打包自动化**：`npm run build` 已配置 `prebuild` 钩子自动加密，打包时无需手动加密。

### 步骤 7：画廊与清单同步
1. **画廊预览适配**：检查 `skinGallery.js`，预览图默认优先寻找 `kiss.webp` -> `right.webp` -> `left.webp` -> `cultivate.webp`。
2. **多语言 Readme 同步**：在 `readme_zh.txt`、`readme_en.txt`、`readme_ja.txt` 中同步记录新增或修改的皮肤信息。

---

## 验证与测试清单

完成资产转换与配置后，执行以下验证步骤：

1. **尺寸合规性单测**：
   ```bash
   node --test test/assetDimensions.test.js
   ```
   验证所有 WebP 资产长边不超过 256px，且没有损坏的 WebP chunk。
2. **全量自动化测试**：
   ```bash
   npm test
   ```
3. **本地开发环境视觉与交互验证**：
   ```bash
   npm run dev
   ```
   - 打开皮肤选择器（右键菜单 -> 换装）。
   - 点击预览新皮肤，观察待机动作、行走帧是否有抖动或拉伸。
   - 点击“取消”，确认无缝回退到旧皮肤；点击“确定”，确认持久化生效。

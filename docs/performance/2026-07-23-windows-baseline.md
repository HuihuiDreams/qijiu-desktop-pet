# Windows 性能基线与问题分流（2026-07-23）

## 状态

本报告已完成正式主矩阵、启动探针和长时间空闲采样，结论由原始 `runs` 独立复算，
不直接信任采样文件中的 `summaries`。Task 2 尚未最终签署：计划要求的 packaged+
GPU 强风代表场景复现因当前 Electron 启动审批额度耗尽而未运行，需在审批恢复后
补测并确认结果落入已记录波动区间。

本任务没有修改生产渲染、游戏循环、窗口或缓存逻辑。

## 环境

| 项目 | 值 |
| --- | --- |
| 应用 / Electron | desktop-pet 0.9.3 / Electron 42.2.0 |
| 构建 | dev；本轮 current-code unpacked packaged |
| packaged SHA-256 | `616CF11481DFDA625BDCE06E2A59083469F9D4C4094F53DC226586171876D0A1` |
| 操作系统 | Windows 11 Pro 64-bit，10.0.26200 |
| 设备 | Dynabook RJ74/LY，约 32GB RAM |
| CPU | Intel Core i7-1360P，12 核 / 16 逻辑处理器 |
| GPU / 驱动 | Intel Iris Xe Graphics，32.0.101.7079 |
| 电源标签 | `dynabook-standard-battery100-status2`；电源方案 GUID `89ee7eba-0db4-4b3a-8c33-69689521f195` |
| 主显示器 | 2462×1385 renderer 坐标，scaleFactor 1.56，30Hz |
| 第二显示器 | 1039×1847 renderer 坐标，scaleFactor 1.04，60Hz |
| userData | 每次命令新建临时 profile，全部样本完成后均确认已清理 |

WMI 查询时电池余量为 100%，`BatteryStatus=2`；报告保留原始状态码，不进一步推断
AC/电池供电。默认 GPU 组未传 `--disable-gpu`，禁用 GPU 组单独报告。Electron 的
basic GPU 信息在主窗口创建前采集，因此只作为设备/驱动证据，不把其中的
`active` 字段解释为采样期间的硬件加速状态。

## 协议与原始数据

正式主矩阵使用六个场景，每次预热 5 秒、采样 30 秒、重复 3 次。四种配置串行
运行，避免多个 Electron 实例互相污染 CPU/内存。长时间空闲使用 packaged、默认
GPU，预热 5 秒后采样 5 分钟，重复 3 次。

原始文件：

- [`2026-07-23-windows-dev-gpu.json`](raw/2026-07-23-windows-dev-gpu.json)
- [`2026-07-23-windows-dev-disable-gpu.json`](raw/2026-07-23-windows-dev-disable-gpu.json)
- [`2026-07-23-windows-packaged-gpu.json`](raw/2026-07-23-windows-packaged-gpu.json)
- [`2026-07-23-windows-packaged-disable-gpu.json`](raw/2026-07-23-windows-packaged-disable-gpu.json)
- [`2026-07-23-windows-packaged-gpu-idle-5m.json`](raw/2026-07-23-windows-packaged-gpu-idle-5m.json)
- [`2026-07-23-windows-dev-startup-probe.json`](raw/2026-07-23-windows-dev-startup-probe.json)

启动探针使用独立 schema，不适用场景报告的 `validateBaseline.js` /
`recomputeBaseline.js`。

四份主矩阵均通过：

```powershell
node tools/performance/validateBaseline.js <四份主矩阵 JSON>
node tools/performance/recomputeBaseline.js <四份主矩阵 JSON>
```

每份主矩阵均包含 18 个唯一的 `scenario × repetition` run、非空 renderer/进程
原始样本、CPU/私有内存/工作集、逐场景汇总和完整 build/GPU/刷新率元数据。

## packaged + 默认 GPU 主结果

帧预算按主显示器 30Hz 计算：理论预算 33.33ms，警戒线为 40ms。表内 CPU 和私有
内存为“每次重复先取进程组 P50，再在三次重复间取中位数”；工作集可能包含共享
页面，仅作辅助。

| 场景 | 三次 P95 (ms) | 警戒帧 | Long Task | CPU P50 | 相比空闲 | 私有内存 P50 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 空闲 | 33.5 / 33.5 / 33.5 | 1 / 0 / 0 | 0 / 0 / 0 | 0.382% | — | 329.8 MiB |
| 行走 | 33.5 / 33.5 / 33.5 | 0 / 0 / 0 | 0 / 0 / 0 | 1.479% | — | 359.8 MiB |
| 重雨 | 33.5 / 33.5 / 33.5 | 0 / 0 / 0 | 0 / 0 / 0 | 1.933% | +1.551pp / +405.6% | 374.5 MiB |
| 强风 | 33.5 / 33.5 / 33.5 | 0 / 0 / 0 | 0 / 0 / 0 | 5.090% | +4.708pp / +1231.3% | 418.8 MiB |
| 高温 | 33.5 / 33.5 / 33.5 | 0 / 0 / 0 | 0 / 0 / 0 | 2.466% | +2.084pp / +544.9% | 412.6 MiB |
| 雷暴 | 33.5 / 33.5 / 33.5 | 0 / 0 / 0 | 0 / 0 / 0 | 2.314% | +1.932pp / +505.2% | 414.6 MiB |

强风的三次 CPU P50 为 4.750%、5.090%、5.104%；重雨、高温和雷暴的每次重复
也都同时超过“相对空闲增加 20%”和“绝对增加 1 个百分点”两个 CPU 条件。
天气场景没有超过 40ms 警戒线的帧，也没有 Long Task。

GPU、Tab 和 Browser 都参与了强风增量。按整组原始样本汇总，强风时各类型 CPU
P50 分别约为 GPU 2.264%、Tab 1.899%、Browser 0.566%；对应空闲值约为
0.068%、0.138%、0.120%。Task 3 应先定位脚本更新与粒子合成的 CPU 成本，不应把
问题描述为已经发生的帧卡顿。

## 构建与 GPU 模式对照

| 配置 | 空闲 CPU 三次 P50 | 强风 CPU 三次 P50 | 强风三次 P95 |
| --- | --- | --- | --- |
| dev + 默认 GPU | 0.812 / 0.478 / 0.700% | 5.016 / 5.607 / 4.592% | 33.5 / 33.5 / 33.5ms |
| dev + `--disable-gpu` | 0.812 / 1.013 / 1.059% | 6.539 / 6.395 / 7.628% | 16.8 / 16.8 / 16.8ms |
| packaged + 默认 GPU | 0.389 / 0.345 / 0.382% | 4.750 / 5.090 / 5.104% | 33.5 / 33.5 / 33.5ms |
| packaged + `--disable-gpu` | 1.309 / 0.650 / 1.254% | 6.523 / 6.251 / 5.895% | 16.8 / 16.7 / 16.7ms |

禁用 GPU 数据没有与默认 GPU 数据合并。该模式下 rAF 约为 16.7ms，而默认 GPU
遵循 30Hz 主显示器约 33.3ms；这进一步说明跨 GPU 模式不能直接混算帧间隔。

## 异常样本

- dev+默认 GPU 空闲第 1 次出现 2 个超过 50ms 的帧和 1 个 Long Task；其余两次
  没有复现，且天气场景均没有 Long Task，因此不触发天气 Long Task 门槛。
- packaged+默认 GPU 空闲第 1 次出现 1 个警戒帧；其余两次没有复现。
- dev+`--disable-gpu` 雷暴第 2 次出现 8 个警戒帧和 2 个超过 50ms 的帧，但第
  1、3 次均为 0，且它属于单列的自动化模式，不触发真实 GPU 帧门槛。
- 30Hz 默认 GPU 组中超过 20ms 的帧是正常刷新节奏；判断使用 40ms 警戒线，
  不把 33.3ms 帧误判为掉帧。

所有异常样本都保留在原始 JSON，没有删除或用最佳样本替代。

## 启动探针

启动探针在加载真实 `main.js` 前监听第一个 `browser-window-created`，包住生产路径
实际调用的 `session.clearCache()`，并记录到真实 `did-finish-load`。五次均使用
全新 profile：

| 重复 | clearCache | 窗口创建 → did-finish-load | 宿主 launch → load 代理值 |
| ---: | ---: | ---: | ---: |
| 1 | 117.23ms | 499.25ms | 1120.75ms |
| 2 | 160.46ms | 644.16ms | 1276.15ms |
| 3 | 131.24ms | 558.54ms | 1289.40ms |
| 4 | 122.44ms | 487.96ms | 1165.44ms |
| 5 | 138.30ms | 516.21ms | 1220.54ms |

`clearCache()` 中位数为 131.24ms，超过 100ms 门槛；窗口创建到
`did-finish-load` 中位数为 516.21ms，二者比值约 25.4%，也超过 10% 门槛。
精确探针只覆盖 dev；宿主 launch 代理值包含进程启动和 Playwright 连接，不当作
首个合成帧或用户可交互时间。

## 五分钟空闲

packaged+默认 GPU 三次 5 分钟空闲进程组 CPU P50：

| 重复 | CPU P50 | 私有内存 P50 | 工作集 P50 |
| ---: | ---: | ---: | ---: |
| 1 | 0.513% | 340.8 MiB | 532.1 MiB |
| 2 | 0.841% | 343.5 MiB | 532.4 MiB |
| 3 | 0.405% | 344.8 MiB | 533.0 MiB |

三次均低于 2%。第 1 次出现 1 个 Long Task 和 2 个超过 50ms 的帧，其余两次
没有复现；该异常不改变空闲 CPU 结论。

## 分流结论

| 方向 | 结论 | 量化依据 |
| --- | --- | --- |
| 天气 / Task 3 | **进入，待代表强风复现后最终签署** | packaged+默认 GPU 四个天气场景均在三次重复中同时超过 CPU 相对 +20% 和绝对 +1pp 门槛；帧 P95 与 Long Task 不超标，优先调查 CPU |
| 启动缓存 / Task 4 | **进入** | `clearCache()` 五次中位 131.24ms；约占窗口创建到 `did-finish-load` 中位时间的 25.4% |
| 透明窗口内存 / Task 5 | **停止** | 所有样本窗口尺寸相同，无法证明窗口尺寸与私有内存稳定相关；场景间私有内存差异不能替代尺寸 A/B |
| 空闲续航 / Task 6 | **停止** | packaged+默认 GPU 三次 5 分钟 CPU P50 为 0.513%、0.841%、0.405%，均低于 2% |

即使 Task 3 和 Task 4 都达到门槛，也必须按计划一次只执行一个原子任务；Task 2
最终签署前不启动任何生产优化。

## 待完成验证

审批恢复后执行：

```powershell
npm run qa:electron:performance -- --scenarios wind --warmup-ms 5000 --sample-ms 30000 --repetitions 1 --executable "dist/task2-baseline/win-unpacked/七九爱宠.exe" --power-mode dynabook-standard-battery100-status2 --output docs/performance/raw/2026-07-23-windows-packaged-gpu-wind-rerun.json
```

复算后的进程组 CPU P50 应落入正式 packaged+GPU 强风三次范围
4.750%–5.104%；若超出，先调查环境变化或修正协议，不签署 Task 2。

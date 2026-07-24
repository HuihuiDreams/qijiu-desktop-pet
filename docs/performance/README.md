# Electron 性能采样

本目录存放 DeskPet 的性能采样说明与后续基线报告。采样工具用于建立证据，不自动
判定或修改生产性能策略；正式分流结论应写入独立 Markdown 报告并引用原始 JSON。
启动器会隔离 userData，并移除宿主环境中的 `ELECTRON_RUN_AS_NODE`，确保 Electron
以桌面应用模式运行。为与冒烟检查保持一致，Playwright 测量子进程还会使用
`--disable-dev-shm-usage` 与 `--no-sandbox`，这些参数不会进入正式发布应用。

## 快速验证

```powershell
npm run qa:electron:performance -- --scenarios idle --warmup-ms 100 --sample-ms 500 --repetitions 1 --disable-gpu
```

正式采样使用计划中的默认值：每个场景预热 5 秒、采样 30 秒、重复 3 次。示例：

```powershell
npm run qa:electron:performance -- --scenarios idle,walking,rain,wind,heat,thunderstorm --power-mode balanced --output docs/performance/windows-gpu.json
```

## 参数

- `--scenarios`：逗号分隔的 `idle`、`walking`、`rain`、`wind`、`heat`、
  `thunderstorm`；默认 `idle`。
- `--warmup-ms`、`--sample-ms`、`--repetitions`：预热、采样时长和重复次数。
- `--disable-gpu`：显式禁用 GPU；这类数据不得代替真实 GPU 结果。
- `--refresh-rate`：覆盖主显示器报告的刷新率，仅在自动识别不准确时使用。
- `--power-mode`：记录人工确认的系统电源模式标签，不改变系统设置。
- `--profile`：复用指定的专用测试 profile；工具不会删除显式目录。省略时使用并
  自动清理临时 profile。
- `--executable`：采集 packaged 可执行文件；省略时启动仓库本地 Electron dev 构建。
- `--output`：写入 JSON 文件；省略时输出到标准输出。

## 输出结构

输出的 `schemaVersion` 当前为 `1`：

- `environment`：应用/Electron、OS/CPU、GPU、主显示器和全部显示器、构建类型、
  GPU 状态、电源模式标签及隔离 userData 路径。
- `config`：场景、时长、重复次数、有效刷新率及其来源。
- `runs`：每次重复的 renderer 帧间隔、Long Task、DOM/粒子诊断和原始进程样本。
- `summaries.byScenario`：各场景独立的帧、Long Task、CPU 和内存汇总。
- `summaries.overall`：用于检查整次运行的数据完整性，不替代逐场景判断。

Windows 的 `privateKiB` 是主要内存指标；`workingSetKiB` 可能包含共享页面，只作辅助。
CPU 百分比来自相邻 `app.getAppMetrics()` 调用之间的区间，首次调用仅用于建立基线，
不会作为正式样本。

## 测量纪律

正式报告必须记录设备、驱动、电源模式、显示器、dev/packaged 和 GPU 状态。相同场景
至少重复 3 次，保存原始 JSON，并使用 `docs/plan/performance-optimization-plan.md` 中
的统一协议和分流门槛。不要使用真实用户 profile，也不要根据单次最佳结果实施优化。

## 基线校验与报告

正式场景/空闲性能 JSON 可使用以下命令校验协议并从原始 `runs` 独立复算；结构
不同的启动探针 JSON 不适用 `validateBaseline.js`：

```powershell
node tools/performance/validateBaseline.js <json> [json...]
node tools/performance/recomputeBaseline.js <json> [json...]
```

`validateBaseline.js` 要求每个正式场景至少重复 3 次。单次诊断样本可以用于发现
协议问题，但不能单独作为正式分流依据，也不应声称通过该验证器。

启动缓存探针只用于 dev 路径，不修改生产代码：

```powershell
node tools/performance/measureStartup.js --repetitions 5 --power-mode <label> --output <json>
```

当前 Windows 基线与分流报告见
[`2026-07-23-windows-baseline.md`](2026-07-23-windows-baseline.md)。跨时段 CPU
绝对值波动较大，天气前后对比必须使用同批空闲场景作对照。

# 修复计划：代码审查发现 `60244f4` → `HEAD`

## 概述

根据代码审查发现的 5 个高置信度问题，制定修复计划，涉及缓存策略、环境变量解析、类型一致性和工具重复代码。

---

## 任务列表

### 任务 1: 修复 `PetWindow.js:143` — `clearCache` 失败时静默跳过版本升级

**描述：** 改变 `clearCache().finally(() => store.set(...))` 为 `.then()` 仅在成功时持久化版本，`loadFile` 则始终运行。

**验收标准：**
- [ ] 当 `clearCache()` resolve 时，`lastCacheVersion` 更新且 `loadFile` 被调用
- [ ] 当 `clearCache()` reject 时，`lastCacheVersion` 不更新，但 `loadFile` 仍被调用
- [ ] 错误被记录到 console.error

**涉及文件：**
- `src/main/windows/PetWindow.js`

**范围：** XS — 1 文件

---

### 任务 2: 修复 `PetWindow.js:134` — 宽松的环境变量 truthy 检查

**描述：** 将 `!process.env.DESKTOP_PET_SIMULATE_PACKAGED` 替换为 `process.env.DESKTOP_PET_SIMULATE_PACKAGED !== '1'`。防止 `'0'` 或 `'false'` 等值被错误地视为"模拟打包"。

**验收标准：**
- [ ] `DESKTOP_PET_SIMULATE_PACKAGED=1` 时 `isDev` 为 `false`
- [ ] `DESKTOP_PET_SIMULATE_PACKAGED=0` 时 `isDev` 为 `true`
- [ ] 不设置该变量时 `isDev` 为 `true`（在打包应用中依赖 `isPackaged`）

**涉及文件：**
- `src/main/windows/PetWindow.js`

**范围：** XS — 1 文件

---

### 任务 3 (Checkpoint): 测试 Tasks 1-2

- [ ] `npm test` 通过
- [ ] 现有的缓存/启动测试仍通过：`npm test -- --grep "cache|startup|Cache"`

---

### 任务 4: 修复 `WeatherParticleLayer.clear()` 中的类型不一致

**描述：** `clear()` 中将 `this.particleCounts = []` 改为 `this.particleCounts = { weather: [], wind: [] }`，以匹配构造函数和非活跃天气路径中使用的类型结构。

**验收标准：**
- [ ] `clear()` 后 `this.particleCounts` 具有 `{ weather: [], wind: [] }` 形状
- [ ] 所有现有 `weatherParticleLayer.test.js` 测试通过

**涉及文件：**
- `src/ui/WeatherParticleLayer.js`

**范围：** XS — 1 文件，1 行更改

---

### 任务 5: 提取共享的 `waitForCompleteProbe` 到工具模块

**描述：** `measureStartup.js` 和 `measureStartupCache.js` 都定义了 `waitForCompleteProbe`，实现略有不同（在 `clearCacheMs === null` 处理上）。将共享实现提取到一个新的 `probeUtils.js` 中，由两个文件导入。

差异：`measureStartupCache.js` 处理 `clearCacheMs === null` 并将其视为 0（跳过缓存）；`measureStartup.js` 要求两者都是有限值。通过参数化共享函数来保留这种行为差异。

**验收标准：**
- [ ] 新建 `tools/performance/probeUtils.js`
- [ ] 从 `measureStartup.js` 和 `measureStartupCache.js` 中删除重复的 `waitForCompleteProbe`
- [ ] 两个文件都从 `probeUtils.js` 导入
- [ ] 行为与之前完全一致
- [ ] 现有测量/性能测试通过

**涉及文件：**
- `tools/performance/probeUtils.js` (新文件)
- `tools/performance/measureStartup.js`
- `tools/performance/measureStartupCache.js`

**范围：** S — 3 文件

---

### 任务 6: 修复 `validateBaseline.js:45` — GPU 为空值时宽松验证

**描述：** `electronRunner.js` 中 `app.getGPUInfo('basic')` 通过 `.catch(() => null)` 处理失败。但 `validateBaseline.js` 只检查 `hasOwn(environment, 'gpu')`，即使值为 `null` 也能通过。将检查放宽为允许 `null`（或缺失），因为某些环境（CI、无头环境）无法提供 GPU 信息。

**验收标准：**
- [ ] `environment.gpu === null` 时验证通过（不再报错）
- [ ] `environment.gpu` 完全缺失时仍然报错（结构完整性）
- [ ] 现有测试已更新以反映新行为

**涉及文件：**
- `tools/performance/validateBaseline.js`
- `test/performanceBaselineValidation.test.js`（可能需要调整）

**范围：** S — 2 文件

---

### 检查点：完成

- [ ] `npm test` 全部通过
- [ ] Electron 应用能正常启动且不报新的错误
- [ ] 检查所有更改是否符合项目代码风格

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 任务 1：改变 `.finally()` → `.then()` + `.catch()` 可能意外改变执行顺序 | 中 | 在 `finally` 中保留 `loadFile` 以确保无论成功/失败都执行 |
| 任务 5：提取共享工具可能引入回归 | 低 | 两个调用点行为不同（`clearCacheMs`），通过参数化共享函数来保留这种行为差异 |

---

## 依赖关系

```
Task 1 (PetWindow .finally)  ─┬─ Task 3 (Checkpoint)
Task 2 (env var)             ─┘
Task 4 (particleCounts)      ─── (独立)
Task 5 (probeUtils)          ─── (独立)
Task 6 (GPU fallback)        ─── (独立)
```

所有任务彼此独立，可以按任意顺序执行。

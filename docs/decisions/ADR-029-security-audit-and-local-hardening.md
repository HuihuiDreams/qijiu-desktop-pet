# ADR-029: 安全审计与本地硬化

## Status
Accepted

## Date
2026-05-27

## Context
DeskPet 是一个本地 Electron 桌面应用，运行时加载随应用打包的 HTML、CSS、JavaScript 和图片资源。ADR-014 已经确定了运行时 Electron 安全基线：renderer 启用 context isolation、禁用 Node integration、拦截导航和新窗口、默认拒绝权限请求，并为本地页面配置严格 CSP。

本次安全审计发现仍有几类本地硬化空间：

- 部分 renderer DOM 构建仍使用 `innerHTML`。当前值主要来自本地应用数据，但这种模式容易在未来接入更多动态内容时被误用。
- `scripts/convert_images.js` 通过 shell 字符串调用 `ffmpeg`。该脚本属于本地维护工具，但资源文件名可能包含空格或 shell 元字符。
- 依赖审计发现 dev 依赖链中存在 high 漏洞：`tmp <0.2.6`，由 Electron Builder 工具链间接引入。
- 密钥扫描没有发现真实凭据，但 `.gitignore` 未覆盖全部常见本地密钥文件名。

## Decision
保留 ADR-014 作为运行时 Electron 安全基线，并增加一组本地硬化约束，覆盖 renderer DOM、维护脚本、依赖审计和本地密钥文件。

1. 动态 renderer 内容优先使用 DOM API，而不是拼接 HTML 字符串。`PetRenderer` 已改为使用 `document.createElement`、`appendChild` 和 `textContent` 构建宠物节点，不再使用 `innerHTML`。
2. 为动态 HTML 注入面增加回归测试。现有 `htmlInjectionHardening` 测试已扩展到 `PetRenderer`，防止未来退回 `innerHTML`。
3. 当命令参数可以结构化传递时，本地脚本避免使用 shell 命令字符串。`scripts/convert_images.js` 已改为使用 `spawnSync` 和参数数组调用 `ffmpeg`。
4. `npm audit` 中 high / critical 漏洞默认视为发布阻断项，除非明确记录为不可达。此次 `tmp` dev 依赖链漏洞已通过 lockfile 升级到 `tmp@0.2.6` 修复。
5. 默认忽略常见本地密钥文件。`.gitignore` 已补充 `.env.local`、`.env.*.local` 和 `*.key`。

## Alternatives Considered
### 保留现有 `innerHTML`
- 优点：改动更少；当前数据来源主要是本地且可控。
- 缺点：renderer 类中会继续保留一个容易被复制和误用的危险模式。
- 结论：拒绝。这里的 UI 只需要图片节点和文本节点，DOM API 足够简单。

### 在写入 HTML 前做 sanitize
- 优点：未来如果需要渲染有限的富文本，可以保留能力。
- 缺点：需要引入 sanitizer 依赖和策略维护成本，而当前 UI 不需要富文本。
- 结论：拒绝。直接使用 DOM API 更简单，也更符合当前需求。

### 保留维护脚本中的 shell 字符串
- 优点：脚本更短，命令行写法直观。
- 缺点：文件名 quoting 在不同平台上容易出错，也更容易被特殊字符影响。
- 结论：拒绝。`spawnSync(command, args)` 更清晰，并且绕开 shell 解析。

### 暂缓 dev 依赖漏洞
- 优点：漏洞位于构建/开发工具链，不属于应用运行时依赖。
- 缺点：打包工具会处理本地文件并运行在发布机器上；当 high 路径穿越漏洞已有兼容补丁时，不应留下已知风险。
- 结论：拒绝。兼容的修复版本已经可用。

## Consequences
- renderer 动态内容少了一个易引入 XSS 的构建模式。
- 资源维护脚本对特殊文件路径更稳健。
- 修复后 `npm audit --audit-level=high` 和 `npm audit --omit=dev --audit-level=high` 都返回 `0 vulnerabilities`。
- 后续贡献者有更明确的规则：除非有记录充分的理由，否则动态 DOM 使用结构化 API，进程调用使用结构化参数。
- 不预期产生用户可见行为变化。

## 验证
- `npm test`
- `npm audit --audit-level=high --strict-ssl=false`
- `npm audit --omit=dev --audit-level=high --strict-ssl=false`
- 对应用代码和脚本进行 secret pattern 扫描

## 变更文件
| 文件 | 目的 |
|---|---|
| `src/pet/PetRenderer.js` | 将宠物节点渲染从 `innerHTML` 改为 DOM API。 |
| `test/htmlInjectionHardening.test.js` | 为 `PetRenderer` 增加注入硬化回归测试。 |
| `scripts/convert_images.js` | 使用 `spawnSync` 参数数组调用 `ffmpeg`。 |
| `.gitignore` | 忽略更多本地密钥文件模式。 |
| `package-lock.json` | 将 `tmp` 解析到已修复的 `0.2.6`。 |

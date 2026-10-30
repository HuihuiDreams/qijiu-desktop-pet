# Security Best Practices Report — DeskPet (`qijiu-desktop-pet`)

## Executive Summary

This security review audited the runtime application code of **DeskPet (`qijiu-desktop-pet`)** across its **Electron `^42.2.0` / Node.js CommonJS** main process, **context-isolated preload scripts**, and **Vanilla Browser JavaScript / HTML / CSS** renderer processes against frontend/JavaScript (`javascript-general-web-frontend-security.md`) and Electron security best practices, aligned with the repository's existing threat model (`security-scans/threat_model.md`) and architectural constraints (`AGENTS.md`).

### Existing Security Baseline (Verified Controls)
The codebase demonstrates a strong security posture and defense-in-depth across its primary trust boundaries:
- **Process Sandboxing & Isolation**: All 7 `BrowserWindow` instances (`src/main/windows/PetWindow.js:122-127`, `src/main/windows/CitySettingWindow.js:66-71`, `src/main/windows/PetScaleWindow.js:86-91`, `src/main/windows/PomodoroWindow.js:123-128`, `src/main/windows/SkinSelectorWindow.js:63-68`, `src/main/windows/StatusWindow.js:102-107`, `src/main/windows/UpdateProgressWindow.js:34-39`) enforce `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- **Navigation & Window Creation Lockdown**: Every window blocks popup creation via `setWindowOpenHandler(() => ({ action: 'deny' }))` and blocks navigation via `will-navigate` `event.preventDefault()`. The default session denies all permission requests (`src/main/AppLifecycle.js:79-81`).
- **DOM XSS & Code Execution Sinks**: Renderer scripts (`src/**/*.js`) exclusively construct DOM nodes using `document.createElement`, `textContent`, and `replaceChildren`. Zero occurrences of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or `new Function` exist in runtime code.
- **IPC Authorization & Input Normalization**: Main-process IPC handlers validate sender identity via `src/main/services/IpcSenderAuthorization.js` (`isSenderWindow`, `isSenderMainWindow`, `isSenderAnyWindow`) and normalize untrusted arguments through `ipcContracts.js`.
- **Custom Protocol Hardening (`pet-asset://`)**: `protectedAssetProtocol.js:46-50` and `protectedAssetLoader.js:9,190-205` enforce a strict asset ID allowlist regex (`^skin\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.webp$`), `path.relative` traversal checks, AES-256-GCM authentication tag verification, and SHA-256 plaintext integrity checks.

### Summary of Findings

| ID | Severity | Rule / Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- |
| **SBP-001** | **Medium (Resolved)** | Electron Process Isolation | `src/main/AppLifecycle.js:50-53` | `disable-site-isolation-trials` command-line switch removed to restore Chromium Site Isolation |
| **SBP-002** | **Low** | IPC Boundary / Input Validation (`TH-05`) | `src/main/services/StorageIpc.js:20-47`, `src/main/windows/StatusWindow.js:13-26` | `save-data` and status window IPC channels lack value schema/size validation and write rate limiting |
| **SBP-003** | **Low** | Content Security Policy & Trusted Types (`JS-CSP-001`, `JS-TT-001`) | `src/index.html:6-13` (and 6 sub-window HTML files) | `style-src 'unsafe-inline'` in `src/index.html` and absence of `require-trusted-types-for 'script'` across HTML entrypoints |
| **SBP-004** | **Low** | Network Response Resource Bounds | `weatherSyncService.js:111-120`, `weatherSyncService.js:137-146` | Unbounded response body accumulation in `requestJsonWithElectronNet` and `requestJsonWithHttps` |
| **SBP-005** | **Informational** | OS Subprocess Binary Path Consistency (`TH-03`) | `activeWindowProvider.js:389-393` | `pmset` invoked by bare binary name rather than resolved system path `/usr/bin/pmset` |
| **SBP-006** | **Informational** | Documented Project Overrides / Design Trade-offs | `protectedAssetLoader.js:6-8`, `main.js:5-12` | Embedded asset obfuscation key (`deskpet-protected-skin-assets-v1`) and QA `DESKTOP_PET_USER_DATA_DIR` override |

---

## Medium Severity Findings

### SBP-001 — Chromium Site Isolation Disabled Globally via `disable-site-isolation-trials`

- **Rule ID**: Electron Security Best Practices — Process Sandboxing & Site Isolation
- **Severity**: Medium
- **Location**: `src/main/AppLifecycle.js:50-54` (`configureChromiumMemoryBudget`)
- **Evidence**:
  ```javascript
  // src/main/AppLifecycle.js:50-54
  function configureChromiumMemoryBudget() {
    app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
    app.commandLine.appendSwitch('disable-site-isolation-trials');
    app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
  }
  ```
- **Impact**: Appending `disable-site-isolation-trials` disables Chromium's Site Isolation (out-of-process iframes and cross-origin process locks) across the application. While DeskPet currently loads only local `file://` pages and `pet-asset://` images and blocks all external navigation (`will-navigate`), disabling site isolation removes a key Chromium process-boundary defense-in-depth mechanism if an iframe, webview, or multi-origin resource is ever introduced.
- **Fix**: Remove `app.commandLine.appendSwitch('disable-site-isolation-trials')` unless empirical memory profiling confirms it is strictly required on single-origin local windows (since single-origin windows without cross-origin subframes rarely spawn additional site-isolated renderer processes):
  ```javascript
  function configureChromiumMemoryBudget() {
    app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
    app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
  }
  ```
- **False-Positive / Override Notes**: If retained intentionally for memory footprint constraints, document the trade-off in an ADR alongside the invariant that no `<iframe>`, `<webview>`, or remote origins may be loaded in any `BrowserWindow`.

---

## Low Severity / Defense-in-Depth Findings

### SBP-002 — Missing Value Schema Validation and Size Limits on `save-data` and Status Window IPC Channels

- **Rule ID**: Electron IPC Trust Boundary / `security-scans/threat_model.md` (`TH-05`)
- **Severity**: Low (Defense-in-Depth)
- **Location**:
  - `src/main/services/StorageIpc.js:20-47` (`init` -> `ipcMain.handle('save-data', ...)`)
  - `src/main/windows/StatusWindow.js:13-26` (`show-status-window`, `update-status-window`)
  - `src/statusWindow.js:30-42` (`renderPetBlock`)
- **Evidence**:
  ```javascript
  // src/main/services/StorageIpc.js:20-43
  ipcMain.handle('save-data', async (event, key, value) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return false;
    if (!ALLOWED_STORE_KEYS.includes(key)) {
      console.warn(`[Security] 拦截到非法的数据保存请求: ${key}`);
      return false;
    }
    try {
      await StoreManager.initStore();
      const store = StoreManager.getStore();
      if (!store) return false;
      if (key === 'petState' && value && typeof value === 'object') {
        const confirmedSkinId = typeof getConfirmedSkinId === 'function'
          ? getConfirmedSkinId()
          : value.skinId;
        if (confirmedSkinId !== undefined) {
          value = {
            ...value,
            skinId: confirmedSkinId,
          };
        }
      }
      store.set(key, value);
      return true;
  ```
  ```javascript
  // src/main/windows/StatusWindow.js:13-26
  ipcMain.on('show-status-window', (event, data) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return;
    showStatusWindow(data);
  });
  ...
  ipcMain.on('update-status-window', (event, data) => {
    if (!isSenderMainWindow(event, windowManager.mainWindow)) return;
    updateStatusWindow(data);
  });
  ```
- **Impact**: Although `StorageIpc.js` verifies `isSenderMainWindow`, enforces `ALLOWED_STORE_KEYS` (`['autoLaunch', 'petState', 'locale', 'breakReminder', 'lastPomodoroMinutes']`), and overrides `petState.skinId` with the main-process `confirmedSkinId`, it does not validate the structure or byte size of `value` before writing to `electron-store`. A compromised or malfunctioning main renderer could persist arbitrarily large objects or malformed state types to `config.json`, causing startup deserialization failures or disk amplification. Similarly, `StatusWindow.js` relays `data` from `mainWindow` to `statusWindow` without normalizing fields such as `pet.image` (consumed by `icon.src = pet.image` in `src/statusWindow.js:40`, mitigated by `src/status.html:7` CSP `img-src 'self' data: pet-asset:`).
- **Fix**: Add lightweight per-key validators in `ipcContracts.js` (e.g., boolean check for `autoLaunch`, supported locale check for `locale`, finite integer check for `lastPomodoroMinutes`, and a serialized JSON byte ceiling such as 64 KB for `petState` and `breakReminder`) before calling `store.set(key, value)`. Normalize `status-window-data` payloads in `ipcContracts.js` before forwarding to `statusWindow`.
- **False-Positive / Override Notes**: Exploiting this requires prior code execution inside `mainWindow` (`isSenderMainWindow`), and `petState.skinId` privilege escalation is already blocked at `src/main/services/StorageIpc.js:30-40`.

---

### SBP-003 — `style-src 'unsafe-inline'` in Main Window CSP and Absence of Trusted Types Enforcement

- **Rule ID**: `JS-CSP-001` (Content Security Policy) / `JS-TT-001` (Trusted Types for DOM XSS Prevention)
- **Severity**: Low (Defense-in-Depth)
- **Location**:
  - `src/index.html:6-13`
  - `src/city-setting.html:6-7`, `src/pet-scale.html:6-7`, `src/pomodoro.html:6-7`, `src/skin-selector.html:6-7`, `src/status.html:6-7`, `src/update-progress.html:6-7`
- **Evidence**:
  ```html
  <!-- src/index.html:6-13 -->
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: pet-asset:;
    font-src 'self';
    connect-src 'self';
  ">
  ```
- **Impact**:
  1. `src/index.html` permits `style-src 'self' 'unsafe-inline'` (whereas all 6 sub-window HTML files enforce `style-src 'self'`). While CSS exfiltration is mitigated by `default-src 'none'`, `connect-src 'self'`, and `img-src 'self' data: pet-asset:`, `'unsafe-inline'` allows arbitrary inline style injection if untrusted strings ever reach style attributes.
  2. None of the 7 HTML entrypoints include `require-trusted-types-for 'script';`. Because the renderer codebase already has zero unsafe DOM HTML sinks (`innerHTML`, `outerHTML`, `document.write`), enabling Trusted Types in CSP is a zero-regression defense-in-depth guard that prevents accidental introduction of DOM XSS sinks in future code changes.
- **Fix**:
  Add `require-trusted-types-for 'script';` to the `<meta http-equiv="Content-Security-Policy">` tag in all 7 HTML files (`src/index.html`, `src/city-setting.html`, `src/pet-scale.html`, `src/pomodoro.html`, `src/skin-selector.html`, `src/status.html`, `src/update-progress.html`):
  ```html
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: pet-asset:;
    font-src 'self';
    connect-src 'self';
    require-trusted-types-for 'script';
  ">
  ```
- **False-Positive / Override Notes**: `style-src 'unsafe-inline'` in `src/index.html` is currently required by the 60fps animation/particle systems (`src/pet/PetRenderer.js`, `src/ui/WeatherParticleLayer.js`, `src/ui/ScreensaverParticleLayer.js`, `src/ui/ContextMenu.js`) which mutate `element.style.*` and CSS custom properties dynamically. Keep `'unsafe-inline'` for `style-src` in `src/index.html` unless inline style attribute mutations are migrated to CSSOM / typed style sheets, and verify Playwright smoke tests pass if adding `require-trusted-types-for 'script'`.

---

### SBP-004 — Unbounded Response Body Accumulation in External Weather HTTPS Requests

- **Rule ID**: Network Resource Bounds / Main Process Memory Protection (`TH-02`)
- **Severity**: Low
- **Location**: `weatherSyncService.js:111-120` (`requestJsonWithElectronNet`), `weatherSyncService.js:137-146` (`requestJsonWithHttps`)
- **Evidence**:
  ```javascript
  // weatherSyncService.js:111-120
  let data = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { data += chunk.toString(); });
  res.on('end', () => {
    try {
      finish(resolve, parseJsonResponse(data));
    } catch (e) {
      finish(reject, e);
    }
  });
  ```
  ```javascript
  // weatherSyncService.js:137-146
  let data = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      resolve(parseJsonResponse(data));
    } catch (e) {
      reject(e);
    }
  });
  ```
- **Impact**: Both HTTP client implementations enforce request timeouts (10s/30s) and strict finite-number/string schema parsing after `JSON.parse`, and only connect to hardcoded `https://*.open-meteo.com` endpoints (`weatherSyncService.js:4-6`). However, neither enforces a maximum response body byte limit while streaming `data` chunks. Because the main/V8 heap budget is capped (`--max-old-space-size=128` in `src/main/AppLifecycle.js:51`), a compromised upstream server, captive portal, or TLS-intercepting proxy streaming a multi-megabyte payload within the timeout window could trigger main-process memory exhaustion.
- **Fix**: Enforce a response size ceiling (e.g., `MAX_RESPONSE_BYTES = 256 * 1024`) inside the `res.on('data', ...)` handlers in both `requestJsonWithElectronNet` and `requestJsonWithHttps`, aborting the request and rejecting if exceeded:
  ```javascript
  const MAX_RESPONSE_BYTES = 256 * 1024;
  let data = '';
  let receivedBytes = 0;
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    const str = chunk.toString();
    receivedBytes += Buffer.byteLength(str, 'utf8');
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      try { req.abort(); } catch {}
      finish(reject, new Error('Response exceeded maximum allowed size'));
      return;
    }
    data += str;
  });
  ```
- **False-Positive / Override Notes**: Normal Open-Meteo geocoding and forecast JSON payloads are under 10 KB, so a 256 KB cap has zero impact on normal operation.

---

## Informational Findings & Documented Project Overrides

### SBP-005 — Resolve Absolute System Path `/usr/bin/pmset` in `activeWindowProvider.js`

- **Rule ID**: OS Subprocess Execution Hardening (`security-scans/threat_model.md` `TH-03`)
- **Severity**: Informational
- **Location**: `activeWindowProvider.js:389-393` (`createMacActiveWindowProvider`)
- **Evidence**:
  ```javascript
  // activeWindowProvider.js:389-393
  execFileImpl(
    'pmset',
    ['-g', 'assertions'],
    { timeout: timeoutMs, env: getSafeChildProcessEnv() },
    (error, stdout, stderr) => {
  ```
- **Impact**: `getSafeChildProcessEnv()` (`meetingDetector.js:90-103`) already pins `PATH: '/usr/bin:/bin:/usr/sbin'`, mitigating `PATH` hijacking (`TH-03`). However, whereas `meetingDetector.js:61-70` resolves `/usr/bin/pgrep` and `/usr/sbin/lsof` via `getSystemBinaryPath()`, `activeWindowProvider.js:390` passes bare `'pmset'`.
- **Fix**: Use `getSystemBinaryPath('pmset', ['/usr/bin/pmset'])` (when `options.execFile` is not injected by unit tests, matching `meetingDetector.js:61-63`) for consistency across all macOS subprocess calls.

---

### SBP-006 — Documented Architecture Trade-Offs (Protected Asset Key & QA UserData Override)

- **Rule ID**: Project Architecture Notes (`security-scans/threat_model.md`)
- **Severity**: Informational (No Change Recommended)
- **Location**:
  - `protectedAssetLoader.js:6-8` (`KEY` derivation from `'deskpet-protected-skin-assets-v1'`)
  - `main.js:5-12` (`configureQaUserDataPath` reading `process.env.DESKTOP_PET_USER_DATA_DIR`)
- **Notes**:
  1. `protectedAssetLoader.js:6-8` derives an AES-256-GCM key from a static passphrase in code. In a local offline desktop client without user authentication or remote key escrow, this is an intentional asset obfuscation and integrity mechanism (`manifest.json` SHA-256 + GCM auth tag) rather than cryptographic secret storage.
  2. `main.js:5-12` allows overriding `userData` via `DESKTOP_PET_USER_DATA_DIR`. This is required for isolated Playwright E2E smoke tests (`AGENTS.md` Architecture Boundary #4) and requires local environment variable control (already within the local OS user trust boundary).

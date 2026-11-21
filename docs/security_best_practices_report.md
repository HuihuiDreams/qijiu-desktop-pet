# Security Best Practices Report — DeskPet (`qijiu-desktop-pet`)

## Executive Summary

This security review audited the runtime application code of **DeskPet (`qijiu-desktop-pet`)** across its **Electron `^45.3.1` / Node.js CommonJS** main process, **context-isolated preload scripts**, and **Vanilla Browser JavaScript / HTML / CSS** renderer processes against frontend/JavaScript (`javascript-general-web-frontend-security.md`) and Electron security best practices, aligned with the repository's existing threat model ([threat model](archive/qijiu-desktop-pet-threat-model.md)) and architectural constraints (`AGENTS.md`).

### Existing Security Baseline (Verified Controls)

The codebase demonstrates a strong security posture and defense-in-depth across its primary trust boundaries:

- **Process Sandboxing & Isolation**: All 6 `BrowserWindow` instances (`src/main/windows/PetWindow.js:230-232`, `src/main/windows/PomodoroWindow.js:126-128`, `src/main/windows/SettingsWindow.js:119-121`, `src/main/windows/SkinSelectorWindow.js:97-99`, `src/main/windows/StatusWindow.js:105-107`, `src/main/windows/UpdateProgressWindow.js:41-43`) enforce `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The unified settings window (`SettingsWindow.js`, [ADR-050](decisions/ADR-050-unified-settings-window.md)) replaces the former city-setting and pet-scale windows, which no longer exist.
- **Navigation & Window Creation Lockdown**: Every window blocks popup creation via `setWindowOpenHandler(() => ({ action: 'deny' }))` and blocks navigation via `will-navigate` `event.preventDefault()`. The default session denies all permission requests (`src/main/AppLifecycle.js:79-81`).
- **DOM XSS & Code Execution Sinks**: Renderer scripts (`src/**/*.js`) exclusively construct DOM nodes using `document.createElement`, `textContent`, and `replaceChildren`. Zero occurrences of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or `new Function` exist in runtime code.
- **IPC Authorization & Input Normalization**: Main-process IPC handlers validate sender identity via `src/main/services/IpcSenderAuthorization.js` (`isSenderWindow`, `isSenderMainWindow`, `isSenderAnyWindow`) and normalize untrusted arguments through `ipcContracts.js`.
- **Custom Protocol Hardening (`pet-asset://`)**: `protectedAssetProtocol.js:46-50` and `protectedAssetLoader.js:9,190-205` enforce a strict asset ID allowlist regex (`^skin\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.webp$`), `path.relative` traversal checks, AES-256-GCM authentication tag verification, and SHA-256 plaintext integrity checks.

### Summary of Findings

| ID | Severity | Rule / Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- |
| **SBP-001** | **Medium (Resolved)** | Electron Process Isolation | `src/main/AppLifecycle.js:49-52` | `disable-site-isolation-trials` command-line switch removed to restore Chromium Site Isolation |
| **SBP-002** | **Low** | IPC Boundary / Input Validation (`TH-05`) | `src/main/services/StorageIpc.js:20-48`, `src/main/windows/StatusWindow.js:14-27` | `save-data` and status window IPC channels lack value schema/size validation and write rate limiting |
| **SBP-003** | **Low** | Content Security Policy & Trusted Types (`JS-CSP-001`, `JS-TT-001`) | `src/index.html:9` (and 5 sub-window HTML files) | `style-src 'unsafe-inline'` in `src/index.html` and absence of `require-trusted-types-for 'script'` across HTML entrypoints |
| **SBP-004** | **Low (Resolved)** | Network Response Resource Bounds | `weatherSyncService.js:73-138`, `weatherSyncService.js:140-176` | Unbounded response body accumulation in `requestJsonWithElectronNet` and `requestJsonWithHttps` |
| **SBP-005** | **Informational** | OS Subprocess Binary Path Consistency (`TH-03`) | `activeWindowProvider.js:573-577` | `pmset` invoked by bare binary name rather than resolved system path `/usr/bin/pmset` |
| **SBP-006** | **Informational** | Documented Project Overrides / Design Trade-offs | `protectedAssetLoader.js:6-8`, `main.js:5-12` | Embedded asset obfuscation key (`deskpet-protected-skin-assets-v1`) and QA `DESKTOP_PET_USER_DATA_DIR` override |

---

## Medium Severity Findings

### SBP-001: Chromium Site Isolation Disabled via Command-Line Switch [Resolved]

- **Rule ID**: Electron Security Best Practices — Process Sandboxing & Site Isolation
- **Severity**: Medium
- **Location**: `src/main/AppLifecycle.js:49-52` (`configureChromiumMemoryBudget`; the removed switch was at lines 50-54 before the fix)
- **Evidence**:

  ```javascript
  // src/main/AppLifecycle.js:50-54 (before the fix)
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
- **Status / Resolution**: `app.commandLine.appendSwitch('disable-site-isolation-trials')` has been removed from `src/main/AppLifecycle.js` and is guarded against regression by `test/mainMemoryBudget.test.js`.

---

## Low Severity / Defense-in-Depth Findings

### SBP-002 — Missing Value Schema Validation and Size Limits on `save-data` and Status Window IPC Channels

- **Rule ID**: Electron IPC Trust Boundary / `archive/qijiu-desktop-pet-threat-model.md` (`TH-05`)
- **Severity**: Low (Defense-in-Depth)
- **Location**:
  - `src/main/services/StorageIpc.js:20-48` (`init` -> `ipcMain.handle('save-data', ...)`)
  - `src/main/windows/StatusWindow.js:14-27` (`show-status-window`, `update-status-window`)
  - `src/statusWindow.js:41-52` (`renderPetStats`, `pet.image` branch)
- **Evidence**:

  ```javascript
  // src/main/services/StorageIpc.js:20-48
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
      if (key === 'petState') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
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
  // src/main/windows/StatusWindow.js:14-27
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

- **Impact**: Although `StorageIpc.js` verifies `isSenderMainWindow`, enforces `ALLOWED_STORE_KEYS` (`['autoLaunch', 'petState', 'locale', 'breakReminderSettings', 'lastPomodoroMinutes']`), rejects `petState` values that are not non-array objects, and overrides `petState.skinId` with the main-process `confirmedSkinId`, it does not validate the nested fields or byte size of `value` before writing to `electron-store`. A compromised or malfunctioning main renderer could persist arbitrarily large objects or malformed state types to `config.json`, causing startup deserialization failures or disk amplification. Similarly, `StatusWindow.js` relays `data` from `mainWindow` to `statusWindow` without normalizing fields such as `pet.image` (consumed by `icon.src = pet.image` in `src/statusWindow.js:51`, mitigated by `src/status.html:7` CSP `img-src 'self' data: pet-asset:`).
- **Fix**: Add lightweight per-key validators in `ipcContracts.js` (e.g., boolean check for `autoLaunch`, supported locale check for `locale`, finite integer check for `lastPomodoroMinutes`, and a serialized JSON byte ceiling such as 64 KB for `petState` and `breakReminderSettings`) before calling `store.set(key, value)`. Normalize `status-window-data` payloads in `ipcContracts.js` before forwarding to `statusWindow`.
- **False-Positive / Override Notes**: Exploiting this requires prior code execution inside `mainWindow` (`isSenderMainWindow`), and `petState.skinId` privilege escalation is already blocked at `src/main/services/StorageIpc.js:30-41`.
- **Status / Resolution**: Partially mitigated. Since commit `8c9c837`, `save-data` rejects `petState` values that are not non-array objects (`src/main/services/StorageIpc.js:31`). Nested field validation, a byte size ceiling, and normalization of status window payloads remain open.

---

### SBP-003 — `style-src 'unsafe-inline'` in Main Window CSP and Absence of Trusted Types Enforcement

- **Rule ID**: `JS-CSP-001` (Content Security Policy) / `JS-TT-001` (Trusted Types for DOM XSS Prevention)
- **Severity**: Low (Defense-in-Depth)
- **Location**:
  - `src/index.html:9`
  - `src/pomodoro.html:7`, `src/settings.html:7`, `src/skin-selector.html:7`, `src/status.html:7`, `src/update-progress.html:5`
- **Evidence**:

  ```html
  <!-- src/index.html:9 -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: pet-asset:; font-src 'self';">
  ```

- **Impact**:
  1. `src/index.html` permits `style-src 'self' 'unsafe-inline'` (whereas all 5 sub-window HTML files enforce `style-src 'self'`). While CSS exfiltration is mitigated by `default-src 'none'` (which also restricts `connect-src`) and `img-src 'self' data: pet-asset:`, `'unsafe-inline'` allows arbitrary inline style injection if untrusted strings ever reach style attributes.
  2. None of the 6 HTML entrypoints include `require-trusted-types-for 'script';`. Because the renderer codebase already has zero unsafe DOM HTML sinks (`innerHTML`, `outerHTML`, `document.write`), enabling Trusted Types in CSP is a zero-regression defense-in-depth guard that prevents accidental introduction of DOM XSS sinks in future code changes.
- **Fix**:
  Add `require-trusted-types-for 'script';` to the `<meta http-equiv="Content-Security-Policy">` tag in all 6 HTML files (`src/index.html`, `src/pomodoro.html`, `src/settings.html`, `src/skin-selector.html`, `src/status.html`, `src/update-progress.html`):

  ```html
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: pet-asset:;
    font-src 'self';
    require-trusted-types-for 'script';
  ">
  ```

- **False-Positive / Override Notes**: `style-src 'unsafe-inline'` in `src/index.html` is currently required by the 60fps animation/particle systems (`src/pet/PetRenderer.js`, `src/ui/WeatherParticleLayer.js`, `src/ui/ScreensaverParticleLayer.js`, `src/ui/ContextMenu.js`) which mutate `element.style.*` and CSS custom properties dynamically. Keep `'unsafe-inline'` for `style-src` in `src/index.html` unless inline style attribute mutations are migrated to CSSOM / typed style sheets, and verify Playwright smoke tests pass if adding `require-trusted-types-for 'script'`.

---

### SBP-004 — Unbounded Response Body Accumulation in External Weather HTTPS Requests [Resolved]

- **Rule ID**: Network Resource Bounds / Main Process Memory Protection (`TH-02`)
- **Severity**: Low
- **Location**: `weatherSyncService.js:73-138` (`requestJsonWithElectronNet`), `weatherSyncService.js:140-176` (`requestJsonWithHttps`)
- **Evidence**:

  ```javascript
  // weatherSyncService.js:111-120 (before the fix)
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
  // weatherSyncService.js:137-146 (before the fix)
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

- **Impact**: Both HTTP client implementations enforce request timeouts (10s/30s) and strict finite-number/string schema parsing after `JSON.parse`, and only connect to hardcoded `https://*.open-meteo.com` endpoints (`weatherSyncService.js:204` and `:247`). However, neither enforces a maximum response body byte limit while streaming `data` chunks. Because the main/V8 heap budget is capped (`--max-old-space-size=128` in `src/main/AppLifecycle.js:50`), a compromised upstream server, captive portal, or TLS-intercepting proxy streaming a multi-megabyte payload within the timeout window could trigger main-process memory exhaustion.
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
- **Status / Resolution**: `weatherSyncService.js` now enforces `MAX_RESPONSE_BYTES = 256 * 1024` in both transports (the Electron net path aborts the request, the HTTPS fallback destroys it) and the HTTPS fallback also handles `res` stream errors. Covered by `test/weatherSyncService.test.js` (audit L7, see [code-review-audit-verification-2026-11-13.md](archive/code-review-audit-verification-2026-11-13.md)).

---

## Informational Findings & Documented Project Overrides

### SBP-005 — Resolve Absolute System Path `/usr/bin/pmset` in `activeWindowProvider.js`

- **Rule ID**: OS Subprocess Execution Hardening (`archive/qijiu-desktop-pet-threat-model.md` `TH-03`)
- **Severity**: Informational
- **Location**: `activeWindowProvider.js:573-577` (`createMacActiveWindowProvider`)
- **Evidence**:

  ```javascript
  // activeWindowProvider.js:573-577
  execFileImpl(
    'pmset',
    ['-g', 'assertions'],
    { timeout: timeoutMs, env: getSafeChildProcessEnv() },
    (error, stdout, stderr) => {
  ```

- **Impact**: `getSafeChildProcessEnv()` (`meetingDetector.js:83-100`) already pins `PATH` to `/usr/bin:/bin:/usr/sbin` on non-Windows platforms (`meetingDetector.js:97`), mitigating `PATH` hijacking (`TH-03`). However, whereas `meetingDetector.js:61-70` resolves `/usr/bin/pgrep` and `/usr/sbin/lsof` via `getSystemBinaryPath()`, `activeWindowProvider.js:574` passes bare `'pmset'`.
- **Fix**: Add a `pmset` branch to `getSystemBinaryPath()` in `meetingDetector.js` that resolves `/usr/bin/pmset`, the same way it already handles `pgrep` and `lsof` (`meetingDetector.js:61-70`), and call `pmset` through the resolved path in `createMacActiveWindowProvider`. Update any test that asserts the bare `'pmset'` command.

---

### SBP-006 — Documented Architecture Trade-Offs (Protected Asset Key & QA UserData Override)

- **Rule ID**: Project Architecture Notes (`archive/qijiu-desktop-pet-threat-model.md`)
- **Severity**: Informational (No Change Recommended)
- **Location**:
  - `protectedAssetLoader.js:6-8` (`KEY` derivation from `'deskpet-protected-skin-assets-v1'`)
  - `main.js:5-12` (`configureQaUserDataPath` reading `process.env.DESKTOP_PET_USER_DATA_DIR`)
- **Notes**:
  1. `protectedAssetLoader.js:6-8` derives an AES-256-GCM key from a static passphrase in code. In a local offline desktop client without user authentication or remote key escrow, this is an intentional asset obfuscation and integrity mechanism (`manifest.json` SHA-256 + GCM auth tag) rather than cryptographic secret storage.
  2. `main.js:5-12` allows overriding `userData` via `DESKTOP_PET_USER_DATA_DIR`. This is required for isolated Playwright E2E smoke tests (`AGENTS.md` Architecture Boundary #4) and requires local environment variable control (already within the local OS user trust boundary).

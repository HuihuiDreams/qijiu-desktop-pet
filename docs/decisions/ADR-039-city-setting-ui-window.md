# ADR-039: City Setting UI Window

## Status
Accepted

## Date
2026-06-19

## Context
In previous iterations (Phase 2 MVP of Weather Sync), the "Set City" (修改城市) option in the system tray menu opened the raw `config.json` file in the user's default text editor. This approach had several drawbacks:
- Exposing the raw JSON file increases the risk of users accidentally corrupting other settings (e.g., breaking JSON syntax, modifying internal variables).
- There was no immediate feedback or validation of the city name until the file was saved and the main process read it, which could silently fail.
- It was not user-friendly for a polished, immersive desktop pet application.

A dedicated, sandboxed UI window was needed to safely capture the city name input, immediately trigger geocoding validation, and provide real-time status feedback (success/error) before closing itself.

## Decision
We implemented a dedicated **City Setting UI Window** (`citySettingWindow`) replacing the `store.openInEditor()` fallback.

1. **Window Lifecycle and Security**:
   - The window is created on-demand as a frameless, transparent, `alwaysOnTop` Electron `BrowserWindow`.
   - It is strictly sandboxed (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`) with a strict CSP.
   - It is properly cleaned up when the `mainWindow` is closed.

2. **Visual Design System**:
   - The UI reuses the established "xianxia glassmorphism" design system from the Pomodoro feature (`pomodoro.css`).
   - It relies entirely on standard CSS, avoiding heavy frameworks, maintaining high performance and visual consistency (jade/gold palette).

3. **IPC Architecture**:
   - Exposed three minimal, purpose-built APIs via `preload.js`: `getCitySettings`, `setCityName`, and `closeCitySettingWindow`.
   - `setCityName` handles input validation (length limits, trimming) and directly calls `processSettingsChange` in the main process to execute the Open-Meteo geocoding request.
   - The IPC returns a strictly shaped object (`{ success: true/false, city: string }`) matching the conventions established in [ADR-032](./ADR-032-ipc-result-shape.md).

4. **I18n (Multilingual Support)**:
   - Full support for Chinese (zh), English (en), and Japanese (ja) dictionaries.
   - The renderer updates elements dynamically via `data-i18n` attributes.
   - Locale changes triggered from the main tray menu are forwarded to this window seamlessly.

## Consequences
- **Positive**: Eliminates the risk of users breaking their configuration files.
- **Positive**: Provides a significantly better UX with immediate visual feedback (e.g., "Searching...", "Set to Tokyo", or "City not found").
- **Positive**: Keeps the design consistent with the rest of the application (like the Pomodoro and Status windows).
- **Negative**: Increases the complexity of the main process window management slightly, adding another floating window to track and clean up.

## Alternatives Considered
- **HTML Dialog in Main Window**: Instead of a separate OS-level window, we could have drawn an overlay in the main transparent pet window. *Rejected* because the main window's click-through behavior and `ignoreMouseEvents` complexity make interactive forms difficult to maintain and error-prone. A separate BrowserWindow is safer and matches the Pomodoro architecture.
- **Input via Native OS Prompt**: Use an external dependency or VBScript/AppleScript to trigger a native OS input box. *Rejected* because it breaks cross-platform consistency and looks entirely out of place for a xianxia-themed application.

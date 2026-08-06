# Simplify Screensaver Return Bubble Logic

This plan executes the simplification of the screensaver return bubble buffering logic, removing over-engineered state tracking and edge-case lifecycle handling in favor of a simpler, inline approach.

## User Review Required

> [!WARNING]
> This removes the `handleScreensaverStart` and `onScreensaverStart` hooks, which were specifically added to clear the `shown` state when the screensaver interrupted a sequence. By relying on inline `setTimeout` closures that put the pending state back on interruption, the behavior remains functionally identical but the explicit test cases for `shown` and `handleScreensaverStart` will be removed. Please confirm this test removal is acceptable.

## Proposed Changes

### Core Logic

#### [MODIFY] [app.js](file:///Users/huihui/Documents/qijiu-desktop-pet/src/app.js)
- Remove `onScreensaverStart: () => offlineReturnSystem.handleScreensaverStart()` hook entirely.

#### [MODIFY] [ScreensaverSystem.js](file:///Users/huihui/Documents/qijiu-desktop-pet/src/systems/ScreensaverSystem.js)
- Remove `this.onScreensaverStart` property and its invocation in `init()`.

#### [MODIFY] [OfflineReturnSystem.js](file:///Users/huihui/Documents/qijiu-desktop-pet/src/systems/OfflineReturnSystem.js)
- Remove `RETURN_BUBBLE_SEQUENCE_MS` constant.
- Simplify `pendingReturnBubble` to just store the raw pet references and strings, omitting `shown` tracking.
- Delete `scheduleReturnBubbles` and `handleScreensaverStart`.
- Rewrite `flushPendingReturnBubble` to consume the pending object immediately, inline the two `setTimeout` calls, and check `this.isScreensaverActive()` within them to restore the pending object if interrupted.

### Tests

#### [MODIFY] [offlineReturnSystem.test.js](file:///Users/huihui/Documents/qijiu-desktop-pet/test/offlineReturnSystem.test.js)
- Delete `test('handleScreensaverStart resets shown flags...')`.
- Delete `test('handleOfflineReturn keeps the sequence pending while in flight...')` (as pending is now consumed synchronously).
- Adjust `test('handleOfflineReturn re-buffers when the screensaver becomes active...')` to expect the synchronous consumption and re-buffering behavior instead of `shown` tracking.

## Verification Plan

### Automated Tests
- Run `npm test -- test/offlineReturnSystem.test.js` to ensure the simplified logic passes the core buffering and re-buffering scenarios.
- Run `npm test` across the suite to ensure `app.js` and `ScreensaverSystem.js` changes do not break integrations.

### Manual Verification
- N/A - The automated tests will verify the sequence buffering behavior accurately since the time system and visibility APIs are heavily mocked.

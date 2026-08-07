# Simplify Screensaver Return Bubble Logic

This plan records the implemented simplification of the screensaver return bubble buffering logic. It removes the `shown` lifecycle state while retaining the shared scheduler and a small sequence identifier that makes stale callbacks harmless.

## Implementation Notes

> [!NOTE]
> `handleScreensaverStart` and `onScreensaverStart` are removed. `scheduleReturnBubbles()` keeps the pending sequence until both callbacks succeed, and an increasing sequence ID invalidates callbacks from an interrupted sequence without restoring the removed lifecycle hooks.

## Implemented Changes

### Core Logic

#### [MODIFY] [app.js](../../src/app.js)
- Remove `onScreensaverStart: () => offlineReturnSystem.handleScreensaverStart()` hook entirely.

#### [MODIFY] [ScreensaverSystem.js](../../src/systems/ScreensaverSystem.js)
- Remove `this.onScreensaverStart` property and its invocation in `onStart()`.

#### [MODIFY] [OfflineReturnSystem.js](../../src/systems/OfflineReturnSystem.js)
- Remove `RETURN_BUBBLE_SEQUENCE_MS` constant.
- Simplify `pendingReturnBubble` to just store the raw pet references and strings, omitting `shown` tracking.
- Retain `scheduleReturnBubbles()` as the shared 1.5s/3s scheduler and delete `handleScreensaverStart`.
- Add `returnBubbleSequenceId`: `flushPendingReturnBubble()` and an interrupted callback advance it so callbacks from the replaced sequence do nothing; only the current sequence clears `pendingReturnBubble` after both callbacks succeed.

### Tests

#### [MODIFY] [offlineReturnSystem.test.js](../../test/offlineReturnSystem.test.js)
- Delete `test('handleScreensaverStart resets shown flags...')`.
- Keep the in-flight pending test: the pending object is released only after both current callbacks succeed.
- Cover a short screensaver interruption: after flush schedules the replacement sequence, the old second callback must not show a duplicate bubble.

## Verification Plan

### Automated Tests
- Run `npm test -- test/offlineReturnSystem.test.js` to ensure the simplified logic passes the core buffering and re-buffering scenarios.
- Run `npm test` across the suite to ensure `app.js` and `ScreensaverSystem.js` changes do not break integrations.

### Manual Verification
- Optional: trigger a return sequence, briefly start and stop the screensaver before the second bubble, and confirm only one ordered pair is shown after the exit animation.

DeskPet: YueQi & ShenJiu Desktop Pet

This is a desktop pet app themed around The Scum Villain's Self-Saving System.
Yue Qingyuan (Yue Qi) and Shen Qingqiu (Shen Jiu) can walk, rest, cultivate, and occasionally interact on your desktop.

========================================
📦 Download & Installation
========================================

This app supports both Windows and macOS:
- Windows: Download the `.exe` installer and run it.
- macOS:
  - System Requirements: macOS 12.0 (Monterey) or higher.
  - Architecture:
    - Apple Silicon (M1/M2/M3, etc.): Download `*-arm64.dmg`.
    - Intel: Download `*-x64.dmg`.
  - Installation: Double-click the `.dmg` file, drag the "七九爱宠" (DeskPet) icon to your Applications folder.
  - Manual update:
    - Quit the current app from the tray menu first.
    - Open the new `.dmg`, drag "七九爱宠" into Applications, and choose to replace the old version.
    - If macOS blocks the updated app on first launch, allow it again in Privacy & Security or rerun `xattr -cr /Applications/七九爱宠.app`.
  - Bypass "Unidentified Developer / Damaged" Warning (Note: As an independent developer distributing this program on a small scale, I cannot afford Apple's annual $99 developer certificate fee, so users need to manually bypass security settings. Please rest assured that this program is open-source and contains absolutely no malicious code):
    - Method 1: Go to "System Settings -> Privacy & Security", scroll down to find the blocked "七九爱宠", click "Open Anyway", and enter your password.
    - Method 2: Open Terminal and run: `xattr -cr /Applications/七九爱宠.app`

========================================
🚀 Basic Controls
========================================

After launch, both characters will appear on your desktop.

- Drag a character: hold the left mouse button and drag them to your preferred position.
- Open a character menu: right-click a character to use actions such as "🍎 Feed", "💤 Rest", "🧘🏻‍♂️ Cultivate", "🤚 QiGe Spoils", or "🤚 XiaoJiu Clings".
- Open the tray menu: right-click the green tray icon in the lower-right system tray for more settings.

The tray menu lets you:
- "📊 Show Status Panel"
- "🧘🏻‍♂️ Cang Qiong Seclusion" / "🧘🏻‍♂️ In Seclusion N min" / "🧘🏻‍♂️ Seclusion Complete": open the Pomodoro countdown window; the tray label reflects the current seclusion state.
- "🎨 Choose Skin…": opens the visual skin selector gallery window where you can browse and switch built-in skins (Default Skin, Cute Birds, Cat & Bunny, and School AU). Each card cleanly separates the skin preview image, name, and artist credit onto different lines. Click any card to instantly preview the skin on your desktop pets, click "Confirm" to apply, or click "Cancel" / press ESC / click outside the window to close and restore the original skin.
- "⏸️ Pause Walking" or "🚶 Resume Walking"
- "👻 Hide Pets" or "👻 Show Pets"
- "🔄 Reset Position"
- "🖥️ Switch Screen": move pets between displays (macOS multi-display only)
- "⏰ Enable Break Reminder" or "⏰ Disable Break Reminder"
- "⏰ Reminder Interval": choose 30, 45, 60, 90, or 120 minutes
- "🌤️ Enable Weather Sync" or "🌤️ Disable Weather Sync"
- "🌤️ Set City"
- "🪟 Enable Realm Awareness" or "🪟 Disable Realm Awareness"
- "🌐 Language": choose "中文", "English", or "日本語"
- "🚀 Launch at Login" or "🚀 Disable Auto-launch"
- "📦 Check for Updates": packaged Windows builds show download progress and support automatic upgrade; macOS guides you to download and replace the DMG manually.
- "🛠️ Developer Tools": shown only in development mode.
- "❌ Quit"
- "🏷️ Version": shows the current app version at the bottom of the tray menu.

If you use multiple monitors, you can drag characters or the status panel to a secondary display.
When you switch language from the tray menu, the main window, right-click menus, status panel, and update prompts refresh together.

========================================
🎨 Skins & Display
========================================

The app currently includes four built-in skins:
- Default Skin - (Artist) Hamster Salad
- Cute Birds - (Artist) Hamster Salad
- Cat & Bunny - (Artist) Violetfirefly
- School AU - (Artist) M_Shang

Visual Skin Gallery:
Clicking "🎨 Choose Skin…" in the tray menu opens a dedicated visual skin gallery window. Each skin card displays the exclusive preview image (kiss sprite), skin name, and artist signature ("🎨 Artist") across separate lines.
- Live Preview: Clicking any card instantly updates the desktop characters so you can preview the skin in real time.
- Confirm & Cancel: When you are satisfied with the preview, click "Confirm" to officially save and apply the skin. Clicking "Cancel", pressing ESC, or clicking outside the window (blur) automatically closes the gallery and restores your original skin.

Skin Actions & Fallback:
Skins replace standing, walking, hungry, sleeping, feeding, cultivating, care, kiss, hug, and share-food visuals together.
If one action asset is missing from a skin, the app tries to fall back to the default asset so switching skins does not leave a blank sprite.

When pets move between displays with different scale factors, the character sprites, right-click menu, and Qi effects scale with the current display to keep their visual size consistent.

========================================
📦 Updates
========================================

- Windows packaged builds: use "📦 Check for Updates" from the tray menu to check GitHub Releases. When a new version is available, a progress window is shown during download, and you can restart to install after it finishes.
- macOS: because the app is not currently signed with an Apple Developer ID certificate, update checks show the current and latest version, then guide you to open Releases, download the new DMG, and replace the app manually.
- Development mode: update checks are not supported under `npm run dev`; use a packaged build to verify the update flow.

========================================
🪟 Realm Awareness
========================================

When Realm Awareness is enabled, the pets can sense the edge of the current active window, the Windows taskbar, or the macOS Dock.
During idle walking, they may stroll to the top edge of the active window, the area above the taskbar, or the area above the Dock, making them feel more connected to your desktop.

You can toggle this from the tray menu with "🪟 Enable Realm Awareness" or "🪟 Disable Realm Awareness".
If the current system does not support it, the tray menu shows "🪟 Realm Awareness Unavailable".

========================================
🌤️ Weather Awareness & Time Sync
========================================

Pets automatically transition through morning, day, dusk, and night based on your local time.
During late night (00:00 - 04:59), they become quieter, more prone to sleeping, move less, and may refuse interactions.

If you want them to sense real-world weather, choose "🌤️ Enable Weather Sync" from the tray menu and use "🌤️ Set City".
When it rains, snows, gets windy, thunders, or becomes hot (≥35°C), lightweight local particle or glow effects appear near the pets. Thunderstorms render rain with brief lightning flashes, windy weather adds slanted airflow wisps, and hot weather creates pulsing heatwave glows with rising shimmering heat particles at the characters' feet. Characters may also trigger weather-specific dialogue.
If weather sync is disabled or offline, time-based atmosphere changes still apply.

========================================
🧘🏻‍♂️ Cang Qiong Seclusion
========================================

Cang Qiong Seclusion is the lightweight Pomodoro feature.
Open it from the tray menu with "🧘🏻‍♂️ Cang Qiong Seclusion"; while running, the tray menu shows "🧘🏻‍♂️ In Seclusion N min", and after completion it shows "🧘🏻‍♂️ Seclusion Complete".

Enter the focus duration in minutes. The input defaults to the last duration you used; the first run or invalid input falls back to 25 minutes.
After you start, Yue Qi and Shen Jiu leave the desktop and appear inside the countdown window as two still pets, alongside the timer and progress bar.
The Pomodoro window is pinned on top by default. Use "Unpin" or "Pin on top" in the window header to toggle it.
When the session completes, the window shows a gentle encouragement message. If you exit early or close the window, the pets return to their previous visibility and walking state.

========================================
📹 Meeting Auto-Hide
========================================

Meeting Auto-Hide automatically hides the pets when meeting activity is detected, so they do not cover a meeting window, appear in screen sharing, or distract from a call.

- The current MVP is mainly calibrated against Windows Teams.
- After the meeting ends, pets usually reappear within about 15 seconds.
- If you manually hid the pets before the meeting, they will not be shown automatically afterward.
- If you manually show the pets while they were hidden by meeting detection, that clears the current auto-hide state.
- The detector only uses meeting app process names and UDP endpoint counts. It does not read meeting titles, window titles, browser URLs, audio/video content, or screen contents.

========================================
⏰ Break Reminder
========================================

When Break Reminder is enabled, the app reminds you to stand up and move around after a continuous active period.
When it triggers, Yue Qi and Shen Jiu move near the center of the screen and show break reminder dialogue. You can click a character to dismiss it, or wait about 20 seconds for it to disappear automatically.

You can toggle it from the tray menu with "⏰ Enable Break Reminder" or "⏰ Disable Break Reminder", and use "⏰ Reminder Interval" to choose 30, 45, 60, 90, or 120 minutes.
Locking the screen, suspending the computer, or stepping away long enough resets the timer. If pets are hidden, the reminder will not pop up and the next interval starts fresh.

========================================
📊 Cultivation Status
========================================

The status panel shows four main stats: Affection, Satiety, Qi, and Mood.
These stats change slowly over time: natural consumption is calculated every 5 minutes.
Even if you close the app, some consumption will be calculated from offline time the next time you open it.

1. ❤️ Affection

Affection represents the bond between the two characters.
Natural consumption:
- Decreases by 1 every 2 hours.

Ways to increase it:
- Right-click Shen Jiu and choose "🤚 QiGe Spoils".
- Right-click Yue Qi and choose "🤚 XiaoJiu Clings".
- It may also increase when the two walk close enough to trigger an interaction.

Higher affection unlocks closer interactions:
- Above 20: they may cultivate together.
- Above 50: they may hug.
- Above 70: they may kiss.

2. 🍖 Satiety

Satiety shows whether a character is hungry.
When satiety is too low, the character becomes low-energy and Mood drops faster.

Natural consumption:
- Decreases by 2 every 5 minutes.

How to restore:
- Right-click a character and choose "🍎 Feed" to restore 25 Satiety.

Notes:
- Choosing "💤 Rest" consumes 10 Satiety.
- Below 30 Satiety, the character enters a hungry state and Mood drops faster.
- Below 25 Satiety, an orange warning glow appears around the character.

Small hidden interaction:
When the two are close and trigger "Share Food", Yue Qi may give his food to Shen Jiu.
Yue Qi loses 5 Satiety, and Shen Jiu restores 10 Satiety.
Share Food only triggers when Yue Qi has at least 5 Satiety, so he will not keep feeding Shen Jiu after his Satiety has bottomed out.
If they spend a lot of time together, Yue Qi may get hungry faster.

Cultivation benefit:
When they trigger "Cultivate Together", Yue Qi also restores 15 Satiety. The existing Qi and Affection rewards for both characters are unchanged.

3. 🧘🏻‍♂️ Qi

Qi represents a character's energy.
When Qi is too low, Mood becomes easier to lose.

Natural consumption:
- Decreases by 2 every 5 minutes.

How to restore:
- Right-click a character and choose "🧘🏻‍♂️ Cultivate": they meditate for 30 seconds and restore 1 Qi per second.
- Right-click a character and choose "💤 Rest": restores 10 Qi and 15 Mood, and consumes 10 Satiety.
- When the two interact, they may cultivate together and restore Qi at 1.5x the single-character meditation amount.

Note:
- Below 20 Qi, Mood drops faster.

4. ✨ Mood

Mood represents a character's emotional and mental state.
Being too hungry or too tired affects Mood.

Natural consumption:
- Decreases by 2 every 5 minutes.

Extra consumption:
- Mood drops faster when Satiety is below 30 or Qi is below 20.

Ways to improve it:
- "🍎 Feed"
- "🤚 QiGe Spoils" or "🤚 XiaoJiu Clings"
- Let the two characters interact naturally.

========================================
🎨 Visual Hints
========================================

You can also judge their status visually without keeping the status panel open:

- Green glow: cultivating, Qi will recover.
- Orange glow: Satiety is below 25, feed them soon.
- Semi-transparent body: Mood is below 25, they need company, food, or care.

========================================
💡 Tips
========================================

1. Remember to use "🍎 Feed": being too hungry affects Rest and Mood.
2. Try dragging them closer: interactions are easier within 180 pixels.
3. Interactions have a 1-minute cooldown: they will not trigger again immediately.
4. Interaction poses separate automatically: even if you drag them onto the same spot, the app nudges them apart when an interaction starts so kiss, hug, greet, and other animations do not overlap badly.
5. No manual save is needed: the app automatically saves character stats and positions.
6. If you cannot find them, use "🔄 Reset Position" in the tray menu.

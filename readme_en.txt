GoodOmensDeskPet: Good Omens (Crowley & Aziraphale) Desktop Pet 🕶️🪽

This is a desktop pet app themed around Good Omens.
Anthony J. Crowley and Aziraphale can walk, rest, tend plants, read antiquarian books, and occasionally interact on your desktop.

========================================
📦 Download & Installation
========================================

This app supports both Windows and macOS:
- Windows:
  - System Requirements: Windows 10 / 11 (64-bit). Legacy versions like Windows 7 / 8 / 8.1 and all 32-bit operating systems are not supported due to modern Electron architecture.
  - Installation: Download the `.exe` installer and run it.
- macOS:
  - System Requirements: macOS 12.0 (Monterey) or higher.
  - Architecture:
    - Apple Silicon (M1/M2/M3, etc.): Download `*-arm64.dmg`.
    - Intel: Download `*-x64.dmg`.
  - Installation: Double-click the `.dmg` file, drag the "GoodOmensDeskPet" icon to your Applications folder.
  - Manual update:
    - Quit the current app from the tray menu first.
    - Open the new `.dmg`, drag "GoodOmensDeskPet" into Applications, and choose to replace the old version.
    - If macOS blocks the updated app on first launch, allow it again in Privacy & Security or rerun `xattr -cr /Applications/GoodOmensDeskPet.app`.
  - Bypass "Unidentified Developer / Damaged" Warning (Note: As an independent developer distributing this program on a small scale, I cannot afford Apple's annual $99 developer certificate fee, so users need to manually bypass security settings. Please rest assured that this program is open-source and contains absolutely no malicious code):
    - Method 1: Go to "System Settings -> Privacy & Security", scroll down to find the blocked "GoodOmensDeskPet", click "Open Anyway", and enter your password.
    - Method 2: Open Terminal and run: `xattr -cr /Applications/GoodOmensDeskPet.app`

========================================
🚀 Basic Controls
========================================

After launch, both characters will appear on your desktop.

- Drag a character: hold the left mouse button and drag them to your preferred position.
- Open a character menu: right-click a character to use actions such as "🥐 Treat", "💤 Nap", "🪴 Tending Plants" (Crowley) / "📖 Reading" (Aziraphale), "🤚 Angel's Care" (right-click Crowley) / "🤚 Demon's Favor" (right-click Aziraphale).
- Open the tray menu: right-click the green tray icon in the lower-right system tray for more settings.

The tray menu lets you:
- **📊 Show Status Panel**
- **📏 Resize Pet…**: resize both pets together with a live preview; confirm to save.
- **📖 Bookshop Study / 📖 Studying N min / 📖 Study Complete**: open the Pomodoro countdown window; the tray label reflects the current study state.
- **🎨 Choose Skin…**: opens the visual skin selector gallery window where you can browse and switch built-in skins (currently built-in: Default Outfit - (Artist) Nano Banana). Each card cleanly separates the skin preview image, name, and artist credit onto different lines. Click a card to preview without saving, then click "Confirm" to save. Click "Cancel", press ESC, or close the window to restore the original skin. Switching to another window keeps the preview.
- **⏸️ Pause Walking** or **🚶🏻‍♂️ Resume Walking**
- **👻 Hide Pets** or **👻 Show Pets**: temporarily hide all pets (the screensaver and break reminders will also be disabled while hidden).
- **🔄 Reset Position**
- **🖥️ Switch Screen**: move pets between displays (macOS multi-display only)
- **⏰ Enable Break Reminder** or **⏰ Disable Break Reminder**
- **⏰ Reminder Interval**: choose 30, 45, 60, 90, or 120 minutes (selectable only when break reminder is enabled; disabled when off)
- **💕 Enable Sweet Screensaver** or **💕 Disable Sweet Screensaver**
- **💕 Screensaver Wait Time**: choose 1, 3, 5, 10, 15, or 30 min (default: 3 min; selectable only when screensaver is enabled; disabled when off)
- **🌤️ Enable Weather Sync** or **🌤️ Disable Weather Sync**
- **🌤️ Set City**
- **🪟 Enable Window Sensing** or **🪟 Disable Window Sensing**: shows "🪟 Window Sensing Unavailable" if unsupported.
- **🌐 Language**: choose "中文", "English", or "日本語"
- **🚀 Launch at Login** or **🚀 Disable Auto-launch**
- **📦 Check for Updates**: packaged Windows builds show download progress and support automatic upgrade; macOS guides you to download and replace the DMG manually.
- **🛠️ Developer Tools**: shown only in development mode.
- **❌ Quit**
- **🏷️ Version**: shows the current app version at the bottom of the tray menu.

If you use multiple monitors, you can drag characters or the status panel to a secondary display.
When you switch language from the tray menu, the main window, right-click menus, status panel, and update prompts refresh together.

========================================
💕 CP Sweet Screensaver
========================================

After the system has been idle longer than the configured wait time, the screensaver starts:
- Crowley and Aziraphale play a CP combo at the center of the screen: share food -> hug -> kiss.
- The combo loops until input is detected or it is silently canceled by a lock, fullscreen app, or similar interruption.
- When they detect that you are back, the two pets hurriedly cover up their secret rendezvous (Crowley pretends he is carrying out corrupting demon work, while Aziraphale nervously hides his pastry, claiming it was just standard faction diplomacy), before running back to their spots.

In the tray menu, you can:
- Toggle the screensaver with "💕 Enable Sweet Screensaver" / "💕 Disable Sweet Screensaver".
- Choose 1 / 3 / 5 / 10 / 15 / 30 min under "💕 Screensaver Wait Time" (default: 3 min).

Note:
This app does NOT block or modify Windows screen-off / sleep timing.
To see the animation, make sure the Windows "turn off screen" and "sleep" timers are set later than the selected CP wait time.
Windows 11 defaults to about 5 minutes when plugged in; if you want a wait of 5 minutes or longer, lengthen the screen-off / sleep timers in the system power settings.

========================================
🎨 Skins & Display
========================================

The app currently includes one built-in skin:
- Default Outfit - (Artist) Nano Banana

Visual Skin Gallery:
Clicking "🎨 Choose Skin…" in the tray menu opens a dedicated visual skin gallery window. Each skin card displays the exclusive preview image (kiss sprite), skin name, and artist signature ("🎨 Artist") across separate lines.
- Live Preview: Clicking any card instantly updates the desktop characters so you can preview the skin in real time.
- Confirm & Cancel: Previews do not change your saved skin. When you are satisfied, click "Confirm" to save. Clicking "Cancel", pressing ESC, or closing the window restores your original skin. Switching to another window or minimizing keeps the preview; open the gallery again from the tray to continue choosing.

Skin Actions & Fallback:
Skins replace standing, walking, hungry, sleeping, feeding, tending plants / reading, care / favor, kiss, hug, and share-food visuals together.
Missing optional action assets use default assets where possible. If a required standing image or walking frame fails to load during a switch, the app restores the last successfully loaded skin. "Confirm" then shows an error and refuses to save; you can choose another skin or cancel.

When pets move between displays with different scale factors, the character sprites, right-click menu, and miracle effects scale with the current display to keep their visual size consistent.

Pet Size:
Open "📏 Resize Pet…" from the tray and drag the slider to preview both pets at 50%–150% size, in 5% steps (default: 100%). Interaction scenes, miracle auras, the local screensaver scene, and weather effects scale with them.
Click "Confirm" to save. "Cancel", Esc, or closing the window restores the previous size. "Reset" previews 100%; confirm to save it. Switching to another window or minimizing keeps the preview.

Bookshop Typography:
Character menus, the status panel, and settings windows feature warm parchment and antique gold styling inspired by A.Z. Fell & Co. Antiquarian Booksellers, with crisp native typography across Chinese, English, and Japanese.

========================================
📦 Updates
========================================

- Windows packaged builds: use "📦 Check for Updates" from the tray menu to check GitHub Releases. When a new version is available, a progress window is shown during download, and you can restart to install after it finishes.
- macOS: because the app is not currently signed with an Apple Developer ID certificate, update checks show the current and latest version, then guide you to open Releases, download the new DMG, and replace the app manually.
- Development mode: update checks are not supported under `npm run dev`; use a packaged build to verify the update flow.

========================================
🪟 Window Sensing
========================================

When Window Sensing is enabled, the pets can sense the edge of the current active window, the Windows taskbar, or the macOS Dock.
During idle walking, they may stroll to the top edge of the active window, the area above the taskbar, or the area above the Dock, making them feel more connected to your desktop.

You can toggle this from the tray menu with "🪟 Enable Window Sensing" or "🪟 Disable Window Sensing".
If the current system does not support it, the tray menu shows "🪟 Window Sensing Unavailable".

========================================
🌤️ Weather Awareness & Time Sync
========================================

Pets will automatically transition into morning, daytime, evening, or late night based on your local time.
During late night (00:00 - 04:59), they become quieter, more prone to sleeping, move less, and may refuse interactions. In this sleepy state, they may occasionally talk in their sleep, and if both pets are on screen with high affection, they might trigger a sweet linked dream dialogue.

If you want them to sense real-world weather, choose "🌤️ Enable Weather Sync" from the tray menu and use "🌤️ Set City".
When it rains, snows, gets windy, thunders, or becomes hot (≥35°C), lightweight local particle or glow effects appear near the pets. Thunderstorms render rain with brief lightning flashes, windy weather adds slanted airflow wisps, and hot weather creates pulsing heatwave glows with rising shimmering heat particles at the characters' feet. Characters may also trigger weather-specific dialogue.
If weather sync is disabled or offline, time-based atmosphere changes still apply.

========================================
📖 Bookshop Study
========================================

Bookshop Study is the lightweight Pomodoro feature.
Open it from the tray menu with "📖 Bookshop Study"; while running, the tray menu shows "📖 Studying N min", and after completion it shows "📖 Study Complete".

Enter the focus duration in minutes. The input defaults to the last duration you used; the first run or invalid input falls back to 25 minutes.
After you start, Crowley and Aziraphale enter the countdown window, which displays the timer, progress bar, and a joint miracle illustration. Concentric rings with an angelic golden starburst gently pulse at the center of the dial.
The Pomodoro window is pinned on top by default. Use "Unpin" or "Pin on top" in the window header to toggle it.
When the countdown ends, a resonant bookshop wind-chime and bell chime plays as a double-circle angelic seal expands with ripples, followed by a kissing illustration and an encouraging message. The dial and completion animations are simplified when your system's reduced-motion setting is enabled.
The window supports "Begin Study", "End Early", and "Done" actions. Click "Done", stop early, or close the window to return the pets to their previous visibility and walking state.

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
When it triggers, Crowley and Aziraphale move near the center of the screen and show break reminder dialogue. You can click a character to dismiss it, or wait about 20 seconds for it to disappear automatically.

You can toggle it from the tray menu with "⏰ Enable Break Reminder" or "⏰ Disable Break Reminder", and use "⏰ Reminder Interval" to choose 30, 45, 60, 90, or 120 minutes.
Locking the screen, suspending the computer, or stepping away long enough resets the timer. If pets are hidden, the reminder will not pop up and the next interval starts fresh.

========================================
📊 Pet Status
========================================

The status panel shows four main stats: ❤️ Bond, 🍖 Satiety, ✨ Miracle, and ☕ Mood.
These stats change slowly over time: natural consumption is calculated every 5 minutes.
Even if you close the app, some consumption will be calculated from offline time the next time you open it.

1. ❤️ Bond

Bond represents the connection between the two characters.
Natural consumption:
- Decreases by 1 every 2 hours.

Ways to increase it:
- Right-click Crowley and choose "🤚 Angel's Care".
- Right-click Aziraphale and choose "🤚 Demon's Favor".
- It may also increase when the two walk close enough to trigger an interaction.

Higher bond unlocks closer interactions:
- Average Bond of both pets reaches 20: they may perform a miracle together.
- Average Bond of both pets reaches 50: they may hug.
- Average Bond of both pets reaches 75: they may kiss.

2. 🍖 Satiety

Satiety shows whether a character is hungry.
When satiety is too low, the character becomes low-energy and Mood drops faster.

Natural consumption:
- Decreases by 2 every 5 minutes.

How to restore:
- Right-click a character and choose "🥐 Treat" to restore 25 Satiety.

Notes:
- Choosing "💤 Nap" consumes 10 Satiety, and restores 15 Mood and 10 Miracle.
- Below 30 Satiety, the character enters a hungry state and Mood drops faster.
- Below 25 Satiety, an orange warning glow appears around the character.

Small hidden interaction:
When the two are close and trigger "Share Food", Crowley may share treats with Aziraphale.
Crowley loses 5 Satiety, and Aziraphale restores 10 Satiety.
Share Food only triggers when Crowley has at least 5 Satiety, so he will not keep feeding Aziraphale after his Satiety has bottomed out.
If they spend a lot of time together, Crowley may get hungry faster.

Miracle benefit:
When they trigger "Miracle Together", Crowley also restores 15 Satiety. The existing Miracle and Bond rewards for both characters are unchanged.

3. ✨ Miracle

Miracle represents a character's energy and miracle power.
When Miracle is too low, Mood becomes easier to lose.

Natural consumption:
- Decreases by 2 every 5 minutes.

How to restore:
- Right-click Crowley and choose "🪴 Tending Plants", or right-click Aziraphale and choose "📖 Reading": they focus for 30 seconds and restore 1 Miracle per second.
- Right-click a character and choose "💤 Nap": restores 10 Miracle and 15 Mood, and consumes 10 Satiety.
- When the two interact, they may perform a miracle together and restore Miracle at 1.5x the single-character amount.

Why tending plants or reading restores Miracle:
- 🪴 Crowley (Demon) · Tending Plants:
  In Good Omens lore, Crowley terrorizes his houseplants with a spray bottle ("GROW BETTER!"), leaving them the greenest and most terrified in London. This is the demon's signature decompression ritual. Venting frustration and asserting evil authority calms his turbulent demonic energy, refocusing his mind to rapidly gather miracle power.
- 📖 Aziraphale (Angel) · Reading:
  Aziraphale runs an antiquarian bookshop in Soho (A.Z. Fell and Co.) and treasures centuries of human literature. Sitting in his armchair with spectacles, sipping tea while absorbed in rare first editions, grants him absolute peace and detachment from worldly noise. This pure, tranquil focus harmonizes with heavenly grace to restore divine miracle energy.

Note:
- Below 20 Miracle, Mood drops faster.

4. ☕ Mood

Mood represents a character's emotional and mental state.
Being too hungry or too tired affects Mood.

Natural consumption:
- Decreases by 2 every 5 minutes.

Extra consumption:
- Mood drops faster when Satiety is below 30 or Miracle is below 20.

Ways to improve it:
- "🥐 Treat"
- "🤚 Angel's Care" or "🤚 Demon's Favor"
- Let the two characters interact naturally.

========================================
🎨 Visual Hints
========================================

You can also judge their status visually without keeping the status panel open:

- Golden / green glow: tending plants or reading, Miracle will recover.
- Orange glow: Satiety is below 25, feed them soon.
- Semi-transparent body: Mood is below 25, they need company, food, or care.

========================================
💡 Tips
========================================

1. Remember to offer "🥐 Treat": being too hungry affects Nap and Mood.
2. Try dragging them closer: interactions are easier within 180 pixels.
3. Interactions have a 1-minute cooldown: they will not trigger again immediately.
4. Interaction poses separate automatically: even if you drag them onto the same spot, the app nudges them apart when an interaction starts so kiss, hug, greet, and other animations do not overlap badly.
5. No manual save is needed: the app automatically saves character stats and positions.
6. If you cannot find them, use "🔄 Reset Position" in the tray menu.

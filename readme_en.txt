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
  - Bypass "Unidentified Developer / Damaged" Warning:
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
- "🎨 Switch Skin"
- "⏸️ Pause Walking" or "🚶 Resume Walking"
- "👻 Hide Pets" or "👻 Show Pets"
- "🔄 Reset Position"
- "📺 Switch Screen": move pets between displays (macOS multi-display only)
- "🚀 Launch at Login" or "🚀 Disable Auto-launch"
- "🪟 Enable Realm Awareness" or "🪟 Disable Realm Awareness"
- "⏰ Enable Break Reminder" or "⏰ Disable Break Reminder", plus "⏰ Reminder Interval"
- "🌐 Language": choose "中文", "English", or "日本語"
- "📦 Check for Updates"
- "❌ Quit"

If you use multiple monitors, you can drag characters or the status panel to a secondary display.
When you switch language from the tray menu, the main window, right-click menus, status panel, and update prompts refresh together.

========================================
🪟 Realm Awareness
========================================

When Realm Awareness is enabled, the pets can sense the edge of the current active window, the Windows taskbar, or the macOS Dock.
During idle walking, they may stroll to the top edge of the active window, the area above the taskbar, or the area above the Dock, making them feel more connected to your desktop.

You can toggle this from the tray menu with "🪟 Enable Realm Awareness" or "🪟 Disable Realm Awareness".
If the current system does not support it, the tray menu shows "🪟 Realm Awareness Unavailable".

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
4. No manual save is needed: the app automatically saves character stats and positions.
5. If you cannot find them, use "🔄 Reset Position" in the tray menu.

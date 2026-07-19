/**
 * src/main/windows/WindowManager.js
 * 负责集中管理应用内所有的 BrowserWindow 实例
 */
class WindowManager {
  constructor() {
    this.windows = {
      main: null,
      status: null,
      skinSelector: null,
      pomodoro: null,
      citySetting: null,
      updateProgress: null
    };
  }

  // --- Getters & Setters ---

  get mainWindow() { return this.windows.main; }
  set mainWindow(val) { this.windows.main = val; }

  get statusWindow() { return this.windows.status; }
  set statusWindow(val) { this.windows.status = val; }

  get skinSelectorWindow() { return this.windows.skinSelector; }
  set skinSelectorWindow(val) { this.windows.skinSelector = val; }

  get pomodoroWindow() { return this.windows.pomodoro; }
  set pomodoroWindow(val) { this.windows.pomodoro = val; }

  get citySettingWindow() { return this.windows.citySetting; }
  set citySettingWindow(val) { this.windows.citySetting = val; }

  get updateProgressWindow() { return this.windows.updateProgress; }
  set updateProgressWindow(val) { this.windows.updateProgress = val; }

  // --- Utility Methods ---

  hasWindow(name) {
    return !!this.windows[name] && !this.windows[name].isDestroyed();
  }

  getAllWindows() {
    return Object.values(this.windows).filter(w => w && !w.isDestroyed());
  }
}

module.exports = new WindowManager();

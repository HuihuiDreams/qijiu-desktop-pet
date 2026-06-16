const { normalizePomodoroMinutes } = require('../../ipcContracts');

class PomodoroSystem {
  constructor(options = {}) {
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.session = null;
  }

  start(durationMinutes, now = this.now()) {
    const normalizedMinutes = normalizePomodoroMinutes(durationMinutes);
    const durationMs = normalizedMinutes * 60 * 1000;
    const startedAt = Number(now);

    this.session = {
      status: 'running',
      durationMinutes: normalizedMinutes,
      durationMs,
      startedAt,
      endAt: startedAt + durationMs,
      completedAt: null,
    };

    return this.getSnapshot(startedAt);
  }

  stop() {
    this.session = null;
    return this.getSnapshot();
  }

  getSnapshot(now = this.now()) {
    if (!this.session) {
      return {
        status: 'idle',
        durationMinutes: 0,
        durationMs: 0,
        startedAt: null,
        endAt: null,
        completedAt: null,
        remainingMs: 0,
        progress: 0,
      };
    }

    const currentTime = Number(now);
    const remainingMs = Math.max(0, this.session.endAt - currentTime);
    const progress = this.session.durationMs > 0
      ? Math.min(1, Math.max(0, (this.session.durationMs - remainingMs) / this.session.durationMs))
      : 0;

    if (remainingMs <= 0 && this.session.status !== 'completed') {
      this.session.status = 'completed';
      this.session.completedAt = currentTime;
    }

    return {
      ...this.session,
      remainingMs,
      progress,
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { PomodoroSystem };
}

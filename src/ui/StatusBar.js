/**
 * StatusBar shows pet stats in a dedicated Electron window.
 *
 * Keeping this panel as a real window lets the OS move it across displays,
 * instead of trying to drag a DOM overlay inside the transparent pet window.
 */
class StatusBar {
  constructor() {
    this.visible = false;
    this._lastSnapshotJson = null;

    window.electronAPI.onStatusWindowClosed(() => {
      this.visible = false;
      this._lastSnapshotJson = null;
    });
  }

  createSnapshot(petA, petB) {
    return {
      pets: [petA, petB].map((pet) => ({
        id: pet.id,
        name: pet.name,
        nickname: pet.nickname,
        emoji: pet.emoji,
        image: pet.image,
        stats: {
          affection: Math.round(pet.stats.affection),
          hunger: Math.round(pet.stats.hunger),
          qi: Math.round(pet.stats.qi),
          mood: Math.round(pet.stats.mood),
        },
      })),
    };
  }

  show(petA, petB) {
    this.visible = true;
    const snapshot = this.createSnapshot(petA, petB);
    this._lastSnapshotJson = JSON.stringify(snapshot);
    window.electronAPI.showStatusWindow(snapshot);
  }

  hide() {
    this.visible = false;
    this._lastSnapshotJson = null;
    window.electronAPI.hideStatusWindow();
  }

  toggle(petA, petB) {
    if (this.visible) {
      this.hide();
    } else {
      this.show(petA, petB);
    }
  }

  update(petA, petB) {
    if (!this.visible) return;
    const snapshot = this.createSnapshot(petA, petB);
    const json = JSON.stringify(snapshot);
    if (json === this._lastSnapshotJson) {
      return;
    }
    this._lastSnapshotJson = json;
    window.electronAPI.updateStatusWindow(snapshot);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { StatusBar };
}

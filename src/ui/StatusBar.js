/**
 * StatusBar shows pet stats in a dedicated Electron window.
 *
 * Keeping this panel as a real window lets the OS move it across displays,
 * instead of trying to drag a DOM overlay inside the transparent pet window.
 */
class StatusBar {
  constructor() {
    this.visible = false;

    window.electronAPI.onStatusWindowClosed(() => {
      this.visible = false;
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
    window.electronAPI.showStatusWindow(this.createSnapshot(petA, petB));
  }

  hide() {
    this.visible = false;
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
    window.electronAPI.updateStatusWindow(this.createSnapshot(petA, petB));
  }
}

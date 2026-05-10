/**
 * TimeSystem — 时间系统，管理状态的保存/加载以及离线时间带来的属性衰减计算。
 */
class TimeSystem {
  constructor() {
    this.lastSaveTime = Date.now();
    this.saveInterval = 60000; // 每 60 秒自动保存一次
    this.saveAccumulator = 0;
  }

  /**
   * 更新循环 — 定期执行自动保存。
   */
  update(deltaMs) {
    this.saveAccumulator += deltaMs;
    if (this.saveAccumulator >= this.saveInterval) {
      // 修复睡眠唤醒 bug: 将 '-=' 改为 '%='。如果遭遇极大的时间跳跃，
      // 取模可以避免 accumulator 残留巨大值，从而防止未来多个帧被连续强制触发存档。
      this.saveAccumulator %= this.saveInterval;
      return true; // 返回 true 表示需要触发保存
    }
    return false;
  }

  /**
   * 序列化宠物状态以便保存。
   */
  serializePet(pet) {
    return {
      id: pet.id,
      x: Math.round(pet.x),
      y: Math.round(pet.y),
      stats: { ...pet.stats },
      timestamp: Date.now()
    };
  }

  /**
   * 从已保存的数据中恢复宠物状态。
   */
  deserializePet(pet, data) {
    if (!data) return;
    pet.x = data.x || pet.x;
    pet.y = data.y || pet.y;
    if (data.stats) {
      pet.stats.affection = data.stats.affection ?? pet.stats.affection;
      pet.stats.hunger = data.stats.hunger ?? pet.stats.hunger;
      pet.stats.qi = data.stats.qi ?? pet.stats.qi;
      pet.stats.mood = data.stats.mood ?? pet.stats.mood;
    }
  }

  /**
   * 计算应用离线了多长时间。
   */
  getOfflineTime(savedTimestamp) {
    if (!savedTimestamp) return 0;
    return Math.max(0, Date.now() - savedTimestamp);
  }

  /**
   * 保存两只宠物的状态。
   */
  async save(petA, petB) {
    const data = {
      petA: this.serializePet(petA),
      petB: this.serializePet(petB),
      savedAt: Date.now()
    };
    await window.electronAPI.saveData('petState', data);
    this.lastSaveTime = Date.now();
  }

  /**
   * 加载保存的状态。返回 { petAData, petBData, offlineMs } 或者 null。
   */
  async load() {
    const data = await window.electronAPI.loadData('petState');
    if (!data) return null;
    return {
      petAData: data.petA,
      petBData: data.petB,
      offlineMs: this.getOfflineTime(data.savedAt)
    };
  }
}

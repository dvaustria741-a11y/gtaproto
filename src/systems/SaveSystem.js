const SAVE_KEY = 'coastline-save-v1';

const defaults = {
  position: { x: 0, y: 1.1, z: 28 },
  money: 2450,
  missionIndex: 0,
  missionProgress: 0,
  timeOfDay: 8.7,
  settings: {
    graphics: 'Medium',
    renderDistance: 'Far',
    worldCulling: 'Balanced',
    traffic: 'Medium',
    pedestrians: 'Medium',
    shadows: 'Low',
    reflections: 'Low',
    weather: 'On',
    dayNight: 'On',
    fpsCounter: 'Off'
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

export class SaveSystem {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return clone(defaults);
      const saved = JSON.parse(raw);
      return {
        ...clone(defaults),
        ...saved,
        position: { ...defaults.position, ...(saved.position || {}) },
        settings: { ...defaults.settings, ...(saved.settings || {}) }
      };
    } catch {
      return clone(defaults);
    }
  }

  save(patch = {}) {
    this.data = {
      ...this.data,
      ...patch,
      settings: { ...this.data.settings, ...(patch.settings || {}) }
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch { /* local storage can be unavailable in private contexts */ }
    return this.data;
  }

  reset() {
    this.data = clone(defaults);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* no-op */ }
    return this.data;
  }
}

export { defaults as defaultSave };

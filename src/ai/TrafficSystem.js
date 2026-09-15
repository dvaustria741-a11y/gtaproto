import { distance2D } from '../utils/math.js';

export class TrafficSystem {
  constructor(vehicleSystem, settings) {
    this.vehicleSystem = vehicleSystem;
    this.settings = settings;
    this.spawned = false;
  }

  applySettings(settings) {
    this.settings = settings;
    if (settings.traffic === 'Low') this.vehicleSystem.vehicles = this.vehicleSystem.vehicles.filter((vehicle) => !vehicle.traffic);
  }

  ensureTraffic() {
    if (this.spawned) return;
    const count = this.settings.traffic === 'High' ? 12 : this.settings.traffic === 'Low' ? 4 : 8;
    this.vehicleSystem.spawnTraffic(count);
    this.spawned = true;
  }

  update(playerPosition) {
    this.ensureTraffic();
    for (const vehicle of this.vehicleSystem.vehicles) {
      if (!vehicle.traffic) continue;
      vehicle.group.visible = distance2D(vehicle.position, playerPosition) < 260;
    }
  }
}

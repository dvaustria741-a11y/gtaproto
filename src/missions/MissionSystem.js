import * as THREE from 'three';
import { distance2D } from '../utils/math.js';

const missions = [
  { name: 'FIRST DRIVE', stages: ['Reach the Nova Sedan', 'Drive to Meridian Plaza', 'First Drive complete'], marker: { x: 13, z: 17 }, destination: { x: 122, z: -92 } },
  { name: 'WATERFRONT RUN', stages: ['Drive to the waterfront', 'Enter the Tideline boat', 'Reach Lantern Key', 'Waterfront Run complete'], marker: { x: 330, z: 70 }, destination: { x: 488, z: 140 } },
  { name: 'NIGHT DELIVERY', stages: ['Collect the night parcel', 'Deliver it through the city', 'Night Delivery complete'], marker: { x: -88, z: -132 }, destination: { x: 92, z: 110 } }
];

export class MissionSystem {
  constructor(scene, saveData, notify) {
    this.scene = scene;
    this.notify = notify;
    this.index = Math.min(saveData.missionIndex || 0, missions.length - 1);
    this.stage = saveData.missionProgress || 0;
    this.marker = this.createMarker();
    scene.add(this.marker);
    this.refreshMarker();
  }

  createMarker() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.55, 28), new THREE.MeshBasicMaterial({ color: 0x73e0ca, transparent: true, opacity: .85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 12, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x73e0ca, transparent: true, opacity: .3 }));
    beam.position.y = 6;
    group.add(ring, beam);
    return group;
  }

  current() { return missions[this.index]; }

  objective() {
    const mission = this.current();
    return `${mission.name}  ·  ${mission.stages[Math.min(this.stage, mission.stages.length - 1)]}`;
  }

  markerPosition() {
    const mission = this.current();
    return this.stage === 1 && mission.destination ? mission.destination : mission.marker;
  }

  refreshMarker() {
    const position = this.markerPosition();
    this.marker.position.set(position.x, .15, position.z);
    this.marker.visible = this.stage < this.current().stages.length - 1;
  }

  update(player, vehicleSystem) {
    const mission = this.current();
    const vehicle = vehicleSystem.activeVehicle;
    const focus = vehicle ? vehicle.position : player.position;
    const target = this.markerPosition();
    if (this.index === 0) {
      if (this.stage === 0 && vehicle && vehicle.type !== 'boat') this.advance('NOVA SEDAN READY');
      else if (this.stage === 1 && vehicle && distance2D(focus, target) < 13) this.advance('MERIDIAN PLAZA REACHED');
    } else if (this.index === 1) {
      if (this.stage === 0 && vehicle && vehicle.type !== 'boat' && distance2D(focus, mission.marker) < 16) this.advance('WATERFRONT REACHED');
      else if (this.stage === 1 && vehicle && vehicle.type === 'boat') this.advance('TIDELINE BOAT READY');
      else if (this.stage === 2 && vehicle && vehicle.type === 'boat' && distance2D(focus, mission.destination) < 18) this.advance('LANTERN KEY REACHED');
    } else if (this.index === 2) {
      if (this.stage === 0 && distance2D(player.position, mission.marker) < 10) this.advance('NIGHT PARCEL COLLECTED');
      else if (this.stage === 1 && vehicle && vehicle.type !== 'boat' && distance2D(focus, mission.destination) < 15) this.advance('PACKAGE DELIVERED');
    }
    this.marker.rotation.y += .7 * (1 / 60);
    this.marker.children[1].scale.y = 1 + Math.sin(performance.now() * .004) * .12;
  }

  advance(message) {
    const mission = this.current();
    this.stage += 1;
    if (this.stage >= mission.stages.length - 1) {
      this.notify(`${mission.name} COMPLETE  +$${this.index === 0 ? 500 : 850}`);
      this.refreshMarker();
      if (this.index < missions.length - 1) {
        this.index += 1;
        this.stage = 0;
        this.notify(`${missions[this.index].name} STARTED`);
      }
    } else {
      this.notify(message);
    }
    this.refreshMarker();
  }

  savePatch() { return { missionIndex: this.index, missionProgress: this.stage }; }
}

export { missions };

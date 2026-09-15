import * as THREE from 'three';
import { distance2D, randomRange } from '../utils/math.js';

export class PedestrianSystem {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.people = [];
    this.spawned = false;
    this.palette = [0x6c9a91, 0xc87b57, 0x8b78a1, 0xd1ac67, 0x6e849a];
  }

  applySettings(settings) {
    this.settings = settings;
    const limit = settings.pedestrians === 'Low' ? 8 : settings.pedestrians === 'High' ? 26 : 16;
    this.people.forEach((person, index) => { person.group.visible = index < limit; });
  }

  createPerson(index) {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: this.palette[index % this.palette.length] });
    const skin = new THREE.MeshLambertMaterial({ color: 0x9a6048 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .42, 4, 5), material);
    body.position.y = .78;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), skin);
    head.position.y = 1.28;
    group.add(body, head);
    group.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    group.position.set(randomRange(-220, 220), .05, randomRange(-220, 220));
    this.scene.add(group);
    return { group, velocity: new THREE.Vector3(), target: new THREE.Vector3(), phase: index * .7 };
  }

  ensurePopulation() {
    if (this.spawned) return;
    const count = this.settings.pedestrians === 'Low' ? 8 : this.settings.pedestrians === 'High' ? 26 : 16;
    for (let i = 0; i < count; i += 1) this.people.push(this.createPerson(i));
    this.spawned = true;
  }

  update(delta, playerPosition) {
    this.ensurePopulation();
    for (const person of this.people) {
      const distance = distance2D(person.group.position, playerPosition);
      person.group.visible = distance < 150;
      if (distance > 230) {
        person.group.position.set(playerPosition.x + randomRange(-110, 110), .05, playerPosition.z + randomRange(-110, 110));
      }
      if (person.group.visible) {
        if (person.group.position.distanceTo(person.target) < 2) person.target.set(person.group.position.x + randomRange(-26, 26), 0, person.group.position.z + randomRange(-26, 26));
        const direction = person.target.clone().sub(person.group.position).setY(0).normalize();
        person.velocity.lerp(direction.multiplyScalar(1.05), 1 - Math.exp(-2.3 * delta));
        person.group.position.addScaledVector(person.velocity, delta);
        person.group.rotation.y = Math.atan2(person.velocity.x, person.velocity.z);
        person.phase += delta * 7;
        person.group.position.y = .05 + Math.abs(Math.sin(person.phase)) * .04;
      }
    }
  }
}

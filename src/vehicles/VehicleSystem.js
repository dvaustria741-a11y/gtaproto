import * as THREE from 'three';
import { clamp, damp, dampAngle, distance2D } from '../utils/math.js';

const vehiclePalette = {
  sedan: { body: 0x2b7f87, trim: 0x14252b, label: 'NOVA SEDAN', power: 18 },
  sports: { body: 0xd36b47, trim: 0x251b25, label: 'SOLARIS GT', power: 30 },
  suv: { body: 0x8d9a74, trim: 0x1d292b, label: 'TERRAIN SUV', power: 22 },
  pickup: { body: 0xc28a4d, trim: 0x2b2925, label: 'RANGER PICKUP', power: 20 },
  boat: { body: 0xe8e2cc, trim: 0x2b6d79, label: 'TIDELINE BOAT', power: 25 }
};

class Vehicle {
  constructor(scene, type, position, rotation = 0, traffic = false) {
    this.scene = scene;
    this.type = type;
    this.spec = vehiclePalette[type];
    this.position = new THREE.Vector3(position.x, type === 'boat' ? .6 : .45, position.z);
    this.rotation = rotation;
    this.speed = 0;
    this.steering = 0;
    this.traffic = traffic;
    this.routeAxis = Math.abs(Math.sin(rotation)) > .6 ? 'x' : 'z';
    this.group = this.createModel();
    this.group.position.copy(this.position);
    this.group.rotation.y = rotation;
    scene.add(this.group);
  }

  createModel() {
    const group = new THREE.Group();
    group.name = `Vehicle_${this.spec.label.replaceAll(' ', '_')}`;
    const bodyMat = new THREE.MeshLambertMaterial({ color: this.spec.body, metalness: .15, roughness: .62 });
    const trimMat = new THREE.MeshLambertMaterial({ color: this.spec.trim, metalness: .3, roughness: .35 });
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x17383f, transparent: true, opacity: .83, shininess: 110 });
    const isBoat = this.type === 'boat';
    const length = isBoat ? 4.8 : this.type === 'sports' ? 4.2 : 4.5;
    const width = isBoat ? 1.8 : this.type === 'suv' || this.type === 'pickup' ? 2 : 1.85;
    const body = new THREE.Mesh(new THREE.BoxGeometry(length, isBoat ? .45 : .62, width), bodyMat);
    body.position.y = isBoat ? 0 : .4;
    body.castShadow = true;
    group.add(body);
    if (isBoat) {
      const bow = new THREE.Mesh(new THREE.ConeGeometry(width * .78, 1.25, 4), bodyMat);
      bow.rotation.z = Math.PI / 2;
      bow.position.set(length / 2 + .42, .05, 0);
      group.add(bow);
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(.8, .75, width * .78), glassMat);
      windshield.position.set(.25, .56, 0);
      windshield.rotation.z = -.1;
      group.add(windshield);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, .55, width * .8), trimMat);
      cabin.position.set(-.4, .38, 0);
      const rail = new THREE.Mesh(new THREE.TorusGeometry(.66, .045, 5, 18, Math.PI), trimMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(-.45, .78, 0);
      const motor = new THREE.Mesh(new THREE.BoxGeometry(.35, .65, .65), trimMat);
      motor.position.set(-length / 2 - .2, -.1, 0);
      group.add(cabin, rail, motor);
      return group;
    }
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(length * .5, .68, width * .86), glassMat);
    cabin.position.set(-.18, .98, 0);
    cabin.castShadow = true;
    group.add(cabin);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(length * .3, .16, width * .92), bodyMat);
    hood.position.set(length * .28, .76, 0);
    group.add(hood);
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(.18, .23, width * 1.02), trimMat);
    frontBumper.position.set(length / 2 + .05, .36, 0);
    const rearBumper = frontBumper.clone();
    rearBumper.position.x = -length / 2 - .05;
    group.add(frontBumper, rearBumper);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.06, .16, .5), new THREE.MeshBasicMaterial({ color: 0xe3e4cf }));
    plate.position.set(length / 2 + .13, .46, 0);
    group.add(plate);
    for (const side of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(.26, .12, .2), trimMat);
      mirror.position.set(.05, 1.22, side * (width * .55));
      group.add(mirror);
    }
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff1bf });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xd9483e });
    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(.08, .18, .42), headlightMat);
      headlight.position.set(length / 2 + .12, .62, side * width * .32);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(.08, .16, .42), tailMat);
      tail.position.set(-length / 2 - .12, .58, side * width * .32);
      group.add(headlight, tail);
    }
    if (this.type === 'sports') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, width * .92), trimMat);
      spoiler.position.set(-length * .42, 1.08, 0);
      const spoilerTop = new THREE.Mesh(new THREE.BoxGeometry(.72, .08, width * 1.08), trimMat);
      spoilerTop.position.set(-length * .42, 1.28, 0);
      group.add(spoiler, spoilerTop);
    }
    if (this.type === 'suv') {
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(length * .64, .08, .08), trimMat);
        rail.position.set(-.15, 1.42, side * width * .36);
        group.add(rail);
      }
    }
    if (this.type === 'pickup') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(length * .36, .18, width * .88), trimMat);
      bed.position.set(-length * .27, .77, 0);
      group.add(bed);
    }
    const wheels = [];
    for (const x of [-length * .31, length * .31]) for (const z of [-width * .52, width * .52]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.37, .37, .2, 14), trimMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, .32, z);
      wheel.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .215, 10), new THREE.MeshBasicMaterial({ color: 0xb8c0b7 }));
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheel.position);
      wheels.push(wheel);
      group.add(wheel, hub);
    }
    const lights = new THREE.Mesh(new THREE.BoxGeometry(.12, .14, width * .68), new THREE.MeshBasicMaterial({ color: 0xffe3a0 }));
    lights.position.set(length / 2 + .02, .57, 0);
    group.add(lights);
    group.userData.wheels = wheels;
    return group;
  }

  update(delta, input, world, isPlayer = false) {
    if (this.type === 'boat') this.position.y = .5 + Math.sin(performance.now() * .0017 + this.position.x) * .08;
    const axis = input ? input.axis() : { x: 0, y: 0 };
    if (isPlayer) {
      const throttle = axis.y;
      const steeringInput = axis.x;
      this.speed = damp(this.speed, throttle * this.spec.power, throttle ? 3.5 : 5.5, delta);
      if (Math.abs(this.speed) > .1) this.steering = damp(this.steering, steeringInput, 6, delta);
      this.rotation += this.steering * this.speed * delta * .027;
      if (input.held('jump')) this.speed = damp(this.speed, 0, 7, delta);
      const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
      const previousX = this.position.x;
      const previousZ = this.position.z;
      this.position.addScaledVector(forward, this.speed * delta);
      if (this.type !== 'boat') this.position.y = world.getGroundHeight(this.position.x, this.position.z) + .45;
      if (this.type !== 'boat' && world.isWaterAt(this.position.x, this.position.z)) {
        this.position.x = previousX;
        this.position.z = previousZ;
        this.position.y = world.getGroundHeight(previousX, previousZ) + .45;
        this.speed *= -.18;
      }
      this.resolveSoftBounds(world);
      const wheels = this.group.userData.wheels || [];
      wheels.forEach((wheel, index) => { wheel.rotation.z = (index % 2 === 0 ? -this.steering : -this.steering) * .4; wheel.rotation.y -= this.speed * delta * 1.8; });
    } else if (this.traffic) {
      this.speed = damp(this.speed, 4.2, 2, delta);
      const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
      this.position.addScaledVector(forward, this.speed * delta);
      if (Math.abs(this.position.x) > 680 || Math.abs(this.position.z) > 680) this.position.multiplyScalar(-.55);
    }
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;
  }

  resolveSoftBounds(world) {
    this.position.x = clamp(this.position.x, -700, 700);
    this.position.z = clamp(this.position.z, -700, 700);
    if (this.type !== 'boat' && this.position.x > 390 && this.position.z < 100) this.position.x = 390;
  }
}

export class VehicleSystem {
  constructor(scene, world, input) {
    this.scene = scene;
    this.world = world;
    this.input = input;
    this.vehicles = [];
    this.activeVehicle = null;
    this.nearbyVehicle = null;
    this.spawnParkedVehicles();
  }

  spawnParkedVehicles() {
    const parked = [
      ['sedan', { x: 13, z: 17 }, 0], ['sports', { x: 32, z: 18 }, Math.PI], ['suv', { x: -72, z: 64 }, Math.PI / 2],
      ['pickup', { x: -420, z: -70 }, Math.PI / 2], ['boat', { x: 370, z: 70 }, Math.PI / 2], ['boat', { x: 455, z: 125 }, -.4]
    ];
    this.vehicles = parked.map(([type, position, rotation]) => new Vehicle(this.scene, type, position, rotation));
  }

  spawnTraffic(count = 8) {
    for (let i = 0; i < count; i += 1) {
      const type = ['sedan', 'suv', 'pickup'][i % 3];
      const position = i % 2 ? { x: -300 + i * 47, z: -60 } : { x: 60, z: -280 + i * 49 };
      this.vehicles.push(new Vehicle(this.scene, type, position, i % 2 ? 0 : Math.PI / 2, true));
    }
  }

  findNearest(position, range) {
    let nearest = null;
    let best = range;
    for (const vehicle of this.vehicles) {
      if (vehicle.traffic && this.activeVehicle !== vehicle) continue;
      const distance = distance2D(position, vehicle.position);
      if (distance < best) { nearest = vehicle; best = distance; }
    }
    return nearest;
  }

  enter(vehicle, player) {
    if (!vehicle || this.activeVehicle) return false;
    this.activeVehicle = vehicle;
    player.model.visible = false;
    player.shadow.visible = false;
    player.position.copy(vehicle.position);
    return true;
  }

  exit(player) {
    if (!this.activeVehicle) return false;
    const vehicle = this.activeVehicle;
    const side = new THREE.Vector3(Math.cos(vehicle.rotation), 0, -Math.sin(vehicle.rotation)).multiplyScalar(2.2);
    player.position.copy(vehicle.position).add(side);
    player.position.y = this.world.getGroundHeight(player.position.x, player.position.z) + 1.1;
    player.model.visible = true;
    player.shadow.visible = true;
    this.activeVehicle = null;
    return true;
  }

  update(delta) {
    for (const vehicle of this.vehicles) vehicle.update(delta, this.activeVehicle === vehicle ? this.input : null, this.world, this.activeVehicle === vehicle);
  }

  getCameraTarget() {
    return this.activeVehicle ? this.activeVehicle.position : null;
  }

  getActiveLabel() { return this.activeVehicle ? this.activeVehicle.spec.label : ''; }
  getSpeed() { return this.activeVehicle ? Math.round(Math.abs(this.activeVehicle.speed) * 5.5) : 0; }
}

export { Vehicle };

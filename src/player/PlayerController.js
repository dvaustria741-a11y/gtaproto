import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../utils/math.js';

export class PlayerController {
  constructor(scene, world, input, saveData) {
    this.world = world;
    this.input = input;
    this.position = new THREE.Vector3(saveData.position.x, saveData.position.y, saveData.position.z);
    this.velocity = new THREE.Vector3();
    this.rotation = 0;
    this.cameraYaw = 0;
    this.cameraPitch = -.18;
    this.verticalVelocity = 0;
    this.onGround = true;
    this.crouched = false;
    this.health = 100;
    this.stamina = 100;
    this.interactionRange = 4.4;
    this.model = this.createModel();
    this.model.position.copy(this.position);
    scene.add(this.model);
    this.shadow = this.createShadow();
    scene.add(this.shadow);
    this.cameraTarget = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
  }

  createModel() {
    const group = new THREE.Group();
    group.name = 'OriginalPlayerCharacter';
    const skin = new THREE.MeshLambertMaterial({ color: 0xb87352 });
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6c70 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x23353e });
    const shoe = new THREE.MeshLambertMaterial({ color: 0x111b22 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.38, .75, 5, 8), jacket);
    torso.position.y = 1.25;
    torso.scale.set(1, 1, .58);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 8), skin);
    head.position.y = 2.08;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.29, 12, 6, 0, Math.PI * 2, 0, Math.PI * .52), shoe);
    hair.position.y = 2.16;
    const makeLimb = (material, length, radius) => new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 6), material);
    const leftArm = makeLimb(jacket, .64, .1); leftArm.position.set(-.5, 1.3, 0);
    const rightArm = makeLimb(jacket, .64, .1); rightArm.position.set(.5, 1.3, 0);
    const leftLeg = makeLimb(pants, .72, .12); leftLeg.position.set(-.2, .53, 0);
    const rightLeg = makeLimb(pants, .72, .12); rightLeg.position.set(.2, .53, 0);
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(.25, .13, .42), shoe); leftShoe.position.set(-.2, .12, .06);
    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(.25, .13, .42), shoe); rightShoe.position.set(.2, .12, .06);
    group.add(torso, head, hair, leftArm, rightArm, leftLeg, rightLeg, leftShoe, rightShoe);
    group.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
    group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    return group;
  }

  createShadow() {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.05, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    return shadow;
  }

  update(delta, camera, vehicleSystem) {
    const axis = this.input.axis();
    const moving = Math.hypot(axis.x, axis.y) > .08;
    const sprinting = this.input.held('sprint') && this.stamina > 1 && moving && !this.crouched;
    this.crouched = this.input.held('crouch');
    const speed = this.crouched ? 2.2 : sprinting ? 8.2 : 4.2;
    if (sprinting) this.stamina = Math.max(0, this.stamina - delta * 18); else this.stamina = Math.min(100, this.stamina + delta * 11);
    this.cameraYaw -= this.input.look.x;
    this.cameraPitch = clamp(this.cameraPitch - this.input.look.y, -.9, .32);
    if (moving) {
      const moveAngle = Math.atan2(axis.x, axis.y) + this.cameraYaw;
      this.rotation = dampAngle(this.rotation, moveAngle, 12, delta);
      this.velocity.x = damp(this.velocity.x, Math.sin(moveAngle) * speed, 13, delta);
      this.velocity.z = damp(this.velocity.z, Math.cos(moveAngle) * speed, 13, delta);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 15, delta);
      this.velocity.z = damp(this.velocity.z, 0, 15, delta);
    }
    if (this.input.consume('jump') && this.onGround) {
      this.verticalVelocity = 7.4;
      this.onGround = false;
    }
    this.verticalVelocity -= 19 * delta;
    const previousX = this.position.x;
    const previousZ = this.position.z;
    this.position.x += this.velocity.x * delta;
    this.position.z += this.velocity.z * delta;
    this.position.y += this.verticalVelocity * delta;
    if (this.world.isWaterAt(this.position.x, this.position.z) && this.position.y < 3.2) {
      this.position.x = previousX;
      this.position.z = previousZ;
      this.velocity.x *= .2;
      this.velocity.z *= .2;
    }
    const ground = this.world.getGroundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground + (this.crouched ? .8 : 1.1)) {
      this.position.y = ground + (this.crouched ? .8 : 1.1);
      this.verticalVelocity = 0;
      this.onGround = true;
    }
    this.resolveWorldCollisions();
    this.model.position.copy(this.position);
    this.model.rotation.y = this.rotation;
    const slopeX = this.world.getGroundHeight(this.position.x + .8, this.position.z) - this.world.getGroundHeight(this.position.x - .8, this.position.z);
    const slopeZ = this.world.getGroundHeight(this.position.x, this.position.z + .8) - this.world.getGroundHeight(this.position.x, this.position.z - .8);
    this.model.rotation.x = damp(this.model.rotation.x, -slopeZ * .45, 7, delta);
    this.model.rotation.z = damp(this.model.rotation.z, slopeX * .45, 7, delta);
    this.model.scale.y = damp(this.model.scale.y, this.crouched ? .76 : 1, 12, delta);
    const swing = moving ? Math.sin(performance.now() * .012 * (sprinting ? 1.5 : 1)) * .48 : 0;
    const limbs = this.model.userData.limbs;
    limbs.leftLeg.rotation.x = swing; limbs.rightLeg.rotation.x = -swing;
    limbs.leftArm.rotation.x = -swing * .55; limbs.rightArm.rotation.x = swing * .55;
    this.shadow.position.set(this.position.x, ground + .025, this.position.z);
    this.updateCamera(camera, delta);
    if (vehicleSystem) vehicleSystem.nearbyVehicle = vehicleSystem.findNearest(this.position, this.interactionRange);
  }

  resolveWorldCollisions() {
    for (const obstacle of this.world.playerCollision) {
      const dx = this.position.x - obstacle.x;
      const dz = this.position.z - obstacle.z;
      const limitX = obstacle.width + .55;
      const limitZ = obstacle.depth + .55;
      if (Math.abs(dx) < limitX && Math.abs(dz) < limitZ) {
        if (Math.abs(dx / limitX) > Math.abs(dz / limitZ)) this.position.x = obstacle.x + Math.sign(dx || 1) * limitX;
        else this.position.z = obstacle.z + Math.sign(dz || 1) * limitZ;
      }
    }
  }

  updateCamera(camera, delta) {
    const targetHeight = this.crouched ? 1.3 : 1.7;
    this.cameraTarget.set(this.position.x, this.position.y + targetHeight, this.position.z);
    const distance = 7.8;
    const horizontal = Math.cos(this.cameraPitch) * distance;
    this.cameraPosition.set(
      this.cameraTarget.x - Math.sin(this.cameraYaw) * horizontal,
      this.cameraTarget.y + Math.sin(this.cameraPitch) * distance + 2.55,
      this.cameraTarget.z - Math.cos(this.cameraYaw) * horizontal
    );
    camera.position.lerp(this.cameraPosition, 1 - Math.exp(-7 * delta));
    camera.lookAt(this.cameraTarget);
    camera.fov = damp(camera.fov, 62, 5, delta);
    camera.updateProjectionMatrix();
  }

  getForward() { return new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation)); }
}

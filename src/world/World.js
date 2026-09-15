import * as THREE from 'three';
import { hash2D, randomRange, randomInt, clamp } from '../utils/math.js';

const CHUNK_SIZE = 180;
const ACTIVE_RADIUS = 2;
const roadMat = new THREE.MeshLambertMaterial({ color: 0x182c30 });
const roadLineMat = new THREE.MeshBasicMaterial({ color: 0xe3c875 });
const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x637477 });
const curbMat = new THREE.MeshLambertMaterial({ color: 0x9aa6a1 });
const concreteMat = new THREE.MeshLambertMaterial({ color: 0x758083 });
const roofMat = new THREE.MeshLambertMaterial({ color: 0x3e3e43 });
const awningMat = new THREE.MeshLambertMaterial({ color: 0xc07a52 });
const glassMat = new THREE.MeshPhongMaterial({ color: 0x183e4a, shininess: 90, transparent: true, opacity: .9 });
const windowMat = new THREE.MeshBasicMaterial({ color: 0xffc77c });
const windowCoolMat = new THREE.MeshBasicMaterial({ color: 0x9fd4df });
const lampMat = new THREE.MeshLambertMaterial({ color: 0x1a2428 });
const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffc46e });
const palmFrondMat = new THREE.MeshLambertMaterial({ color: 0x2c8063, side: THREE.DoubleSide });
const flowerMat = new THREE.MeshLambertMaterial({ color: 0xd47b67 });
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, metalness: 0 });
const terrainUnderlayMat = new THREE.MeshStandardMaterial({ color: 0x344b45, roughness: 1, metalness: 0 });

const WATER_LEVEL = -.45;
const TERRAIN_STEP = 10;

const smoothStep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const coastLine = (z) => 360 + Math.sin(z * .015) * 18 + Math.sin(z * .041) * 5;

// Positive values are land distance; negative values are ocean distance. The
// same field drives the terrain mesh, player grounding, and vehicle water test.
const edgeSDF = (x, z) => {
  const coast = coastLine(z);
  const shoreWave = Math.sin(x * .037 + Math.sin(z * .021)) * 8 + Math.cos(z * .043 + x * .012) * 5;
  const mainland = Math.min((coast - x) + shoreWave * smoothStep(-15, 40, coast - x), z + 540, 540 - z, x + 680);
  const island = (1 - Math.hypot((x - 448) / 74, (z + 92) / 86)) * 74 + Math.sin(x * .13 + z * .09) * 2;
  return Math.max(mainland, island);
};

const rawTerrainHeight = (x, z) => {
  const edge = edgeSDF(x, z);
  let height = THREE.MathUtils.lerp(-3.1, .14, smoothStep(-42, 22, edge));
  if (edge > 0 && edge < 17) height += Math.max(0, Math.sin(x * .048 + z * .031)) * .55 * smoothStep(0, 17, edge) * (1 - smoothStep(14, 22, edge));
  const hillMask = smoothStep(-110, -430, x) * smoothStep(25, 70, edge);
  height += (2.2 + Math.sin(x * .026) * Math.cos(z * .031) * 1.45 + Math.sin(x * .065 + z * .048) * .75) * hillMask;
  const inlandMask = smoothStep(230, 520, z) * smoothStep(18, 75, edge);
  height += inlandMask * (Math.sin(x * .018) * .55 + Math.cos(z * .023) * .65 + .45);
  const islandCore = clamp(1 - Math.hypot((x - 448) / 74, (z + 92) / 86), 0, 1);
  height += islandCore * islandCore * 5.2;
  return height;
};

const terrainHeight = (x, z) => {
  const x0 = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP;
  const z0 = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
  const u = (x - x0) / TERRAIN_STEP;
  const v = (z - z0) / TERRAIN_STEP;
  const a = rawTerrainHeight(x0, z0);
  const b = rawTerrainHeight(x0 + TERRAIN_STEP, z0);
  const c = rawTerrainHeight(x0, z0 + TERRAIN_STEP);
  const d = rawTerrainHeight(x0 + TERRAIN_STEP, z0 + TERRAIN_STEP);
  return u + v <= 1 ? a * (1 - u - v) + b * u + c * v : d * (u + v - 1) + b * (1 - v) + c * (1 - u);
};
const cityGroundMat = new THREE.MeshLambertMaterial({ color: 0x283b3a });
const suburbGroundMat = new THREE.MeshLambertMaterial({ color: 0x4f6b54 });
const wetlandGroundMat = new THREE.MeshLambertMaterial({ color: 0x31534a });
const sandMat = new THREE.MeshLambertMaterial({ color: 0xb79d6e });
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x146073) }, uSun: { value: 0.6 } },
  vertexShader: 'uniform float uTime; varying vec2 vUv; varying float wave; void main(){vUv=uv;vec3 p=position;wave=sin(p.x*.05+uTime*1.3)*.45+cos(p.y*.035+uTime*.7)*.3;p.z+=wave;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
  fragmentShader: 'uniform vec3 uColor; uniform float uSun; varying vec2 vUv; varying float wave; void main(){float glint=pow(max(0.0,sin(vUv.x*120.0+wave*3.0)),36.0)*.22;gl_FragColor=vec4(uColor+glint*uSun,0.9);}',
  transparent: true
});

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.time = 0;
    this.focus = new THREE.Vector3();
    this.playerCollision = [];
    this.roadNetwork = [];
    this.windowMaterials = [];
    this.streetLightMaterials = [];
    this.water = this.createWater();
    scene.add(this.water);
    this.createDistantSkyline();
    this.preparePalette();
  }

  preparePalette() {
    this.buildingMats = [0x536b70, 0x8b7770, 0x526e70, 0xa28d78, 0x3c5d67, 0x7c8580].map((color) => new THREE.MeshLambertMaterial({ color }));
    this.windowMat = windowMat;
    this.treeTrunk = new THREE.MeshLambertMaterial({ color: 0x513a28 });
    this.leafMats = [0x23685c, 0x34785a, 0x518354, 0x1e574f].map((color) => new THREE.MeshLambertMaterial({ color }));
    this.windowMaterials.push(this.windowMat, windowCoolMat);
    this.scene.userData.windowMaterials = this.windowMaterials;
    this.scene.userData.streetLightMaterials = this.streetLightMaterials;
  }

  createWater() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500, 80, 80), waterMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(430, -.45, 160);
    mesh.receiveShadow = true;
    mesh.userData.water = true;
    return mesh;
  }

  createDistantSkyline() {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: 0x1b3b47, transparent: true, opacity: .66 });
    for (let i = 0; i < 55; i += 1) {
      const angle = (i / 55) * Math.PI * 2;
      const radius = 490 + (i % 4) * 32;
      const height = 28 + (i * 19) % 78;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(12 + i % 7 * 4, height, 12 + i % 5 * 4), material);
      mesh.position.set(Math.cos(angle) * radius, height / 2 - 2, Math.sin(angle) * radius);
      group.add(mesh);
    }
    group.name = 'DistantSkyline';
    this.scene.add(group);
  }

  biomeAt(x, z) {
    if (x > 360) return z < -80 ? 'islands' : 'coast';
    if (z > 360) return 'suburbs';
    if (z < -320 && x < 200) return 'wetlands';
    if (x < -330 && z > -220) return 'industrial';
    if (x > 190 && z < -150) return 'airport';
    if (Math.abs(x) < 250 && Math.abs(z) < 240) return 'city';
    return 'suburbs';
  }

  update(playerPosition, settings) {
    this.focus.copy(playerPosition);
    const centerX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const centerZ = Math.floor(playerPosition.z / CHUNK_SIZE);
    const keep = new Set();
    const radius = settings.renderDistance === 'Near' ? 1 : settings.renderDistance === 'Ultra' ? 3 : 2;
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      for (let z = centerZ - radius; z <= centerZ + radius; z += 1) {
        const key = `${x}:${z}`;
        keep.add(key);
        if (!this.chunks.has(key)) this.loadChunk(x, z);
      }
    }
    for (const [key, chunk] of this.chunks) {
      const distance = Math.hypot(chunk.x - centerX, chunk.z - centerZ);
      // Keep the square residency buffer for seamless streaming, but render
      // only the circular neighborhood around the player. This trims the
      // expensive corner chunks on phones without making the horizon pop.
      chunk.group.visible = distance <= radius;
      if (distance > radius + 1) this.unloadChunk(key);
    }
  }

  loadChunk(x, z) {
    const group = new THREE.Group();
    const worldX = x * CHUNK_SIZE;
    const worldZ = z * CHUNK_SIZE;
    group.position.set(worldX, 0, worldZ);
    const biome = this.biomeAt(worldX + CHUNK_SIZE / 2, worldZ + CHUNK_SIZE / 2);
    group.name = `Chunk_${x}_${z}_${biome}`;
    this.createGround(group, biome);
    this.createRoads(group, worldX, worldZ, biome);
    this.createStreetDressing(group, worldX, worldZ, biome);
    if (biome === 'city') this.createCity(group, worldX, worldZ, x, z);
    if (biome === 'suburbs') this.createSuburbs(group, worldX, worldZ, x, z);
    if (biome === 'wetlands') this.createWetlands(group, worldX, worldZ, x, z);
    if (biome === 'coast' || biome === 'islands') this.createCoast(group, worldX, worldZ, x, z, biome);
    if (biome === 'industrial') this.createIndustrial(group, worldX, worldZ, x, z);
    if (biome === 'airport') this.createAirport(group, worldX, worldZ, x, z);
    if (x === 2 && z === 0) this.createHarborBridge(group);
    if (x === 1 && z === 0) this.createFerrisWheel(group);
    if (biome === 'city' && Math.abs(x) <= 1 && Math.abs(z) <= 1) this.createPlaza(group, x, z);
    this.scene.add(group);
    this.chunks.set(`${x}:${z}`, { x, z, group, biome });
  }

  unloadChunk(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.scene.remove(chunk.group);
    chunk.group.traverse((object) => {
      if (object.geometry && object.geometry.dispose) object.geometry.dispose();
    });
    this.chunks.delete(key);
  }

  createGround(group, biome) {
    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 18, 18);
    const positions = geometry.attributes.position;
    const colors = [];
    const worldX = group.position.x;
    const worldZ = group.position.z;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i) + worldX;
      const z = -positions.getY(i) + worldZ;
      const height = terrainHeight(x, z);
      positions.setZ(i, height);
      const shore = clamp((18 - edgeSDF(x, z)) / 18, 0, 1);
      const rock = clamp((height - 2.8) / 4.5, 0, 1);
      const base = biome === 'wetlands' ? new THREE.Color(0x3d6354) : biome === 'suburbs' ? new THREE.Color(0x567658) : biome === 'coast' || biome === 'islands' ? new THREE.Color(0x9c8b62) : new THREE.Color(0x43574f);
      const sand = new THREE.Color(0xc4ae78);
      const stone = new THREE.Color(0x817970);
      const color = base.lerp(sand, shore).lerp(stone, rock);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, terrainMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
    // Give the heightfield a real vertical edge at beaches and hills without
    // putting a flat slab above the ocean surface.
    const underlay = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, 6, CHUNK_SIZE), terrainUnderlayMat);
    underlay.position.y = -5;
    underlay.receiveShadow = true;
    group.add(underlay);
  }

  createRoads(group, worldX, worldZ, biome) {
    if (biome === 'wetlands' || biome === 'islands' || biome === 'coast') return;
    const roads = biome === 'city' ? [-60, 60] : [0];
    roads.forEach((offset) => {
      const horizontalY = Math.max(WATER_LEVEL + .04, this.getGroundHeight(worldX + CHUNK_SIZE / 2, worldZ + offset + CHUNK_SIZE / 2) + .04);
      const verticalY = Math.max(WATER_LEVEL + .04, this.getGroundHeight(worldX + offset + CHUNK_SIZE / 2, worldZ + CHUNK_SIZE / 2) + .04);
      const horizontal = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, .12, biome === 'city' ? 16 : 11), roadMat);
      horizontal.position.set(CHUNK_SIZE / 2, horizontalY, offset + CHUNK_SIZE / 2);
      group.add(horizontal);
      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, .18, 1.2), curbMat);
        curb.position.set(CHUNK_SIZE / 2, horizontalY + .1, offset + CHUNK_SIZE / 2 + side * (biome === 'city' ? 9.2 : 6.7));
        group.add(curb);
      }
      const vertical = new THREE.Mesh(new THREE.BoxGeometry(biome === 'city' ? 16 : 11, .12, CHUNK_SIZE), roadMat);
      vertical.position.set(offset + CHUNK_SIZE / 2, verticalY, CHUNK_SIZE / 2);
      group.add(vertical);
      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(1.2, .18, CHUNK_SIZE), curbMat);
        curb.position.set(offset + CHUNK_SIZE / 2 + side * (biome === 'city' ? 9.2 : 6.7), verticalY + .1, CHUNK_SIZE / 2);
        group.add(curb);
      }
      for (let line = -CHUNK_SIZE / 2 + 10; line < CHUNK_SIZE / 2; line += 18) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(6, .02, .28), roadLineMat);
        marker.position.set(line + CHUNK_SIZE / 2, horizontalY + .08, offset + CHUNK_SIZE / 2);
        group.add(marker);
        const marker2 = new THREE.Mesh(new THREE.BoxGeometry(.28, .02, 6), roadLineMat);
        marker2.position.set(offset + CHUNK_SIZE / 2, verticalY + .08, line + CHUNK_SIZE / 2);
        group.add(marker2);
      }
      if (biome === 'city') this.addCrosswalk(group, offset + CHUNK_SIZE / 2, offset + CHUNK_SIZE / 2, horizontalY);
    });
    const sidewalkA = new THREE.Mesh(new THREE.BoxGeometry(CHUNK_SIZE, .18, 3), sidewalkMat);
    sidewalkA.position.set(CHUNK_SIZE / 2, Math.max(WATER_LEVEL + .08, this.getGroundHeight(worldX + CHUNK_SIZE / 2, worldZ + CHUNK_SIZE / 2 - 11) + .1), CHUNK_SIZE / 2 - 11);
    const sidewalkB = sidewalkA.clone();
    sidewalkB.position.z = CHUNK_SIZE / 2 + 11;
    group.add(sidewalkA, sidewalkB);
  }

  addCrosswalk(group, x, z, y) {
    for (let i = -4; i <= 4; i += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, .025, 7), roadLineMat);
      stripe.position.set(x + i * 2.1, y + .08, z - 25);
      group.add(stripe);
    }
  }

  createStreetDressing(group, worldX, worldZ, biome) {
    if (biome === 'wetlands' || biome === 'islands') return;
    const streetCount = biome === 'city' ? 8 : 4;
    for (let i = 0; i < streetCount; i += 1) {
      const x = 18 + ((i * 41 + Math.abs(worldX) * .2) % 140);
      const z = biome === 'coast' ? 20 + i * 13 : (i % 2 ? 22 : 158);
      this.createStreetLight(group, x, z, i % 2 ? Math.PI : 0);
    }
    if (biome === 'suburbs' || biome === 'city') {
      for (let i = 0; i < 6; i += 1) {
        const planter = new THREE.Mesh(new THREE.BoxGeometry(2.5, .55, 1.2), concreteMat);
        planter.position.set(18 + i * 27, .35, biome === 'city' ? 30 : 18);
        const flowers = new THREE.Mesh(new THREE.SphereGeometry(.7, 7, 5), flowerMat);
        flowers.position.set(planter.position.x, .95, planter.position.z);
        group.add(planter, flowers);
      }
    }
  }

  createStreetLight(group, x, z, rotation) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, 5.6, 7), lampMat);
    pole.position.set(x, 2.8, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, .08, .08), lampMat);
    arm.position.set(x + Math.sin(rotation) * .55, 5.4, z + Math.cos(rotation) * .55);
    arm.rotation.y = rotation;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), lampGlowMat);
    bulb.position.set(x + Math.sin(rotation) * 1.05, 5.32, z + Math.cos(rotation) * 1.05);
    this.streetLightMaterials.push(bulb.material);
    group.add(pole, arm, bulb);
  }

  createCity(group, worldX, worldZ, cx, cz) {
    const count = 12 + Math.floor(hash2D(cx, cz) * 9);
    const buildings = new THREE.Group();
    const windowStrip = [];
    for (let i = 0; i < count; i += 1) {
      const px = 18 + ((i * 53 + cx * 17) % 145);
      const pz = 18 + ((i * 37 + cz * 23) % 145);
      if (Math.abs(px - 90) < 18 || Math.abs(pz - 90) < 18) continue;
      const width = 13 + (i * 7) % 15;
      const depth = 13 + (i * 11) % 13;
      const height = 24 + (i * 19 + cx * 11 + cz * 7) % 82;
      const building = this.makeBuilding(width, depth, height, i, cx, cz);
      building.position.set(px, this.getGroundHeight(worldX + px, worldZ + pz), pz);
      building.castShadow = true;
      building.receiveShadow = true;
      buildings.add(building);
      if (i % 4 === 0) this.playerCollision.push({ x: worldX + px, z: worldZ + pz, width: width * .55, depth: depth * .55 });
    }
    windowStrip.forEach((window) => buildings.add(window));
    const tower = this.makeTower(new THREE.Vector3(95, this.getGroundHeight(worldX + 95, worldZ + 94), 94), 75 + hash2D(cx + 3, cz) * 36);
    buildings.add(tower);
    group.add(buildings);
    this.addTrees(group, 6, cx, cz, worldX, worldZ, false);
  }

  makeBuilding(width, depth, height, index, cx, cz) {
    const lod = new THREE.LOD();
    const high = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.buildingMats[index % this.buildingMats.length]);
    body.position.y = height / 2;
    high.add(body);
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + .8, 1.2, depth + .8), concreteMat);
    base.position.y = .6;
    high.add(base);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + .25, .35, depth + .25), index % 3 === 0 ? roofMat : concreteMat);
    roof.position.y = height + .18;
    high.add(roof);
    const rows = Math.min(7, Math.max(2, Math.floor(height / 10)));
    const frontCols = Math.max(2, Math.floor(width / 4));
    for (let row = 0; row < rows; row += 1) {
      const y = 5 + row * ((height - 9) / rows);
      for (let col = 0; col < frontCols; col += 1) {
        const windowWidth = Math.min(1.65, (width - 3) / frontCols * .62);
        const window = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, 1.25, .07), (row + col + index) % 4 === 0 ? windowCoolMat : this.windowMat);
        window.position.set(-width / 2 + 1.65 + col * ((width - 3) / frontCols), y, depth / 2 + .05);
        high.add(window);
      }
      if (index % 3 === 0 && row % 2 === 0) {
        const balcony = new THREE.Mesh(new THREE.BoxGeometry(width * .55, .1, 1.2), concreteMat);
        balcony.position.set(0, y - .9, depth / 2 + .48);
        high.add(balcony);
      }
    }
    for (let i = 0; i < (index % 3) + 1; i += 1) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.6, .9, 1.1), concreteMat);
      ac.position.set(-width * .25 + i * 1.8, height + .72, -depth * .18);
      high.add(ac);
    }
    if (index % 4 === 1) {
      const awning = new THREE.Mesh(new THREE.BoxGeometry(width * .7, .18, 1.1), awningMat);
      awning.position.set(0, 3.8, depth / 2 + .56);
      high.add(awning);
    }
    high.traverse((object) => { if (object.isMesh) { object.castShadow = height > 35; object.receiveShadow = true; } });
    const low = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.buildingMats[index % this.buildingMats.length]);
    low.position.y = height / 2;
    lod.addLevel(high, 0);
    lod.addLevel(low, 190);
    return lod;
  }

  makeTower(position, height) {
    const lod = new THREE.LOD();
    const high = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(22, height, 22), this.buildingMats[0]);
    body.position.y = height / 2;
    body.castShadow = true;
    high.add(body);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 12), this.windowMat);
    crown.position.y = height - 5;
    high.add(crown);
    const core = new THREE.Mesh(new THREE.BoxGeometry(3.2, 8, 3.2), glassMat);
    core.position.y = height + 3.5;
    high.add(core);
    const roofRing = new THREE.Mesh(new THREE.TorusGeometry(7, .18, 6, 32), windowCoolMat);
    roofRing.rotation.x = Math.PI / 2;
    roofRing.position.y = height + 5;
    high.add(roofRing);
    const low = new THREE.Mesh(new THREE.BoxGeometry(22, height * .7, 22), this.buildingMats[0]);
    low.position.y = height * .35;
    lod.addLevel(high, 0);
    lod.addLevel(low, 170);
    lod.position.copy(position);
    return lod;
  }

  createSuburbs(group, worldX, worldZ, cx, cz) {
    const houses = new THREE.Group();
    for (let i = 0; i < 16; i += 1) {
      const x = 14 + ((i * 43 + cx * 9) % 148);
      const z = 14 + ((i * 67 + cz * 5) % 148);
      const house = this.makeHouse(10 + (i % 3) * 3, 7 + (i % 2) * 2);
      house.position.set(x, this.getGroundHeight(worldX + x, worldZ + z), z);
      house.rotation.y = (i % 4) * Math.PI / 2;
      houses.add(house);
    }
    group.add(houses);
    this.addTrees(group, 18, cx, cz, worldX, worldZ, true);
  }

  makeHouse(width, depth) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 5, depth), this.buildingMats[2]);
    body.position.y = 2.5;
    body.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * .72, 3.5, 4), new THREE.MeshLambertMaterial({ color: 0x60473e }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 6.6;
    roof.scale.z = depth / width;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, .08), awningMat);
    door.position.set(width * .18, 1.35, depth / 2 + .05);
    const windowLeft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, .08), windowCoolMat);
    windowLeft.position.set(-width * .27, 2.7, depth / 2 + .06);
    const windowRight = windowLeft.clone();
    windowRight.position.x = width * .47;
    const path = new THREE.Mesh(new THREE.BoxGeometry(2.5, .08, 5.5), sidewalkMat);
    path.position.set(width * .18, .05, depth / 2 + 2.7);
    const hedge = new THREE.Mesh(new THREE.SphereGeometry(.85, 7, 5), this.leafMats[1]);
    hedge.position.set(-width * .44, .8, depth / 2 + .35);
    group.add(body, roof, door, windowLeft, windowRight, path, hedge);
    return group;
  }

  addTrees(group, count, cx, cz, worldX, worldZ, palms) {
    const trunkGeo = new THREE.CylinderGeometry(.35, .52, palms ? 4.5 : 3.2, 6);
    const crownGeo = palms ? new THREE.SphereGeometry(2.5, 7, 5) : new THREE.IcosahedronGeometry(2.7, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, this.treeTrunk, count);
    const crowns = new THREE.InstancedMesh(crownGeo, this.leafMats[(Math.abs(cx + cz) % this.leafMats.length)], count);
    const transform = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      transform.position.set(10 + ((i * 41 + cx * 13) % 155), palms ? 2.2 : 1.6, 10 + ((i * 29 + cz * 17) % 155));
      transform.rotation.y = i;
      transform.scale.setScalar(.65 + hash2D(i + cx, cz + i) * .8);
      trunks.setMatrixAt(i, transform.matrix);
      transform.position.y += palms ? 2.8 : 1.8;
      crowns.setMatrixAt(i, transform.matrix);
    }
    trunks.castShadow = crowns.castShadow = true;
    group.add(trunks, crowns);
    if (palms) {
      for (let i = 0; i < Math.min(5, Math.ceil(count / 6)); i += 1) {
        const heroPalm = this.makePalm(2 + ((i * 37 + cx * 9) % 140), 3.5 + (i % 2) * 1.6, 16 + ((i * 53 + cz * 11) % 140));
        group.add(heroPalm);
      }
    }
  }

  makePalm(x, height, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .45, height, 8), this.treeTrunk);
    trunk.position.y = height / 2;
    trunk.rotation.z = -.05;
    group.add(trunk);
    for (let i = 0; i < 7; i += 1) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(.13, 2.7, 4), palmFrondMat);
      const angle = i / 7 * Math.PI * 2;
      frond.position.set(Math.cos(angle) * 1.05, height + .15 - Math.abs(Math.sin(angle)) * .18, Math.sin(angle) * 1.05);
      frond.rotation.z = Math.PI / 2 - .35;
      frond.rotation.y = -angle;
      frond.scale.y = .7 + Math.abs(Math.sin(angle)) * .3;
      group.add(frond);
    }
    group.position.set(x, 0, z);
    group.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    return group;
  }

  createWetlands(group, worldX, worldZ, cx, cz) {
    for (let i = 0; i < 8; i += 1) {
      const x = 22 + (i * 43) % 140;
      const z = 24 + (i * 61) % 135;
      const pond = new THREE.Mesh(new THREE.CircleGeometry(14 + i * 2, 16), waterMat);
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(x, this.getGroundHeight(worldX + x, worldZ + z) + .025, z);
      pond.scale.y = .45;
      group.add(pond);
    }
    this.addTrees(group, 26, cx, cz, worldX, worldZ, true);
    for (let i = 0; i < 10; i += 1) {
      group.add(this.makeMangrove(12 + (i * 47) % 158, 3.5 + (i % 3) * .8, 18 + (i * 31) % 150));
    }
    const shack = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(18, .35, 11), new THREE.MeshLambertMaterial({ color: 0x76543b }));
    floor.position.y = 2.1;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(15, 4.3, 8), this.buildingMats[1]);
    walls.position.y = 4.35;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(10.5, 3.6, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = .68;
    roof.position.y = 8.25;
    shack.add(floor, walls, roof);
    shack.position.set(124, 0, 116);
    group.add(shack);
    for (let i = 0; i < 6; i += 1) {
      const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(6, .22, 38), new THREE.MeshLambertMaterial({ color: 0x76543b }));
      boardwalk.position.set(24 + i * 27, .5, 90 + Math.sin(i) * 22);
      boardwalk.rotation.y = i * .17;
      group.add(boardwalk);
    }
  }

  makeMangrove(x, height, z) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.3, .75, height, 7), this.treeTrunk);
    trunk.position.y = height / 2;
    tree.add(trunk);
    for (let i = 0; i < 4; i += 1) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(.1, .16, 2.7, 6), this.treeTrunk);
      branch.position.set(Math.cos(i * 1.57) * 1.05, height - .25, Math.sin(i * 1.57) * 1.05);
      branch.rotation.z = Math.cos(i * 1.57) * .5;
      branch.rotation.x = Math.sin(i * 1.57) * .5;
      tree.add(branch);
    }
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), this.leafMats[0]);
    canopy.position.y = height + .55;
    canopy.scale.set(1.2, .75, 1.05);
    tree.add(canopy);
    tree.position.set(x, 0, z);
    tree.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    return tree;
  }

  createCoast(group, worldX, worldZ, cx, cz, biome) {
    if (biome === 'islands') {
      const shoreline = new THREE.Mesh(new THREE.RingGeometry(48, 78, 32), new THREE.MeshBasicMaterial({ color: 0xcfe0c7, transparent: true, opacity: .32, side: THREE.DoubleSide }));
      shoreline.rotation.x = -Math.PI / 2;
      shoreline.position.set(88, .08, 88);
      group.add(shoreline);
      this.addTrees(group, 24, cx, cz, worldX, worldZ, true);
      for (let i = 0; i < 3; i += 1) {
        const cabin = this.makeHouse(11, 8);
        cabin.position.set(56 + i * 29, this.getGroundHeight(worldX + 56 + i * 29, worldZ + 68), 68);
        cabin.rotation.y = i * .4;
        group.add(cabin);
      }
    } else {
      const shoreline = new THREE.Mesh(new THREE.RingGeometry(42, 78, 32), new THREE.MeshBasicMaterial({ color: 0xc5ded0, transparent: true, opacity: .24, side: THREE.DoubleSide }));
      shoreline.rotation.x = -Math.PI / 2;
      shoreline.position.set(140, .08, 90);
      shoreline.scale.y = .38;
      group.add(shoreline);
      const pier = new THREE.Mesh(new THREE.BoxGeometry(78, .32, 8), new THREE.MeshLambertMaterial({ color: 0x76533b }));
      pier.position.set(86, .4, 94);
      group.add(pier);
      for (let i = 0; i < 8; i += 1) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, 5, 8), new THREE.MeshLambertMaterial({ color: 0x5a4230 }));
        post.position.set(53 + i * 9, -1, 94);
        group.add(post);
      }
      for (let i = 0; i < 5; i += 1) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3 + i * .3, 1), new THREE.MeshLambertMaterial({ color: 0x6c7770 }));
        rock.position.set(124 + i * 10, .8, 118 + Math.sin(i) * 11);
        rock.scale.y = .55;
        group.add(rock);
      }
      this.addTrees(group, 11, cx, cz, worldX, worldZ, true);
    }
  }

  createIndustrial(group, worldX, worldZ, cx, cz) {
    for (let i = 0; i < 8; i += 1) {
      const width = 20 + (i % 3) * 8;
      const depth = 13 + (i % 2) * 8;
      const height = 8 + (i % 3) * 4;
      const warehouse = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshLambertMaterial({ color: 0x48595b }));
      warehouse.position.set(20 + (i * 41) % 150, height / 2, 18 + (i * 53) % 150);
      warehouse.castShadow = true;
      group.add(warehouse);
    }
    const tanks = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 11, 16), new THREE.MeshLambertMaterial({ color: 0x738585 }));
      tank.position.set(25 + i * 27, 5.5, 126);
      tanks.add(tank);
    }
    group.add(tanks);
  }

  createAirport(group, worldX, worldZ, cx, cz) {
    const runway = new THREE.Mesh(new THREE.BoxGeometry(150, .16, 22), roadMat);
    runway.position.set(90, .08, 90);
    group.add(runway);
    for (let x = 20; x < 160; x += 18) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(8, .03, .5), roadLineMat);
      stripe.position.set(x, .18, 90);
      group.add(stripe);
    }
    for (let i = 0; i < 4; i += 1) {
      const hangar = this.makeHouse(25, 18);
      hangar.scale.y = 1.4;
      hangar.position.set(30 + i * 36, 0, 45);
      group.add(hangar);
    }
  }

  createPlaza(group, cx, cz) {
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(26, 32), concreteMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(90, .16, 90);
    group.add(plaza);
    const fountain = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, .65, 24), concreteMat);
    basin.position.y = .5;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, .12, 24), waterMat);
    water.position.y = .86;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 4.5, 12), awningMat);
    column.position.y = 3.1;
    const spray = new THREE.Mesh(new THREE.SphereGeometry(2.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x91dce1, transparent: true, opacity: .5 }));
    spray.position.y = 5.4;
    fountain.add(basin, water, column, spray);
    fountain.position.set(90, 0, 90);
    group.add(fountain);
    for (let i = 0; i < 8; i += 1) {
      const palm = this.makePalm(90 + Math.cos(i / 8 * Math.PI * 2) * 20, 4.4, 90 + Math.sin(i / 8 * Math.PI * 2) * 20);
      group.add(palm);
    }
  }

  createHarborBridge(group) {
    const bridge = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(170, .7, 13), roadMat);
    deck.position.set(86, 5.5, 92);
    bridge.add(deck);
    for (let i = 0; i < 10; i += 1) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 12, 10), concreteMat);
      pillar.position.set(10 + i * 18, .2, 92);
      bridge.add(pillar);
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(170, .45, .3), curbMat);
      rail.position.set(86, 6.25, 92 + side * 6.1);
      bridge.add(rail);
      for (let i = 0; i < 18; i += 1) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.4, .18), concreteMat);
        post.position.set(4 + i * 9.3, 6.7, 92 + side * 6.1);
        bridge.add(post);
      }
    }
    group.add(bridge);
  }

  createFerrisWheel(group) {
    const wheel = new THREE.Group();
    const center = new THREE.Vector3(142, this.getGroundHeight(group.position.x + 142, group.position.z + 137) + 20, 137);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15, .38, 7, 48), new THREE.MeshLambertMaterial({ color: 0xd6d0bb }));
    ring.position.copy(center);
    wheel.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 1.1, 14), concreteMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(center);
    wheel.add(hub);
    for (let i = 0; i < 12; i += 1) {
      const angle = i / 12 * Math.PI * 2;
      const end = new THREE.Vector3(center.x + Math.cos(angle) * 15, center.y + Math.sin(angle) * 15, center.z);
      wheel.add(this.makeBeam(center, end, .09, concreteMat));
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, .9), i % 2 ? awningMat : new THREE.MeshLambertMaterial({ color: 0x4b9a95 }));
      gondola.position.set(end.x, end.y, end.z);
      wheel.add(gondola);
    }
    for (const side of [-1, 1]) {
      const foot = new THREE.Vector3(center.x + side * 13, center.y - 20, center.z + side * 2.6);
      wheel.add(this.makeBeam(foot, center, .65, concreteMat));
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.5, .35, 8), concreteMat);
      base.position.copy(foot).setY(center.y - 20);
      wheel.add(base);
    }
    wheel.userData.spin = ring;
    group.userData.wheel = wheel;
    group.add(wheel);
  }

  makeBeam(start, end, radius, material) {
    const direction = end.clone().sub(start);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 7), material);
    beam.position.copy(start).add(end).multiplyScalar(.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return beam;
  }

  getGroundHeight(x, z) {
    return terrainHeight(x, z);
  }

  isWaterAt(x, z) {
    return terrainHeight(x, z) < WATER_LEVEL + .22;
  }

  getNearestRoad(position) {
    const biome = this.biomeAt(position.x, position.z);
    const offset = biome === 'city' ? 60 : 0;
    const xDist = Math.abs(((position.x + CHUNK_SIZE / 2) % CHUNK_SIZE) - CHUNK_SIZE / 2 - offset);
    const zDist = Math.abs(((position.z + CHUNK_SIZE / 2) % CHUNK_SIZE) - CHUNK_SIZE / 2 - offset);
    if (Math.min(xDist, zDist) < 12 && biome !== 'wetlands') return { x: xDist < zDist ? Math.round(position.x / 10) * 10 : position.x, z: zDist < xDist ? Math.round(position.z / 10) * 10 : position.z, axis: xDist < zDist ? 'z' : 'x' };
    return null;
  }

  updateWater(delta) {
    waterMat.uniforms.uTime.value += delta;
    for (const [, chunk] of this.chunks) {
      const ring = chunk.group.userData.wheel?.userData.spin;
      if (ring) ring.rotation.z += delta * .06;
    }
  }
}

export { CHUNK_SIZE };

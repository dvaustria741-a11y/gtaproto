import * as THREE from 'three';
import { InputController } from '../player/InputController.js';
import { PlayerController } from '../player/PlayerController.js';
import { World } from '../world/World.js';
import { VehicleSystem } from '../vehicles/VehicleSystem.js';
import { TrafficSystem } from '../ai/TrafficSystem.js';
import { PedestrianSystem } from '../ai/PedestrianSystem.js';
import { MissionSystem } from '../missions/MissionSystem.js';
import { TimeWeatherSystem } from '../systems/TimeWeatherSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { UI } from '../ui/UI.js';

export class Game {
  constructor() {
    this.canvas = document.querySelector('#game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c2730);
    this.scene.fog = new THREE.Fog(0x0b252b, 120, 590);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, .1, 900);
    this.camera.position.set(0, 5, 8);
    this.save = new SaveSystem();
    this.paused = true;
    this.started = false;
    this.lastTime = performance.now();
    this.fpsSamples = [];
    this.bindResize();
    this.input = new InputController(this.canvas);
    this.addLighting();
    this.world = new World(this.scene);
    this.weather = new TimeWeatherSystem(this.scene, this.save.data.settings);
    this.weather.time = this.save.data.timeOfDay;
    this.player = new PlayerController(this.scene, this.world, this.input, this.save.data);
    this.vehicles = new VehicleSystem(this.scene, this.world, this.input);
    this.traffic = new TrafficSystem(this.vehicles, this.save.data.settings);
    this.pedestrians = new PedestrianSystem(this.scene, this.save.data.settings);
    this.missions = new MissionSystem(this.scene, this.save.data, (message) => this.notify(message));
    this.money = this.save.data.money;
    this.ui = new UI(this.input, {
      start: () => this.start(),
      pause: (value) => { this.paused = value; },
      restart: () => this.restart(),
      settingChanged: (key, value, settings) => this.applySettings(key, value, settings)
    }, this.save.data);
    this.world.update(this.player.position, this.save.data.settings);
    this.weather.update(0, this.player.position);
    this.camera.position.set(170, 52, 250);
    this.camera.lookAt(new THREE.Vector3(40, 18, 20));
    this.ui.setLoading(.2, 'LAYING OUT THE DISTRICTS');
    requestAnimationFrame(() => {
      this.ui.setLoading(.55, 'BUILDING THE SHORELINE');
      this.world.update(this.player.position, this.save.data.settings);
      requestAnimationFrame(() => {
        this.ui.setLoading(.82, 'TUNING TRAFFIC AND LIGHTS');
        requestAnimationFrame(() => this.ui.finishLoading());
      });
    });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  addLighting() {
    const ambient = new THREE.HemisphereLight(0x8fbac0, 0x10261f, 1.2);
    const fill = new THREE.DirectionalLight(0x8ab1c5, .25);
    fill.position.set(-60, 90, 50);
    this.scene.add(ambient, fill);
  }

  bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    });
  }

  start() {
    this.started = true;
    this.paused = false;
    this.ui.showGame();
    this.tryLandscapeFullscreen();
    this.notify('EXPLORE THE COASTLINE  ·  FOLLOW THE MARKER');
  }

  tryLandscapeFullscreen() {
    try { if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {}); } catch { /* browsers may reject outside a user gesture */ }
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* native Capacitor builds use the Android immersive flags */ }
  }

  restart() {
    this.save.reset();
    window.location.reload();
  }

  applySettings(key, value, settings) {
    this.save.save({ settings });
    this.weather.applySettings(settings);
    this.traffic.applySettings(settings);
    this.pedestrians.applySettings(settings);
    if (key === 'graphics') {
      this.renderer.setPixelRatio(value === 'High' ? Math.min(window.devicePixelRatio || 1, 1.75) : value === 'Low' ? 1 : Math.min(window.devicePixelRatio || 1, 1.35));
      this.renderer.shadowMap.enabled = value !== 'Low' && settings.shadows !== 'Off';
    }
  }

  notify(message) {
    this.ui?.notify(message);
  }

  handleInteraction() {
    if (!this.input.consume('interact')) return;
    if (this.vehicles.activeVehicle) {
      this.vehicles.exit(this.player);
      this.notify('ON FOOT');
    } else if (this.vehicles.nearbyVehicle) {
      this.vehicles.enter(this.vehicles.nearbyVehicle, this.player);
      this.notify(`ENTERED ${this.vehicles.getActiveLabel()}`);
    }
  }

  updateCameraForVehicle(delta) {
    const vehicle = this.vehicles.activeVehicle;
    if (!vehicle) return;
    const target = vehicle.position.clone(); target.y += 1.1;
    const offset = new THREE.Vector3(-Math.sin(vehicle.rotation) * 7.5, 4.1, -Math.cos(vehicle.rotation) * 7.5);
    this.camera.position.lerp(target.clone().add(offset), 1 - Math.exp(-5 * delta));
    this.camera.lookAt(target);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 62 + Math.min(12, Math.abs(vehicle.speed) * .24), 1 - Math.exp(-4 * delta));
    this.camera.updateProjectionMatrix();
  }

  loop(now) {
    const delta = Math.min((now - this.lastTime) / 1000, .05);
    this.lastTime = now;
    this.fpsSamples.push(1 / Math.max(delta, .001));
    if (this.fpsSamples.length > 20) this.fpsSamples.shift();
    if (!this.paused && this.started) this.update(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  update(delta) {
    this.handleInteraction();
    if (this.vehicles.activeVehicle) this.updateCameraForVehicle(delta); else this.player.update(delta, this.camera, this.vehicles);
    this.world.update(this.player.position, this.save.data.settings);
    this.world.updateWater(delta);
    this.vehicles.update(delta);
    this.traffic.update(this.player.position);
    this.pedestrians.update(delta, this.player.position);
    this.missions.update(this.player, this.vehicles);
    this.weather.update(delta, this.vehicles.activeVehicle?.position || this.player.position);
    if (this.missions.stage === 0 && this.missions.index === 2 && this.money < 3300) this.money = 3300;
    const savePosition = this.vehicles.activeVehicle ? this.vehicles.activeVehicle.position : this.player.position;
    if (Math.floor(performance.now() / 5000) !== this.lastSaveTick) {
      this.lastSaveTick = Math.floor(performance.now() / 5000);
      this.save.save({ position: { x: savePosition.x, y: savePosition.y, z: savePosition.z }, money: this.money, timeOfDay: this.weather.time, ...this.missions.savePatch() });
    }
    const fps = Math.round(this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length);
    this.ui.update(delta, {
      objective: this.missions.objective(), clock: this.weather.getClock(), weather: this.weather.weather, health: this.player.health,
      stamina: this.player.stamina, money: this.money, nearbyVehicle: this.vehicles.nearbyVehicle, activeVehicle: this.vehicles.activeVehicle,
      speed: this.vehicles.getSpeed(), fps, position: this.player.position, marker: this.missions.markerPosition(), heading: this.player.rotation
    });
    this.input.endFrame();
  }
}

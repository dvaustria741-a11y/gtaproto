import * as THREE from 'three';
import { clamp, damp, lerp } from '../utils/math.js';

const fogTint = new THREE.Color(0x123a45);
const windowDayWarm = new THREE.Color(0x66838a);
const windowDayCool = new THREE.Color(0x537b87);
const windowNightWarm = new THREE.Color(0xffc27b);
const windowNightCool = new THREE.Color(0x8ec8de);
const windowMix = new THREE.Color();

export class TimeWeatherSystem {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.time = 8.7;
    this.weather = 'clear';
    this.weatherTimer = 0;
    this.dayLength = 480;
    this.sun = new THREE.DirectionalLight(0xffd7a1, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.camera.left = -90;
    this.sun.shadow.camera.right = 90;
    this.sun.shadow.camera.top = 90;
    this.sun.shadow.camera.bottom = -90;
    this.moon = new THREE.DirectionalLight(0x8da8ff, 0.08);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color('#082839') }, horizon: { value: new THREE.Color('#e99e72') }, mix: { value: 0.18 } },
      vertexShader: 'varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform float mix; varying vec3 vWorld; void main(){float h=normalize(vWorld).y;float t=smoothstep(-.2,.75,h);vec3 c=mix(horizon,top,t);gl_FragColor=vec4(c,1.0);}'
    }));
    this.stars = this.createStars();
    this.sunOrb = this.createOrb(0xffd491, 3.8, 'SUN');
    this.moonOrb = this.createOrb(0xb8c8ff, 2.5, 'MOON');
    this.clouds = this.createClouds();
    this.rain = this.createRain();
    this.scene.add(this.sky, this.stars, this.sun, this.moon, this.sun.target, this.moon.target, this.sunOrb, this.moonOrb, this.clouds, this.rain);
    this.applySettings(settings);
  }

  createStars() {
    const positions = [];
    for (let i = 0; i < 420; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 0.78);
      const radius = 720;
      positions.push(Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(theta) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd7efff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.75 }));
  }

  createOrb(color, radius, label) {
    const group = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8), new THREE.MeshBasicMaterial({ color }));
    group.add(orb);
    group.userData.label = label;
    return group;
  }

  createRain() {
    const positions = [];
    for (let i = 0; i < 650; i += 1) positions.push((Math.random() - .5) * 120, Math.random() * 45, (Math.random() - .5) * 120);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9fd3e0, size: .11, transparent: true, opacity: .42 }));
  }

  createClouds() {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: 0xd2e4e2, transparent: true, opacity: .18, depthWrite: false });
    for (let i = 0; i < 12; i += 1) {
      const cloud = new THREE.Group();
      for (let puff = 0; puff < 4 + i % 3; puff += 1) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(11 + (puff % 3) * 3, 8, 5), material);
        blob.position.set(puff * 13 - 22, Math.sin(puff) * 2, Math.cos(puff * 1.7) * 7);
        blob.scale.y = .42;
        cloud.add(blob);
      }
      cloud.position.set((i - 6) * 110, 105 + (i % 3) * 12, (i % 4 - 2) * 115);
      cloud.scale.setScalar(.65 + (i % 3) * .17);
      group.add(cloud);
    }
    group.userData.material = material;
    return group;
  }

  applySettings(settings) {
    this.settings = settings;
    this.sun.castShadow = settings.shadows !== 'Off';
    this.rain.visible = settings.weather === 'On' && this.weather === 'rain';
    this.clouds.visible = settings.weather === 'On';
  }

  setWeather(weather) {
    this.weather = weather;
    this.rain.visible = this.settings.weather === 'On' && weather === 'rain';
  }

  update(delta, focusPosition) {
    if (this.settings.dayNight === 'On') this.time = (this.time + delta * 24 / this.dayLength) % 24;
    this.weatherTimer += delta;
    if (this.settings.weather === 'On' && this.weatherTimer > 36) {
      this.weatherTimer = 0;
      const roll = Math.random();
      this.setWeather(roll > .78 ? 'rain' : roll > .48 ? 'cloudy' : 'clear');
    }
    const angle = (this.time / 24) * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const daylight = clamp((sunHeight + .16) / 1.05, 0.04, 1);
    const sunset = clamp(1 - Math.abs(sunHeight) * 1.65, 0, 1);
    const weatherDim = this.weather === 'cloudy' ? .72 : this.weather === 'rain' ? .46 : 1;
    this.sun.position.set(Math.cos(angle) * 110, Math.max(12, sunHeight * 110), Math.sin(angle) * 110);
    this.sun.target.position.copy(focusPosition);
    this.moon.position.copy(this.sun.position).multiplyScalar(-1);
    this.moon.target.position.copy(focusPosition);
    this.sun.intensity = (0.25 + daylight * 2.2) * weatherDim;
    this.moon.intensity = (1 - daylight) * .48;
    this.sun.color.setHSL(0.08, .7, lerp(.55, .78, daylight));
    this.sky.material.uniforms.top.value.setHSL(.56, .66, lerp(.035, .19, daylight));
    this.sky.material.uniforms.horizon.value.setHSL(lerp(.06, .55, daylight), .63, lerp(.18, .5, daylight));
    this.sky.material.uniforms.mix.value = .17 + sunset * .32;
    this.scene.fog.color.copy(this.sky.material.uniforms.horizon.value).lerp(fogTint, .34);
    this.scene.fog.near = this.weather === 'rain' ? 55 : this.weather === 'cloudy' ? 82 : 120;
    this.scene.fog.far = this.weather === 'rain' ? 360 : this.weather === 'cloudy' ? 470 : 590;
    this.stars.material.opacity = (1 - daylight) * .9;
    this.sunOrb.visible = daylight > .08;
    this.moonOrb.visible = daylight < .65;
    this.sunOrb.position.copy(this.sun.position).normalize().multiplyScalar(270).add(focusPosition);
    this.moonOrb.position.copy(this.moon.position).normalize().multiplyScalar(240).add(focusPosition);
    this.clouds.position.x = focusPosition.x * .08;
    this.clouds.position.z = focusPosition.z * .08;
    this.clouds.rotation.y += delta * .003;
    this.clouds.userData.material.opacity = this.weather === 'clear' ? .08 : this.weather === 'cloudy' ? .28 : .38;
    const lightMaterials = this.scene.userData.streetLightMaterials || [];
    const glowStrength = clamp((1 - daylight) * 2.2, .05, 1);
    lightMaterials.forEach((material) => material.color.setRGB(1, .34 + glowStrength * .42, .08 + glowStrength * .32));
    const windowMaterials = this.scene.userData.windowMaterials || [];
    windowMaterials.forEach((material, index) => {
      const nightColor = index % 2 ? windowNightCool : windowNightWarm;
      const dayColor = index % 2 ? windowDayCool : windowDayWarm;
      material.color.copy(windowMix.copy(dayColor).lerp(nightColor, clamp((1 - daylight) * 1.7, 0, 1)));
    });
    this.rain.position.copy(focusPosition);
    const rainPositions = this.rain.geometry.attributes.position;
    for (let i = 1; i < rainPositions.count * 3; i += 3) {
      rainPositions.array[i] -= delta * 30;
      if (rainPositions.array[i] < 0) rainPositions.array[i] = 44;
    }
    rainPositions.needsUpdate = true;
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  getClock() {
    const hours = Math.floor(this.time);
    const minutes = Math.floor((this.time - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
}

import * as THREE from 'three';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, smoothing, delta) => lerp(a, b, 1 - Math.exp(-smoothing * delta));
export const dampAngle = (a, b, smoothing, delta) => {
  let difference = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
  return a + difference * (1 - Math.exp(-smoothing * delta));
};
export const randomRange = (min, max) => min + Math.random() * (max - min);
export const randomInt = (min, max) => Math.floor(randomRange(min, max + 1));
export const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const hash2D = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const colorFrom = (hex) => new THREE.Color(hex);

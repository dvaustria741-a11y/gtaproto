import { clamp } from '../utils/math.js';

export class InputController {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.buttons = { jump: false, sprint: false, crouch: false, interact: false };
    this.justPressed = new Set();
    this.lastPointer = null;
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      this.justPressed.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    }, { passive: false });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    element.addEventListener('pointerdown', (event) => {
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (element.requestPointerLock && event.pointerType === 'mouse') element.requestPointerLock();
    });
    element.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse' && document.pointerLockElement === element) {
        this.look.x += event.movementX * .0025;
        this.look.y += event.movementY * .0025;
      }
    });
    element.addEventListener('pointerup', () => { this.lastPointer = null; });
  }

  setMove(x, y) { this.move.x = clamp(x, -1, 1); this.move.y = clamp(y, -1, 1); }
  addLook(x, y) { this.look.x += x; this.look.y += y; }
  press(name) {
    this.buttons[name] = true;
    const code = name === 'jump' ? 'Space' : name === 'interact' ? 'KeyE' : name;
    this.justPressed.add(code);
  }
  release(name) { this.buttons[name] = false; }
  consume(name) {
    const code = name === 'jump' ? 'Space' : name === 'interact' ? 'KeyE' : name;
    const pressed = this.justPressed.has(code);
    this.justPressed.delete(code);
    return pressed;
  }
  held(name) {
    const code = name === 'sprint' ? 'ShiftLeft' : name === 'crouch' ? 'ControlLeft' : name;
    return this.buttons[name] || this.keys.has(code) || (name === 'sprint' && this.keys.has('ShiftRight'));
  }
  axis() {
    const x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const y = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    if (x || y) return { x, y };
    return { ...this.move };
  }
  endFrame() { this.look.x = 0; this.look.y = 0; this.justPressed.clear(); }
}

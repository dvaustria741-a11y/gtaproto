import { clamp } from '../utils/math.js';

const settingOptions = {
  graphics: ['Low', 'Medium', 'High'],
  renderDistance: ['Near', 'Medium', 'Far', 'Ultra'],
  worldCulling: ['Off', 'Balanced', 'Aggressive'],
  traffic: ['Low', 'Medium', 'High'],
  pedestrians: ['Low', 'Medium', 'High'],
  shadows: ['Off', 'Low', 'High'],
  reflections: ['Off', 'Low', 'High'],
  weather: ['On', 'Off'],
  dayNight: ['On', 'Off'],
  fpsCounter: ['On', 'Off']
};
const labels = { renderDistance: 'Render Distance', worldCulling: 'World Culling', dayNight: 'Day / Night', fpsCounter: 'FPS Counter' };

export class UI {
  constructor(input, callbacks, saveData) {
    this.input = input;
    this.callbacks = callbacks;
    this.settings = { ...saveData.settings };
    this.toastTimer = 0;
    this.dom = {
      loading: document.querySelector('#loading-screen'), loadingBar: document.querySelector('#loading-bar'), loadingStatus: document.querySelector('#loading-status'),
      main: document.querySelector('#main-menu'), pause: document.querySelector('#pause-menu'), settings: document.querySelector('#settings-panel'), controls: document.querySelector('#controls-panel'),
      hud: document.querySelector('#hud'), touch: document.querySelector('#touch-controls'), settingsList: document.querySelector('#settings-list'), objective: document.querySelector('#mission-objective'),
      clock: document.querySelector('#clock-readout'), weather: document.querySelector('#weather-readout'), healthMeter: document.querySelector('#health-meter'), healthValue: document.querySelector('#health-value'),
      staminaMeter: document.querySelector('#stamina-meter'), staminaValue: document.querySelector('#stamina-value'), money: document.querySelector('#money-value'), prompt: document.querySelector('#interaction-prompt'),
      toast: document.querySelector('#toast'), fps: document.querySelector('#fps-counter'), vehicleCard: document.querySelector('#vehicle-card'), vehicleName: document.querySelector('#vehicle-name'), speed: document.querySelector('#speed-value'), speedMeter: document.querySelector('#speed-meter'),
      minimap: document.querySelector('#minimap')
    };
    this.setupSettings();
    this.bindActions();
    this.bindTouchControls();
  }

  bindActions() {
    document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'play' || action === 'continue') { this.showGame(); this.callbacks.start(); }
      if (action === 'resume') this.resume();
      if (action === 'settings') this.dom.settings.classList.remove('hidden');
      if (action === 'controls') this.dom.controls.classList.remove('hidden');
      if (action === 'close-settings') this.dom.settings.classList.add('hidden');
      if (action === 'close-controls') this.dom.controls.classList.add('hidden');
      if (action === 'restart') { this.dom.pause.classList.add('hidden'); this.callbacks.restart(); }
      if (action === 'main-menu') { this.dom.pause.classList.add('hidden'); this.dom.hud.classList.add('hidden'); this.dom.main.classList.remove('hidden'); this.callbacks.pause(true); }
    }));
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.dom.settings.classList.contains('hidden') && this.dom.controls.classList.contains('hidden')) this.togglePause();
    });
  }

  setupSettings() {
    Object.entries(settingOptions).forEach(([key, values]) => {
      const row = document.createElement('div');
      row.className = 'setting-row';
      const label = document.createElement('label');
      label.textContent = labels[key] || key.replace(/([A-Z])/g, ' $1');
      const options = document.createElement('div');
      options.className = 'setting-options';
      values.forEach((value) => {
        const option = document.createElement('button');
        option.className = 'setting-option';
        option.textContent = value.toUpperCase();
        option.dataset.value = value;
        option.addEventListener('click', () => {
          this.settings[key] = value;
          options.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button === option));
          this.callbacks.settingChanged(key, value, this.settings);
        });
        options.appendChild(option);
        if (this.settings[key] === value) option.classList.add('active');
      });
      row.append(label, options);
      this.dom.settingsList.appendChild(row);
    });
  }

  bindTouchControls() {
    const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    if (!touchDevice) return;
    this.dom.touch.classList.remove('hidden');
    const stick = document.querySelector('#move-stick');
    const knob = stick.querySelector('.stick-knob');
    let stickPointer = null;
    const moveStick = (event) => {
      if (stickPointer !== event.pointerId) return;
      const rect = stick.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.min(45, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const x = Math.cos(angle) * length;
      const y = Math.sin(angle) * length;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      this.input.setMove(x / 45, -y / 45);
    };
    stick.addEventListener('pointerdown', (event) => { stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event); });
    stick.addEventListener('pointermove', moveStick);
    const releaseStick = () => { stickPointer = null; knob.style.transform = ''; this.input.setMove(0, 0); };
    stick.addEventListener('pointerup', releaseStick); stick.addEventListener('pointercancel', releaseStick);
    const pad = document.querySelector('#look-pad');
    let lookPointer = null; let last = null;
    pad.addEventListener('pointerdown', (event) => { lookPointer = event.pointerId; last = { x: event.clientX, y: event.clientY }; pad.setPointerCapture(event.pointerId); });
    pad.addEventListener('pointermove', (event) => { if (lookPointer !== event.pointerId || !last) return; this.input.addLook((event.clientX - last.x) * .009, (event.clientY - last.y) * .009); last = { x: event.clientX, y: event.clientY }; });
    const releaseLook = () => { lookPointer = null; last = null; };
    pad.addEventListener('pointerup', releaseLook); pad.addEventListener('pointercancel', releaseLook);
    document.querySelectorAll('[data-control]').forEach((button) => {
      const name = button.dataset.control;
      button.addEventListener('pointerdown', () => this.input.press(name));
      button.addEventListener('pointerup', () => this.input.release(name));
      button.addEventListener('pointercancel', () => this.input.release(name));
    });
  }

  setLoading(progress, status) { this.dom.loadingBar.style.width = `${progress * 100}%`; this.dom.loadingStatus.textContent = status; }
  finishLoading() { this.setLoading(1, 'READY TO EXPLORE'); setTimeout(() => { this.dom.loading.classList.add('hidden'); this.dom.main.classList.remove('hidden'); }, 500); }
  showGame() { this.dom.main.classList.add('hidden'); this.dom.pause.classList.add('hidden'); this.dom.hud.classList.remove('hidden'); }
  pause() { this.dom.pause.classList.remove('hidden'); this.dom.hud.classList.add('hidden'); this.callbacks.pause(true); }
  resume() { this.dom.pause.classList.add('hidden'); this.dom.hud.classList.remove('hidden'); this.callbacks.pause(false); }
  togglePause() { if (this.dom.pause.classList.contains('hidden')) this.pause(); else this.resume(); }
  notify(message) { this.dom.toast.textContent = message; this.dom.toast.classList.remove('hidden'); this.toastTimer = 3.3; }

  update(delta, state) {
    if (this.toastTimer > 0) { this.toastTimer -= delta; if (this.toastTimer <= 0) this.dom.toast.classList.add('hidden'); }
    this.dom.objective.textContent = state.objective;
    this.dom.clock.textContent = state.clock;
    this.dom.weather.textContent = state.weather.toUpperCase();
    this.dom.healthMeter.style.width = `${clamp(state.health, 0, 100)}%`;
    this.dom.healthValue.textContent = Math.round(state.health);
    this.dom.staminaMeter.style.width = `${clamp(state.stamina, 0, 100)}%`;
    this.dom.staminaValue.textContent = Math.round(state.stamina);
    this.dom.money.textContent = Number(state.money).toLocaleString('en-US');
    const nearby = state.nearbyVehicle;
    const prompt = state.activeVehicle ? 'E  EXIT VEHICLE' : nearby ? `E  ENTER ${nearby.spec.label}` : '';
    this.dom.prompt.textContent = prompt;
    this.dom.prompt.classList.toggle('hidden', !prompt);
    this.dom.vehicleCard.classList.toggle('hidden', !state.activeVehicle);
    if (state.activeVehicle) { this.dom.vehicleName.textContent = state.activeVehicle.spec.label; this.dom.speed.textContent = state.speed; this.dom.speedMeter.style.width = `${clamp(state.speed / 180 * 100, 0, 100)}%`; }
    this.dom.fps.classList.toggle('hidden', this.settings.fpsCounter !== 'On');
    if (this.settings.fpsCounter === 'On') this.dom.fps.textContent = `${state.fps} FPS`;
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const canvas = this.dom.minimap;
    const context = canvas.getContext('2d');
    const size = canvas.width;
    const scale = 0.38;
    context.clearRect(0, 0, size, size);
    context.fillStyle = '#0c2c31'; context.fillRect(0, 0, size, size);
    context.save();
    context.translate(size / 2 - state.position.x * scale, size / 2 - state.position.z * scale);
    context.strokeStyle = 'rgba(130,202,190,.44)'; context.lineWidth = 3;
    for (let p = -700; p <= 700; p += 120) { context.beginPath(); context.moveTo(-700 * scale, p * scale); context.lineTo(700 * scale, p * scale); context.stroke(); context.beginPath(); context.moveTo(p * scale, -700 * scale); context.lineTo(p * scale, 700 * scale); context.stroke(); }
    context.fillStyle = 'rgba(55,139,151,.62)'; context.fillRect(360 * scale, -700 * scale, 340 * scale, 1400 * scale);
    const marker = state.marker;
    context.fillStyle = '#ffb870'; context.beginPath(); context.arc(marker.x * scale, marker.z * scale, 5, 0, Math.PI * 2); context.fill();
    if (state.activeVehicle) { context.fillStyle = '#eac477'; context.fillRect(state.activeVehicle.position.x * scale - 3, state.activeVehicle.position.z * scale - 3, 6, 6); }
    context.restore();
    context.save(); context.translate(size / 2, size / 2); context.rotate(-state.heading); context.fillStyle = '#73e0ca'; context.beginPath(); context.moveTo(0, -8); context.lineTo(6, 7); context.lineTo(0, 4); context.lineTo(-6, 7); context.closePath(); context.fill(); context.restore();
  }
}

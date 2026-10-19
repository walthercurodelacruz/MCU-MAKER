/**
 * TinkercadElements.ts — Custom Web Components for classic Tinkercad parts:
 *   - <mcu-maker-gear-motor>: Iconic yellow TT hobby DC gear motor with spinning shaft.
 *   - <mcu-maker-light-bulb>: 12V incandescent light bulb with glowing filament and glass reflections.
 *   - <mcu-maker-flex-sensor>: 2.2" flexible bend sensor strip with variable resistance.
 *   - <mcu-maker-force-sensor>: Circular 0.5" Force Sensing Resistor (FSR) with pressure indicator.
 */

const STYLE = `
:host {
  display: inline-block;
  line-height: 0;
  position: relative;
  user-select: none;
}
.spin-active {
  animation: tt-motor-spin 0.6s linear infinite;
  transform-origin: 85px 40px;
}
@keyframes tt-motor-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.bulb-glow {
  transition: opacity 0.2s ease-in-out, filter 0.2s ease-in-out;
}
`;

// ── 1. Yellow TT Gear Motor ──────────────────────────────────────────────────
class GearMotorElement extends HTMLElement {
  static get observedAttributes() {
    return ['speed', 'running'];
  }

  readonly pinInfo = [
    { name: '+', x: 12, y: 28, number: 1, signals: [] as string[] },
    { name: '-', x: 12, y: 52, number: 2, signals: [] as string[] },
  ];

  private _speed = 0;
  private _running = false;

  get speed(): number {
    return this._speed;
  }
  set speed(val: number) {
    this._speed = Number(val) || 0;
    this._updateSpin();
  }

  get running(): boolean {
    return this._running;
  }
  set running(val: boolean) {
    this._running = Boolean(val);
    this._updateSpin();
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>${STYLE}</style>
      <svg width="120" height="80" viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="yellowBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fbbf24"/>
            <stop offset="60%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
          <linearGradient id="motorMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e2e8f0"/>
            <stop offset="50%" stop-color="#94a3b8"/>
            <stop offset="100%" stop-color="#64748b"/>
          </linearGradient>
          <linearGradient id="shaftWhite" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
        </defs>

        <!-- DC Motor Canister (rear) -->
        <rect x="10" y="24" width="34" height="32" rx="4" fill="url(#motorMetal)" stroke="#334155" stroke-width="1.2"/>
        <line x1="14" y1="28" x2="14" y2="52" stroke="#475569" stroke-width="1"/>
        <line x1="20" y1="28" x2="20" y2="52" stroke="#475569" stroke-width="1"/>

        <!-- Motor Terminals (+ and -) -->
        <rect x="4" y="24" width="8" height="8" rx="1.5" fill="#ef4444" stroke="#991b1b" stroke-width="1"/>
        <text x="8" y="30" font-family="sans-serif" font-size="7" font-weight="bold" fill="#ffffff" text-anchor="middle">+</text>
        <rect x="4" y="48" width="8" height="8" rx="1.5" fill="#334155" stroke="#0f172a" stroke-width="1"/>
        <text x="8" y="54" font-family="sans-serif" font-size="7" font-weight="bold" fill="#ffffff" text-anchor="middle">−</text>

        <!-- Main Yellow Gearbox Housing -->
        <path d="M 40 12 L 104 12 A 6 6 0 0 1 110 18 L 110 62 A 6 6 0 0 1 104 68 L 40 68 A 4 4 0 0 1 36 64 L 36 16 A 4 4 0 0 1 40 12 Z"
              fill="url(#yellowBody)" stroke="#b45309" stroke-width="1.8"/>

        <!-- Housing details & screws -->
        <circle cx="48" cy="20" r="2.8" fill="#78350f" stroke="#451a03" stroke-width="0.8"/>
        <circle cx="48" cy="60" r="2.8" fill="#78350f" stroke="#451a03" stroke-width="0.8"/>
        <rect x="56" y="22" width="16" height="36" rx="2" fill="#d97706" opacity="0.6"/>
        <line x1="64" y1="24" x2="64" y2="56" stroke="#b45309" stroke-width="1" stroke-dasharray="2,2"/>

        <!-- Gearbox Hub Bushing -->
        <circle cx="85" cy="40" r="16" fill="#d97706" stroke="#b45309" stroke-width="1.2"/>
        <circle cx="85" cy="40" r="13" fill="#fbbf24"/>

        <!-- Rotating Output Shaft / Cross -->
        <g id="shaftGroup" class="shaft-hub">
          <circle cx="85" cy="40" r="9" fill="url(#shaftWhite)" stroke="#64748b" stroke-width="1.2"/>
          <!-- D-shaft profile cutout -->
          <path d="M 81 35 L 89 35 A 6 6 0 0 1 89 45 L 81 45 Z" fill="#f97316"/>
          <!-- Orientation marker notches -->
          <line x1="85" y1="31" x2="85" y2="33" stroke="#ea580c" stroke-width="2" stroke-linecap="round"/>
          <line x1="85" y1="47" x2="85" y2="49" stroke="#ea580c" stroke-width="2" stroke-linecap="round"/>
          <line x1="76" y1="40" x2="78" y2="40" stroke="#ea580c" stroke-width="2" stroke-linecap="round"/>
          <line x1="92" y1="40" x2="94" y2="40" stroke="#ea580c" stroke-width="2" stroke-linecap="round"/>
        </g>

        <!-- Brand Text -->
        <text x="56" y="75" font-family="sans-serif" font-size="6.5" font-weight="bold" fill="#78350f">TT 1:48</text>
      </svg>
    `;
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string) {
    if (name === 'speed') this.speed = Number(newVal);
    if (name === 'running') this.running = newVal === 'true' || newVal === '';
  }

  private _updateSpin() {
    const shaft = this.shadowRoot?.getElementById('shaftGroup');
    if (!shaft) return;
    const shouldSpin = this._running || Math.abs(this._speed) > 0;
    if (shouldSpin) {
      shaft.classList.add('spin-active');
      const dur = Math.max(0.15, 1.2 - (Math.abs(this._speed) || 50) / 100);
      shaft.style.animationDuration = `${dur}s`;
      shaft.style.animationDirection = this._speed < 0 ? 'reverse' : 'normal';
    } else {
      shaft.classList.remove('spin-active');
    }
  }
}

// ── 2. Incandescent Light Bulb ───────────────────────────────────────────────
class LightBulbElement extends HTMLElement {
  static get observedAttributes() {
    return ['lit', 'brightness', 'voltage'];
  }

  readonly pinInfo = [
    { name: '1', x: 22, y: 92, number: 1, signals: [] as string[] },
    { name: '2', x: 42, y: 92, number: 2, signals: [] as string[] },
  ];

  private _lit = false;
  private _brightness = 0;

  get lit(): boolean {
    return this._lit;
  }
  set lit(val: boolean) {
    this._lit = Boolean(val);
    this._updateGlow();
  }

  get brightness(): number {
    return this._brightness;
  }
  set brightness(val: number) {
    this._brightness = Number(val) || 0;
    this._updateGlow();
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>${STYLE}</style>
      <svg width="64" height="96" viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="bulbGlowGrad" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stop-color="#fffbeb" stop-opacity="0.95"/>
            <stop offset="30%" stop-color="#fde047" stop-opacity="0.85"/>
            <stop offset="70%" stop-color="#f59e0b" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="screwMetal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#64748b"/>
            <stop offset="40%" stop-color="#cbd5e1"/>
            <stop offset="80%" stop-color="#94a3b8"/>
            <stop offset="100%" stop-color="#475569"/>
          </linearGradient>
          <filter id="bulbBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5"/>
          </filter>
        </defs>

        <!-- Ambient Warm Glow (Active when lit) -->
        <circle id="bulbGlow" class="bulb-glow" cx="32" cy="34" r="28" fill="url(#bulbGlowGrad)" filter="url(#bulbBlur)" opacity="0"/>

        <!-- Glass Dome Outline & Shading -->
        <path d="M 32 8 C 16 8 10 22 10 36 C 10 48 20 54 22 64 L 42 64 C 44 54 54 48 54 36 C 54 22 48 8 32 8 Z"
              fill="#f8fafc" fill-opacity="0.35" stroke="#94a3b8" stroke-width="1.5"/>

        <!-- Filament Support Posts -->
        <line x1="26" y1="64" x2="28" y2="34" stroke="#64748b" stroke-width="1.2"/>
        <line x1="38" y1="64" x2="36" y2="34" stroke="#64748b" stroke-width="1.2"/>

        <!-- Tungsten Filament Coil -->
        <path id="filamentCoil" d="M 28 34 Q 32 26 36 34" fill="none" stroke="#b45309" stroke-width="1.6" stroke-linecap="round"/>

        <!-- Glass Specular Reflection Highlight -->
        <path d="M 16 24 C 18 16 26 12 32 12" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>

        <!-- Screw Base (Metallic threaded Edison socket) -->
        <rect x="22" y="64" width="20" height="4" rx="1.5" fill="url(#screwMetal)" stroke="#334155" stroke-width="0.8"/>
        <rect x="21" y="68" width="22" height="4" rx="1.5" fill="url(#screwMetal)" stroke="#334155" stroke-width="0.8"/>
        <rect x="22" y="72" width="20" height="4" rx="1.5" fill="url(#screwMetal)" stroke="#334155" stroke-width="0.8"/>
        <rect x="21" y="76" width="22" height="4" rx="1.5" fill="url(#screwMetal)" stroke="#334155" stroke-width="0.8"/>
        <path d="M 24 80 L 40 80 L 37 86 L 27 86 Z" fill="#1e293b"/>

        <!-- Bottom Contact Foot -->
        <circle cx="32" cy="87" r="4" fill="#94a3b8" stroke="#334155" stroke-width="1"/>

        <!-- Connection Terminal Pins -->
        <line x1="22" y1="84" x2="22" y2="92" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
        <line x1="42" y1="84" x2="42" y2="92" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
        <circle cx="22" cy="92" r="1.8" fill="#38bdf8"/>
        <circle cx="42" cy="92" r="1.8" fill="#38bdf8"/>
      </svg>
    `;
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string) {
    if (name === 'lit') this.lit = newVal === 'true' || newVal === '';
    if (name === 'brightness') this.brightness = Number(newVal);
  }

  private _updateGlow() {
    const glow = this.shadowRoot?.getElementById('bulbGlow');
    const filament = this.shadowRoot?.getElementById('filamentCoil');
    if (!glow || !filament) return;
    const isLit = this._lit || this._brightness > 0;
    if (isLit) {
      const alpha = this._brightness > 0 ? Math.min(1, Math.max(0.2, this._brightness / 100)) : 0.9;
      glow.style.opacity = `${alpha}`;
      filament.setAttribute('stroke', '#fef08a');
      filament.setAttribute('stroke-width', '2.4');
    } else {
      glow.style.opacity = '0';
      filament.setAttribute('stroke', '#b45309');
      filament.setAttribute('stroke-width', '1.6');
    }
  }
}

// ── 3. Flex Bend Sensor Strip ────────────────────────────────────────────────
class FlexSensorElement extends HTMLElement {
  static get observedAttributes() {
    return ['bend'];
  }

  readonly pinInfo = [
    { name: '1', x: 12, y: 136, number: 1, signals: [] as string[] },
    { name: '2', x: 24, y: 136, number: 2, signals: [] as string[] },
  ];

  private _bend = 0;

  get bend(): number {
    return this._bend;
  }
  set bend(val: number) {
    this._bend = Math.max(0, Math.min(180, Number(val) || 0));
    this._updateBendVisual();
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>${STYLE}</style>
      <svg width="36" height="142" viewBox="0 0 36 142" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="flexBase" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="50%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>
          <linearGradient id="silverPin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f8fafc"/>
            <stop offset="100%" stop-color="#94a3b8"/>
          </linearGradient>
        </defs>

        <!-- Flexible Substrate Strip -->
        <rect id="stripBody" x="8" y="8" width="20" height="114" rx="4" fill="url(#flexBase)" stroke="#0284c7" stroke-width="1"/>

        <!-- Conductive Carbon / Ink Segments (8 segments) -->
        <rect x="11" y="16" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>
        <rect x="11" y="27" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>
        <rect x="11" y="38" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>
        <rect x="11" y="49" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>
        <rect x="11" y="60" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>
        <rect x="11" y="71" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>
        <rect x="11" y="82" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>
        <rect x="11" y="93" width="14" height="6" rx="1" fill="#475569" stroke="#94a3b8" stroke-width="0.6"/>

        <!-- Bend Indicator Arc / Text -->
        <text id="bendLabel" x="18" y="112" font-family="sans-serif" font-size="7" font-weight="bold" fill="#38bdf8" text-anchor="middle">0°</text>

        <!-- Base Stiffener Block -->
        <rect x="6" y="116" width="24" height="10" rx="2" fill="#0f172a" stroke="#475569" stroke-width="1"/>

        <!-- Terminal Connector Solder Pins -->
        <line x1="12" y1="126" x2="12" y2="136" stroke="url(#silverPin)" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="24" y1="126" x2="24" y2="136" stroke="url(#silverPin)" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="12" cy="136" r="1.6" fill="#38bdf8"/>
        <circle cx="24" cy="136" r="1.6" fill="#38bdf8"/>
      </svg>
    `;
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string) {
    if (name === 'bend') this.bend = Number(newVal);
  }

  private _updateBendVisual() {
    const label = this.shadowRoot?.getElementById('bendLabel');
    const strip = this.shadowRoot?.getElementById('stripBody');
    if (label) label.textContent = `${Math.round(this._bend)}°`;
    if (strip) {
      if (this._bend > 45) {
        strip.setAttribute('stroke', '#f59e0b');
        strip.setAttribute('stroke-width', '1.6');
      } else {
        strip.setAttribute('stroke', '#0284c7');
        strip.setAttribute('stroke-width', '1');
      }
    }
  }
}

// ── 4. Force Sensitive Resistor (FSR) ────────────────────────────────────────
class ForceSensorElement extends HTMLElement {
  static get observedAttributes() {
    return ['force'];
  }

  readonly pinInfo = [
    { name: '1', x: 22, y: 126, number: 1, signals: [] as string[] },
    { name: '2', x: 34, y: 126, number: 2, signals: [] as string[] },
  ];

  private _force = 0;

  get force(): number {
    return this._force;
  }
  set force(val: number) {
    this._force = Math.max(0, Number(val) || 0);
    this._updateForceVisual();
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>${STYLE}</style>
      <svg width="56" height="132" viewBox="0 0 56 132" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="fsrDisc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#334155"/>
            <stop offset="70%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </radialGradient>
          <radialGradient id="pressureGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9"/>
            <stop offset="60%" stop-color="#0284c7" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#0369a1" stop-opacity="0"/>
          </radialGradient>
        </defs>

        <!-- Round Sensor Head Outer Bezel -->
        <circle cx="28" cy="28" r="24" fill="#0f172a" stroke="#475569" stroke-width="1.8"/>

        <!-- Active Pressure Area Disc -->
        <circle cx="28" cy="28" r="20" fill="url(#fsrDisc)" stroke="#38bdf8" stroke-width="1.2"/>

        <!-- Pressure Active Glow (visible under load) -->
        <circle id="forceGlow" cx="28" cy="28" r="18" fill="url(#pressureGlow)" opacity="0"/>

        <!-- Interdigitated Grid Pattern (FSR fingers) -->
        <line x1="16" y1="20" x2="38" y2="20" stroke="#94a3b8" stroke-width="1"/>
        <line x1="18" y1="24" x2="40" y2="24" stroke="#94a3b8" stroke-width="1"/>
        <line x1="16" y1="28" x2="38" y2="28" stroke="#94a3b8" stroke-width="1"/>
        <line x1="18" y1="32" x2="40" y2="32" stroke="#94a3b8" stroke-width="1"/>
        <line x1="16" y1="36" x2="38" y2="36" stroke="#94a3b8" stroke-width="1"/>

        <!-- Force readout text -->
        <text id="forceLabel" x="28" y="31" font-family="sans-serif" font-size="8" font-weight="bold" fill="#f8fafc" text-anchor="middle">0N</text>

        <!-- Flexible Neck Ribbon -->
        <path d="M 22 51 L 22 108 L 34 108 L 34 51 Z" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        <line x1="25" y1="52" x2="25" y2="108" stroke="#0284c7" stroke-width="0.8"/>
        <line x1="31" y1="52" x2="31" y2="108" stroke="#0284c7" stroke-width="0.8"/>

        <!-- Terminal Stiffener Collar -->
        <rect x="18" y="108" width="20" height="10" rx="2" fill="#0f172a" stroke="#475569" stroke-width="1"/>

        <!-- Solder Tail Pins -->
        <line x1="22" y1="118" x2="22" y2="126" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="34" y1="118" x2="34" y2="126" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="22" cy="126" r="1.6" fill="#38bdf8"/>
        <circle cx="34" cy="126" r="1.6" fill="#38bdf8"/>
      </svg>
    `;
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string) {
    if (name === 'force') this.force = Number(newVal);
  }

  private _updateForceVisual() {
    const label = this.shadowRoot?.getElementById('forceLabel');
    const glow = this.shadowRoot?.getElementById('forceGlow');
    if (label) label.textContent = `${this._force.toFixed(1)}N`;
    if (glow) {
      const alpha = Math.min(1, this._force / 8);
      glow.style.opacity = `${alpha}`;
    }
  }
}

// ── Custom Elements Registration ─────────────────────────────────────────────
if (!customElements.get('mcu-maker-gear-motor')) {
  if (!customElements.get('mcu-maker-gear-motor')) {
  customElements.define('mcu-maker-gear-motor', GearMotorElement);
}
if (!customElements.get('mcu-maker-gear-motor')) {
  customElements.define('mcu-maker-gear-motor', class extends GearMotorElement {});
}
}
if (!customElements.get('mcu-maker-light-bulb')) {
  if (!customElements.get('mcu-maker-light-bulb')) {
  customElements.define('mcu-maker-light-bulb', LightBulbElement);
}
if (!customElements.get('mcu-maker-light-bulb')) {
  customElements.define('mcu-maker-light-bulb', class extends LightBulbElement {});
}
}
if (!customElements.get('mcu-maker-flex-sensor')) {
  if (!customElements.get('mcu-maker-flex-sensor')) {
  customElements.define('mcu-maker-flex-sensor', FlexSensorElement);
}
if (!customElements.get('mcu-maker-flex-sensor')) {
  customElements.define('mcu-maker-flex-sensor', class extends FlexSensorElement {});
}
}
if (!customElements.get('mcu-maker-force-sensor')) {
  if (!customElements.get('mcu-maker-force-sensor')) {
  customElements.define('mcu-maker-force-sensor', ForceSensorElement);
}
if (!customElements.get('mcu-maker-force-sensor')) {
  customElements.define('mcu-maker-force-sensor', class extends ForceSensorElement {});
}
}

export {
  GearMotorElement,
  LightBulbElement,
  FlexSensorElement,
  ForceSensorElement,
};

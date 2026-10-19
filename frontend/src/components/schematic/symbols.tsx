import React from 'react';
import type { SchematicComponentDef, SchematicRenderProps, SchematicPin } from './types';

// Standard stroke and styling constants
const STROKE_COLOR = 'currentColor';
const STROKE_WIDTH = 2;
const FILL_COLOR = 'var(--sch-symbol-fill, var(--wb-2, #181b24))';

/** Resistor (IEEE Zigzag symbol) */
export const ResistorDef: SchematicComponentDef = {
  type: 'wokwi-resistor',
  designatorPrefix: 'R',
  displayName: 'Resistor',
  width: 70,
  height: 30,
  pins: [
    { name: '1', label: '1', x: 0, y: 15, direction: 'left' },
    { name: '2', label: '2', x: 70, y: 15, direction: 'right' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-resistor">
      {/* Terminals */}
      <line x1="0" y1="15" x2="15" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="55" y1="15" x2="70" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Zigzag */}
      <polyline
        points="15,15 19,7 27,23 35,7 43,23 51,7 55,15"
        fill="none"
        stroke={STROKE_COLOR}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Labels */}
      <text x="35" y="-3" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="35" y="32" textAnchor="middle" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Potentiometer */
export const PotentiometerDef: SchematicComponentDef = {
  type: 'wokwi-potentiometer',
  designatorPrefix: 'RV',
  displayName: 'Potentiometer',
  width: 70,
  height: 45,
  pins: [
    { name: '1', label: '1', x: 0, y: 15, direction: 'left' },
    { name: '2', label: 'W', x: 35, y: 45, direction: 'bottom' },
    { name: '3', label: '3', x: 70, y: 15, direction: 'right' },
    { name: 'sig', label: 'W', x: 35, y: 45, direction: 'bottom' },
    { name: 'vcc', label: '1', x: 0, y: 15, direction: 'left' },
    { name: 'gnd', label: '3', x: 70, y: 15, direction: 'right' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-potentiometer">
      <line x1="0" y1="15" x2="15" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="55" y1="15" x2="70" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <polyline
        points="15,15 19,7 27,23 35,7 43,23 51,7 55,15"
        fill="none"
        stroke={STROKE_COLOR}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow wiper */}
      <line x1="35" y1="45" x2="35" y2="25" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <polygon points="35,21 31,27 39,27" fill={STROKE_COLOR} />
      <text x="35" y="-3" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="50" y="42" textAnchor="start" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Ceramic Capacitor */
export const CapacitorDef: SchematicComponentDef = {
  type: 'capacitor',
  designatorPrefix: 'C',
  displayName: 'Capacitor',
  width: 50,
  height: 30,
  pins: [
    { name: '1', label: '1', x: 0, y: 15, direction: 'left' },
    { name: '2', label: '2', x: 50, y: 15, direction: 'right' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-capacitor">
      <line x1="0" y1="15" x2="21" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="29" y1="15" x2="50" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="21" y1="5" x2="21" y2="25" stroke={STROKE_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <line x1="29" y1="5" x2="29" y2="25" stroke={STROKE_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <text x="25" y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="25" y="34" textAnchor="middle" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Electrolytic Capacitor (Polarized) */
export const CapacitorElectrolyticDef: SchematicComponentDef = {
  type: 'capacitor-electrolytic',
  designatorPrefix: 'C',
  displayName: 'Electrolytic Cap',
  width: 50,
  height: 30,
  pins: [
    { name: '1', label: '+', x: 0, y: 15, direction: 'left' },
    { name: '2', label: '-', x: 50, y: 15, direction: 'right' },
    { name: 'pos', label: '+', x: 0, y: 15, direction: 'left' },
    { name: 'neg', label: '-', x: 50, y: 15, direction: 'right' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-capacitor-elec">
      <line x1="0" y1="15" x2="21" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="29" y1="15" x2="50" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Flat anode plate */}
      <line x1="21" y1="5" x2="21" y2="25" stroke={STROKE_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      {/* Curved cathode plate */}
      <path d="M 28,5 Q 31,15 28,25" fill="none" stroke={STROKE_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <text x="14" y="11" textAnchor="middle" fill="#00e5ff" fontSize="10" fontWeight="bold">+</text>
      <text x="25" y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="25" y="34" textAnchor="middle" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Inductor */
export const InductorDef: SchematicComponentDef = {
  type: 'inductor',
  designatorPrefix: 'L',
  displayName: 'Inductor',
  width: 60,
  height: 30,
  pins: [
    { name: '1', label: '1', x: 0, y: 15, direction: 'left' },
    { name: '2', label: '2', x: 60, y: 15, direction: 'right' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-inductor">
      <line x1="0" y1="15" x2="12" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="48" y1="15" x2="60" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* 3 Coils */}
      <path
        d="M 12,15 A 6,6 0 0,1 24,15 A 6,6 0 0,1 36,15 A 6,6 0 0,1 48,15"
        fill="none"
        stroke={STROKE_COLOR}
        strokeWidth={STROKE_WIDTH}
      />
      <text x="30" y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="30" y="30" textAnchor="middle" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Diode */
export const DiodeDef: SchematicComponentDef = {
  type: 'diode',
  designatorPrefix: 'D',
  displayName: 'Diode',
  width: 50,
  height: 30,
  pins: [
    { name: '1', label: 'A', x: 0, y: 15, direction: 'left' },
    { name: '2', label: 'K', x: 50, y: 15, direction: 'right' },
    { name: 'anode', label: 'A', x: 0, y: 15, direction: 'left' },
    { name: 'cathode', label: 'K', x: 50, y: 15, direction: 'right' },
    { name: 'a', label: 'A', x: 0, y: 15, direction: 'left' },
    { name: 'c', label: 'K', x: 50, y: 15, direction: 'right' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-diode">
      <line x1="0" y1="15" x2="18" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="32" y1="15" x2="50" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Triangle */}
      <polygon points="18,7 18,23 32,15" fill={STROKE_COLOR} stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Cathode bar */}
      <line x1="32" y1="7" x2="32" y2="23" stroke={STROKE_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <text x="25" y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="25" y="32" textAnchor="middle" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** LED (Light Emitting Diode) */
export const LedDef: SchematicComponentDef = {
  type: 'wokwi-led',
  designatorPrefix: 'LED',
  displayName: 'LED',
  width: 50,
  height: 36,
  pins: [
    { name: 'A', label: 'A', x: 0, y: 18, direction: 'left' },
    { name: 'C', label: 'K', x: 50, y: 18, direction: 'right' },
    { name: 'anode', label: 'A', x: 0, y: 18, direction: 'left' },
    { name: 'cathode', label: 'K', x: 50, y: 18, direction: 'right' },
    { name: '1', label: 'A', x: 0, y: 18, direction: 'left' },
    { name: '2', label: 'K', x: 50, y: 18, direction: 'right' },
  ],
  render: ({ designator, properties }: SchematicRenderProps) => {
    const ledColor = String(properties?.color ?? 'red').toLowerCase();
    const tintColor = ledColor === 'green' ? '#22c55e' : ledColor === 'blue' ? '#3b82f6' : ledColor === 'yellow' ? '#eab308' : '#ef4444';
    return (
      <g className="sch-symbol sch-led">
        <line x1="0" y1="18" x2="18" y2="18" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
        <line x1="32" y1="18" x2="50" y2="18" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
        <polygon points="18,10 18,26 32,18" fill={tintColor} stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
        <line x1="32" y1="10" x2="32" y2="26" stroke={STROKE_COLOR} strokeWidth={2.5} strokeLinecap="round" />
        {/* Light emission arrows */}
        <line x1="24" y1="9" x2="29" y2="2" stroke={tintColor} strokeWidth="1.5" />
        <polygon points="31,0 27,2 29,5" fill={tintColor} />
        <line x1="29" y1="12" x2="34" y2="5" stroke={tintColor} strokeWidth="1.5" />
        <polygon points="36,3 32,5 34,8" fill={tintColor} />
        <text x="25" y="-3" textAnchor="middle" className="sch-ref-label">{designator}</text>
      </g>
    );
  },
};

/** Transistor BJT NPN */
export const TransistorNpnDef: SchematicComponentDef = {
  type: 'bjt-2n2222',
  designatorPrefix: 'Q',
  displayName: 'NPN Transistor',
  width: 50,
  height: 50,
  pins: [
    { name: 'B', label: 'B', x: 0, y: 25, direction: 'left' },
    { name: 'C', label: 'C', x: 38, y: 0, direction: 'top' },
    { name: 'E', label: 'E', x: 38, y: 50, direction: 'bottom' },
    { name: 'base', label: 'B', x: 0, y: 25, direction: 'left' },
    { name: 'collector', label: 'C', x: 38, y: 0, direction: 'top' },
    { name: 'emitter', label: 'E', x: 38, y: 50, direction: 'bottom' },
    { name: '1', label: 'E', x: 38, y: 50, direction: 'bottom' },
    { name: '2', label: 'B', x: 0, y: 25, direction: 'left' },
    { name: '3', label: 'C', x: 38, y: 0, direction: 'top' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-npn">
      {/* Circle */}
      <circle cx="27" cy="25" r="18" fill="none" stroke={STROKE_COLOR} strokeWidth="1.5" opacity="0.6" />
      {/* Base */}
      <line x1="0" y1="25" x2="20" y2="25" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="20" y1="14" x2="20" y2="36" stroke={STROKE_COLOR} strokeWidth="2.8" strokeLinecap="round" />
      {/* Collector */}
      <line x1="20" y1="18" x2="38" y2="8" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="38" y1="8" x2="38" y2="0" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Emitter with arrow pointing OUT */}
      <line x1="20" y1="32" x2="38" y2="42" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="38" y1="42" x2="38" y2="50" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <polygon points="36,41 29,34 32,41" fill={STROKE_COLOR} />
      <text x="27" y="-5" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="50" y="27" textAnchor="start" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Transistor BJT PNP */
export const TransistorPnpDef: SchematicComponentDef = {
  type: 'bjt-2n3906',
  designatorPrefix: 'Q',
  displayName: 'PNP Transistor',
  width: 50,
  height: 50,
  pins: [
    { name: 'B', label: 'B', x: 0, y: 25, direction: 'left' },
    { name: 'E', label: 'E', x: 38, y: 0, direction: 'top' },
    { name: 'C', label: 'C', x: 38, y: 50, direction: 'bottom' },
    { name: 'base', label: 'B', x: 0, y: 25, direction: 'left' },
    { name: 'emitter', label: 'E', x: 38, y: 0, direction: 'top' },
    { name: 'collector', label: 'C', x: 38, y: 50, direction: 'bottom' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-pnp">
      <circle cx="27" cy="25" r="18" fill="none" stroke={STROKE_COLOR} strokeWidth="1.5" opacity="0.6" />
      <line x1="0" y1="25" x2="20" y2="25" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="20" y1="14" x2="20" y2="36" stroke={STROKE_COLOR} strokeWidth="2.8" strokeLinecap="round" />
      <line x1="20" y1="18" x2="38" y2="8" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="38" y1="8" x2="38" y2="0" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Emitter with arrow pointing IN towards base */}
      <polygon points="23,19 28,14 31,21" fill={STROKE_COLOR} />
      <line x1="20" y1="32" x2="38" y2="42" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="38" y1="42" x2="38" y2="50" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <text x="27" y="-5" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="50" y="27" textAnchor="start" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Pushbutton (Normally open switch) */
export const PushbuttonDef: SchematicComponentDef = {
  type: 'wokwi-pushbutton',
  designatorPrefix: 'SW',
  displayName: 'Pushbutton',
  width: 50,
  height: 30,
  pins: [
    { name: '1.l', label: '1', x: 0, y: 15, direction: 'left' },
    { name: '2.r', label: '2', x: 50, y: 15, direction: 'right' },
    { name: '1', label: '1', x: 0, y: 15, direction: 'left' },
    { name: '2', label: '2', x: 50, y: 15, direction: 'right' },
  ],
  render: ({ designator }: SchematicRenderProps) => (
    <g className="sch-symbol sch-pushbutton">
      <line x1="0" y1="15" x2="16" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="34" y1="15" x2="50" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <circle cx="16" cy="15" r="2.5" fill="none" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <circle cx="34" cy="15" r="2.5" fill="none" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Push plate and shaft */}
      <line x1="14" y1="9" x2="36" y2="9" stroke={STROKE_COLOR} strokeWidth={2.5} />
      <line x1="25" y1="9" x2="25" y2="2" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <text x="25" y="-4" textAnchor="middle" className="sch-ref-label">{designator}</text>
    </g>
  ),
};

/** Slide Switch (SPDT) */
export const SlideSwitchDef: SchematicComponentDef = {
  type: 'slide-switch',
  designatorPrefix: 'SW',
  displayName: 'Slide Switch',
  width: 50,
  height: 40,
  pins: [
    { name: '1', label: '1', x: 50, y: 10, direction: 'right' },
    { name: '2', label: 'COM', x: 0, y: 20, direction: 'left' },
    { name: '3', label: '2', x: 50, y: 30, direction: 'right' },
    { name: 'com', label: 'COM', x: 0, y: 20, direction: 'left' },
  ],
  render: ({ designator }: SchematicRenderProps) => (
    <g className="sch-symbol sch-switch-spdt">
      <line x1="0" y1="20" x2="16" y2="20" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <circle cx="16" cy="20" r="2.5" fill="none" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <circle cx="34" cy="10" r="2.5" fill="none" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="36.5" y1="10" x2="50" y2="10" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <circle cx="34" cy="30" r="2.5" fill="none" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="36.5" y1="30" x2="50" y2="30" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Switch arm thrown to pin 1 */}
      <line x1="17" y1="19" x2="33" y2="11" stroke={STROKE_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <text x="25" y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
    </g>
  ),
};

/** Battery / DC Voltage Source */
export const BatteryDef: SchematicComponentDef = {
  type: 'battery-9v',
  designatorPrefix: 'BT',
  displayName: 'Battery',
  width: 50,
  height: 40,
  pins: [
    { name: 'pos', label: '+', x: 0, y: 20, direction: 'left' },
    { name: 'neg', label: '-', x: 50, y: 20, direction: 'right' },
    { name: '+', label: '+', x: 0, y: 20, direction: 'left' },
    { name: '-', label: '-', x: 50, y: 20, direction: 'right' },
    { name: '1', label: '+', x: 0, y: 20, direction: 'left' },
    { name: '2', label: '-', x: 50, y: 20, direction: 'right' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-battery">
      <line x1="0" y1="20" x2="20" y2="20" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="30" y1="20" x2="50" y2="20" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Long positive plate */}
      <line x1="20" y1="8" x2="20" y2="32" stroke={STROKE_COLOR} strokeWidth="2.8" strokeLinecap="round" />
      {/* Short thick negative plate */}
      <line x1="30" y1="13" x2="30" y2="27" stroke={STROKE_COLOR} strokeWidth="4.5" strokeLinecap="round" />
      <text x="13" y="14" textAnchor="middle" fill="#00e5ff" fontSize="11" fontWeight="bold">+</text>
      <text x="25" y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="25" y="42" textAnchor="middle" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Buzzer / Sounder */
export const BuzzerDef: SchematicComponentDef = {
  type: 'buzzer',
  designatorPrefix: 'BZ',
  displayName: 'Buzzer',
  width: 45,
  height: 40,
  pins: [
    { name: '1', label: '+', x: 12, y: 40, direction: 'bottom' },
    { name: '2', label: '-', x: 33, y: 40, direction: 'bottom' },
  ],
  render: ({ designator }: SchematicRenderProps) => (
    <g className="sch-symbol sch-buzzer">
      {/* Cylinder sounder body */}
      <circle cx="22.5" cy="18" r="14" fill={FILL_COLOR} stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <path d="M 15,18 L 30,18 M 22.5,10 L 22.5,26" stroke={STROKE_COLOR} strokeWidth="1.5" />
      <line x1="12" y1="40" x2="12" y2="31" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="33" y1="40" x2="33" y2="31" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <text x="22.5" y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
    </g>
  ),
};

/** Operational Amplifier (OpAmp LM358 / LM741) */
export const OpAmpDef: SchematicComponentDef = {
  type: 'opamp-lm358',
  designatorPrefix: 'U',
  displayName: 'Op-Amp',
  width: 70,
  height: 50,
  pins: [
    { name: 'in_pos', label: '+', x: 0, y: 15, direction: 'left' },
    { name: 'in_neg', label: '-', x: 0, y: 35, direction: 'left' },
    { name: 'out', label: 'OUT', x: 70, y: 25, direction: 'right' },
    { name: 'v_pos', label: 'V+', x: 35, y: 0, direction: 'top' },
    { name: 'v_neg', label: 'V-', x: 35, y: 50, direction: 'bottom' },
    { name: '1', label: 'OUT', x: 70, y: 25, direction: 'right' },
    { name: '2', label: '-', x: 0, y: 35, direction: 'left' },
    { name: '3', label: '+', x: 0, y: 15, direction: 'left' },
  ],
  render: ({ designator, value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-opamp">
      <polygon points="15,5 15,45 55,25" fill={FILL_COLOR} stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
      {/* Inputs and Output */}
      <line x1="0" y1="15" x2="15" y2="15" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="0" y1="35" x2="15" y2="35" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="55" y1="25" x2="70" y2="25" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      {/* Signs */}
      <text x="20" y="19" fontSize="12" fill={STROKE_COLOR} fontWeight="bold">+</text>
      <text x="20" y="38" fontSize="14" fill={STROKE_COLOR} fontWeight="bold">-</text>
      <text x="35" y="-3" textAnchor="middle" className="sch-ref-label">{designator}</text>
      {value && <text x="35" y="62" textAnchor="middle" className="sch-val-label">{value}</text>}
    </g>
  ),
};

/** Ground Symbol (GND) */
export const GroundDef: SchematicComponentDef = {
  type: 'schematic-gnd',
  designatorPrefix: 'GND',
  displayName: 'Ground',
  width: 24,
  height: 24,
  pins: [
    { name: 'GND', label: '', x: 12, y: 0, direction: 'top' },
  ],
  render: () => (
    <g className="sch-symbol sch-gnd">
      <line x1="12" y1="0" x2="12" y2="10" stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
      <line x1="2" y1="10" x2="22" y2="10" stroke={STROKE_COLOR} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="6" y1="15" x2="18" y2="15" stroke={STROKE_COLOR} strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="20" x2="15" y2="20" stroke={STROKE_COLOR} strokeWidth="1.5" strokeLinecap="round" />
      <text x="12" y="30" textAnchor="middle" fontSize="9" fill="var(--wb-10)">GND</text>
    </g>
  ),
};

/** Power Rail Symbol (VCC / 5V / 3.3V) */
export const PowerRailDef: SchematicComponentDef = {
  type: 'schematic-vcc',
  designatorPrefix: 'PWR',
  displayName: 'Power Rail',
  width: 24,
  height: 24,
  pins: [
    { name: 'VCC', label: '', x: 12, y: 24, direction: 'bottom' },
  ],
  render: ({ value }: SchematicRenderProps) => (
    <g className="sch-symbol sch-vcc">
      <line x1="12" y1="24" x2="12" y2="10" stroke="#00e5ff" strokeWidth={STROKE_WIDTH} />
      <polygon points="12,2 6,10 18,10" fill="#00e5ff" />
      <text x="12" y="-2" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#00e5ff">{value || 'VCC'}</text>
    </g>
  ),
};

/** Generic IC / Module Schematic Box */
export function createBoxSymbolDef(
  type: string,
  prefix: string,
  name: string,
  leftPins: Array<{ name: string; label?: string; aliases?: string[] }>,
  rightPins: Array<{ name: string; label?: string; aliases?: string[] }>,
  customWidth = 140,
): SchematicComponentDef {
  const pinRows = Math.max(leftPins.length, rightPins.length, 2);
  const rowHeight = 22;
  const height = pinRows * rowHeight + 36;
  const width = customWidth;

  const pins: SchematicPin[] = [];

  leftPins.forEach((p, idx) => {
    pins.push({
      name: p.name,
      label: p.label || p.name,
      aliases: p.aliases,
      x: 0,
      y: 30 + idx * rowHeight,
      direction: 'left',
    });
  });

  rightPins.forEach((p, idx) => {
    pins.push({
      name: p.name,
      label: p.label || p.name,
      aliases: p.aliases,
      x: width,
      y: 30 + idx * rowHeight,
      direction: 'right',
    });
  });

  return {
    type,
    designatorPrefix: prefix,
    displayName: name,
    width,
    height,
    pins,
    render: ({ designator, value }: SchematicRenderProps) => (
      <g className="sch-symbol sch-box-ic">
        {/* Main IC body box */}
        <rect
          x="15"
          y="10"
          width={width - 30}
          height={height - 20}
          rx="4"
          fill={FILL_COLOR}
          stroke={STROKE_COLOR}
          strokeWidth={STROKE_WIDTH}
        />
        {/* Top notch */}
        <path d={`M ${width / 2 - 6},10 A 6,6 0 0,0 ${width / 2 + 6},10`} fill="none" stroke={STROKE_COLOR} strokeWidth="1.5" />
        {/* Title Header */}
        <text x={width / 2} y="-2" textAnchor="middle" className="sch-ref-label">{designator}</text>
        <text x={width / 2} y="24" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--sch-ic-title, var(--color-action-primary, #00e5ff))">
          {value || name}
        </text>

        {/* Left Pins */}
        {leftPins.map((p, idx) => {
          const y = 30 + idx * rowHeight;
          return (
            <g key={p.name}>
              <line x1="0" y1={y} x2="15" y2={y} stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
              <text x="18" y={y + 3.5} textAnchor="start" fontSize="9" fill="var(--sch-pin-label, var(--wb-12, #cbd5e1))">
                {p.label || p.name}
              </text>
            </g>
          );
        })}

        {/* Right Pins */}
        {rightPins.map((p, idx) => {
          const y = 30 + idx * rowHeight;
          return (
            <g key={p.name}>
              <line x1={width - 15} y1={y} x2={width} y2={y} stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} />
              <text x={width - 18} y={y + 3.5} textAnchor="end" fontSize="9" fill="var(--sch-pin-label, var(--wb-12, #cbd5e1))">
                {p.label || p.name}
              </text>
            </g>
          );
        })}
      </g>
    ),
  };
}

// ── Standard Board Definitions ──────────────────────────────────────────────

/** Arduino Uno Schematic Symbol */
export const ArduinoUnoDef = createBoxSymbolDef(
  'arduino-uno',
  'U',
  'ARDUINO UNO',
  [
    { name: 'VIN' },
    { name: '5V' },
    { name: '3V3', label: '3.3V', aliases: ['3.3V'] },
    { name: 'GND', label: 'GND.1', aliases: ['GND.1'] },
    { name: 'GND.1', label: 'GND.2', aliases: ['GND'] },
    { name: 'RESET', label: 'RST', aliases: ['RST'] },
    { name: 'A0' },
    { name: 'A1' },
    { name: 'A2' },
    { name: 'A3' },
    { name: 'A4', label: 'A4/SDA', aliases: ['SDA'] },
    { name: 'A5', label: 'A5/SCL', aliases: ['SCL'] },
  ],
  [
    { name: '0', label: '0 (RX)', aliases: ['D0', 'RX'] },
    { name: '1', label: '1 (TX)', aliases: ['D1', 'TX'] },
    { name: '2', label: '2', aliases: ['D2'] },
    { name: '3', label: '~3', aliases: ['D3'] },
    { name: '4', label: '4', aliases: ['D4'] },
    { name: '5', label: '~5', aliases: ['D5'] },
    { name: '6', label: '~6', aliases: ['D6'] },
    { name: '7', label: '7', aliases: ['D7'] },
    { name: '8', label: '8', aliases: ['D8'] },
    { name: '9', label: '~9', aliases: ['D9'] },
    { name: '10', label: '~10', aliases: ['D10'] },
    { name: '11', label: '~11', aliases: ['D11'] },
    { name: '12', label: '12', aliases: ['D12'] },
    { name: '13', label: '13 (LED)', aliases: ['D13'] },
    { name: 'GND.2', label: 'GND', aliases: ['GND'] },
    { name: 'AREF' },
  ],
  170,
);

/** Arduino Nano Schematic Symbol */
export const ArduinoNanoDef = createBoxSymbolDef(
  'arduino-nano',
  'U',
  'ARDUINO NANO',
  [
    { name: 'VIN' },
    { name: '5V' },
    { name: '3V3', label: '3.3V' },
    { name: 'GND', label: 'GND' },
    { name: 'RST', label: 'RESET' },
    { name: 'A0' },
    { name: 'A1' },
    { name: 'A2' },
    { name: 'A3' },
    { name: 'A4' },
    { name: 'A5' },
    { name: 'A6' },
    { name: 'A7' },
  ],
  [
    { name: 'TX', label: 'TX (D1)' },
    { name: 'RX', label: 'RX (D0)' },
    { name: 'D2' },
    { name: 'D3', label: '~D3' },
    { name: 'D4' },
    { name: 'D5', label: '~D5' },
    { name: 'D6', label: '~D6' },
    { name: 'D7' },
    { name: 'D8' },
    { name: 'D9', label: '~D9' },
    { name: 'D10', label: '~D10' },
    { name: 'D11', label: '~D11' },
    { name: 'D12' },
    { name: 'D13', label: 'D13' },
  ],
  160,
);

/** ESP32 DevKit V1 Schematic Symbol */
export const Esp32DevKitDef = createBoxSymbolDef(
  'esp32-devkit-v1',
  'U',
  'ESP32 DEVKIT V1',
  [
    { name: 'VIN', label: 'VIN (5V)' },
    { name: '3V3', label: '3V3' },
    { name: 'GND', label: 'GND.1' },
    { name: 'GND.1', label: 'GND.2' },
    { name: 'EN', label: 'EN/RST' },
    { name: 'D36', label: 'VP (D36)' },
    { name: 'D39', label: 'VN (D39)' },
    { name: 'D34' },
    { name: 'D35' },
    { name: 'D32' },
    { name: 'D33' },
    { name: 'D25' },
    { name: 'D26' },
    { name: 'D27' },
    { name: 'D14' },
    { name: 'D12' },
    { name: 'D13' },
  ],
  [
    { name: 'D23', label: 'D23 (MOSI)' },
    { name: 'D22', label: 'D22 (SCL)' },
    { name: 'TX0', label: 'TX0 (D1)' },
    { name: 'RX0', label: 'RX0 (D3)' },
    { name: 'D21', label: 'D21 (SDA)' },
    { name: 'D19', label: 'D19 (MISO)' },
    { name: 'D18', label: 'D18 (SCK)' },
    { name: 'D5', label: 'D5 (SS)' },
    { name: 'D4' },
    { name: 'D2', label: 'D2 (LED)' },
    { name: 'D15' },
  ],
  175,
);

/** Raspberry Pi Pico Schematic Symbol */
export const PiPicoDef = createBoxSymbolDef(
  'raspberry-pi-pico',
  'U',
  'RPI PICO',
  [
    { name: 'VBUS', label: 'VBUS (5V)' },
    { name: 'VSYS' },
    { name: '3V3', label: '3V3_OUT' },
    { name: 'GND', label: 'GND' },
    { name: 'GP26', label: 'GP26/A0' },
    { name: 'GP27', label: 'GP27/A1' },
    { name: 'GP28', label: 'GP28/A2' },
    { name: 'RUN' },
  ],
  [
    { name: 'GP0', label: 'GP0 (TX)' },
    { name: 'GP1', label: 'GP1 (RX)' },
    { name: 'GP2' },
    { name: 'GP3' },
    { name: 'GP4', label: 'GP4 (SDA)' },
    { name: 'GP5', label: 'GP5 (SCL)' },
    { name: 'GP16' },
    { name: 'GP25', label: 'GP25 (LED)' },
  ],
  165,
);

// ── Sensor Modules ──────────────────────────────────────────────────────────

/** Ultrasonic HC-SR04 */
export const Hcsr04Def = createBoxSymbolDef(
  'hc-sr04',
  'SEN',
  'HC-SR04',
  [
    { name: 'VCC' },
    { name: 'GND' },
  ],
  [
    { name: 'TRIG' },
    { name: 'ECHO' },
  ],
  130,
);

/** Temperature & Humidity DHT22 */
export const Dht22Def = createBoxSymbolDef(
  'dht22',
  'SEN',
  'DHT22 / AM2302',
  [
    { name: 'VCC' },
    { name: 'GND' },
  ],
  [
    { name: 'SDA', label: 'DATA' },
  ],
  130,
);

/** MPU6050 Accelerometer / Gyro */
export const Mpu6050Def = createBoxSymbolDef(
  'mpu6050',
  'U',
  'MPU-6050 (I2C)',
  [
    { name: 'VCC' },
    { name: 'GND' },
  ],
  [
    { name: 'SCL' },
    { name: 'SDA' },
    { name: 'XDA' },
    { name: 'XCL' },
    { name: 'AD0' },
    { name: 'INT' },
  ],
  135,
);

/** LCD 1602 / 2004 I2C Backpack */
export const LcdI2cDef = createBoxSymbolDef(
  'lcd1602',
  'DISP',
  'LCD DISPLAY (I2C)',
  [
    { name: 'GND' },
    { name: 'VCC' },
  ],
  [
    { name: 'SDA' },
    { name: 'SCL' },
  ],
  145,
);

/** OLED SSD1306 Display */
export const Ssd1306Def = createBoxSymbolDef(
  'ssd1306',
  'DISP',
  'OLED SSD1306 (I2C)',
  [
    { name: 'GND' },
    { name: 'VCC' },
  ],
  [
    { name: 'SCL' },
    { name: 'SDA' },
  ],
  145,
);

// ── Registry of all schematic definitions ────────────────────────────────────

export const SCHEMATIC_SYMBOL_REGISTRY: Record<string, SchematicComponentDef> = {
  // Passives & Semiconductors
  'wokwi-resistor': ResistorDef,
  'resistor': ResistorDef,
  'wokwi-potentiometer': PotentiometerDef,
  'potentiometer': PotentiometerDef,
  'slide-potentiometer': PotentiometerDef,
  'capacitor': CapacitorDef,
  'capacitor-electrolytic': CapacitorElectrolyticDef,
  'inductor': InductorDef,
  'diode': DiodeDef,
  'diode-1n4007': DiodeDef,
  'diode-1n4148': DiodeDef,
  'diode-1n5817': DiodeDef,
  'diode-1n5819': DiodeDef,
  'zener-1n4733': DiodeDef,
  'photodiode': DiodeDef,
  'wokwi-led': LedDef,
  'led': LedDef,
  'led-green': LedDef,
  'led-blue': LedDef,
  'led-yellow': LedDef,
  'bjt-2n2222': TransistorNpnDef,
  'bjt-2n3904': TransistorNpnDef,
  'bjt-bc547': TransistorNpnDef,
  'mosfet-2n7000': TransistorNpnDef,
  'mosfet-irf540': TransistorNpnDef,
  'bjt-2n3906': TransistorPnpDef,
  'bjt-bc557': TransistorPnpDef,
  'mosfet-irf9540': TransistorPnpDef,

  // Electromechanical & Sources
  'wokwi-pushbutton': PushbuttonDef,
  'wokwi-pushbutton-6mm': PushbuttonDef,
  'pushbutton': PushbuttonDef,
  'pushbutton-6mm': PushbuttonDef,
  'slide-switch': SlideSwitchDef,
  'battery-9v': BatteryDef,
  'battery-aa': BatteryDef,
  'battery-coin-cell': BatteryDef,
  'power-supply': BatteryDef,
  'buzzer': BuzzerDef,
  'wokwi-buzzer': BuzzerDef,
  'opamp-lm358': OpAmpDef,
  'opamp-lm741': OpAmpDef,
  'opamp-tl072': OpAmpDef,
  'opamp-ideal': OpAmpDef,

  // Boards
  'arduino-uno': ArduinoUnoDef,
  'wokwi-arduino-uno': ArduinoUnoDef,
  'arduino-nano': ArduinoNanoDef,
  'wokwi-arduino-nano': ArduinoNanoDef,
  'arduino-mega': ArduinoUnoDef,
  'wokwi-arduino-mega': ArduinoUnoDef,
  'esp32-devkit-v1': Esp32DevKitDef,
  'wokwi-esp32-devkit-v1': Esp32DevKitDef,
  'esp32-board': Esp32DevKitDef,
  'raspberry-pi-pico': PiPicoDef,
  'raspberry-pi-pico-w': PiPicoDef,

  // Modules & Sensors
  'hc-sr04': Hcsr04Def,
  'wokwi-hc-sr04': Hcsr04Def,
  'dht22': Dht22Def,
  'wokwi-dht22': Dht22Def,
  'mpu6050': Mpu6050Def,
  'wokwi-mpu6050': Mpu6050Def,
  'lcd1602': LcdI2cDef,
  'lcd2004': LcdI2cDef,
  'ssd1306': Ssd1306Def,
};

/** Get or create a fallback box symbol for any unknown IC/chip/module */
export function getSchematicSymbolDef(rawType?: string, knownPins: string[] = []): SchematicComponentDef {
  const type = (rawType || 'generic').trim();
  const normalized = type.replace(/^(wokwi-|mcu-maker-)/, '').toLowerCase();
  if (SCHEMATIC_SYMBOL_REGISTRY[type]) return SCHEMATIC_SYMBOL_REGISTRY[type];
  if (SCHEMATIC_SYMBOL_REGISTRY[normalized]) return SCHEMATIC_SYMBOL_REGISTRY[normalized];

  // If part matches a prefix
  for (const [key, def] of Object.entries(SCHEMATIC_SYMBOL_REGISTRY)) {
    if (normalized.startsWith(key) || key.startsWith(normalized)) {
      return def;
    }
  }

  // Create clean fallback box
  const half = Math.ceil(knownPins.length / 2);
  const left = knownPins.slice(0, half).map((p) => ({ name: p }));
  const right = knownPins.slice(half).map((p) => ({ name: p }));
  return createBoxSymbolDef(type, 'U', (type || 'CHIP').toUpperCase(), left, right, 140);
}

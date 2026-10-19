/**
 * Bridge between MCU Maker's simulator store (components, wires, boards) and
 * the NetlistBuilder inputs. Kept separate so the SPICE engine never has
 * to import the full Zustand store or its types.
 *
 * Callers construct a `BuildNetlistInput` by calling
 *   `buildInputFromStore(storeSnapshot)`
 */
import type {
  BuildNetlistInput,
  BoardForSpice,
  ComponentForSpice,
  WireForSpice,
  PinSourceState,
  AnalysisMode,
} from './types';
import type { Wire } from '../../types/wire';
import { analogScopeWantsTransient } from './analogScopeFeed';
import type { BoardKind } from '../../types/board';
import { boardPinGroupFor } from './boardPinGroups';
import { parseValueWithUnits } from './valueParser';
import { PASSIVE_PRESETS } from './componentToSpice';

import { UnionFind } from './unionFind';

// Minimum transient stop time so RC/decoupling networks reach steady-state
// even if the source is very high frequency.
const MIN_TRAN_STOP_S = 5e-3;
// Cap transient stop time to keep solve cost bounded for very low-frequency
// sources (e.g. 0.1 Hz → 40 s would be absurd). 400 ms covers 20 cycles at
// 50 Hz and gives plenty of time to reach steady state for filter networks.
const MAX_TRAN_STOP_S = 0.4;
const SAMPLES_PER_PERIOD = 20;
const PERIODS_TO_SETTLE = 4;

// Transient forced by an analog scope channel on an otherwise-DC circuit.
// Short and coarse on purpose: it exists to give the trace a live window, and
// every solve reloads and re-runs the whole circuit on the single-threaded
// WASM engine, so a long capture would starve the MCU-edge solves that make
// LEDs respond.
const SCOPE_TRAN_STOP_S = 20e-3;
const SCOPE_TRAN_STEP_S = 50e-6;

// When a capacitor/inductor is driven by an MCU pin (step response), use this
// step. 1e-4 s = 100 µs, fine enough to resolve 10 kΩ · 1 µF = 10 ms τ with
// ~100 samples per τ.
const STEP_RESPONSE_STEP_S = 1e-4;
// Default τ when no resistor is found in the circuit (capacitor charging
// through a 10 kΩ pull-up is a reasonable default).
const DEFAULT_R_OHMS = 10e3;

// Build the meta-id sets dynamically by combining the canonical IDs with
// every PASSIVE_PRESETS alias that maps to the same base — so adding a new
// preset (e.g. resistor-470) doesn't require touching this file.
const presetsOf = (base: 'resistor' | 'capacitor' | 'capacitor-electrolytic' | 'inductor') =>
  Object.entries(PASSIVE_PRESETS)
    .filter(([, b]) => b === base)
    .map(([id]) => id);

const CAPACITOR_META = new Set([
  'capacitor',
  'analog-capacitor',
  'capacitor-electrolytic',
  ...presetsOf('capacitor'),
  ...presetsOf('capacitor-electrolytic'),
]);
const INDUCTOR_META = new Set(['inductor', 'analog-inductor', ...presetsOf('inductor')]);
const RESISTOR_META = new Set([
  'resistor',
  'resistor-us',
  'analog-resistor',
  ...presetsOf('resistor'),
]);

/** True if any board has at least one actively-driven pin (digital or PWM). */
function hasDrivenPin(boards: StoreSnapshot['boards']): boolean {
  for (const b of boards) {
    for (const state of Object.values(b.pinStates)) {
      if (state.type === 'digital' || state.type === 'pwm') return true;
    }
  }
  return false;
}

/**
 * Check if any capacitor or inductor is actually connected in the electrical network
 * of an actively driven MCU pin (digital or PWM).
 *
 * Decoupling capacitors across power rails (VIN/VCC/GND), capacitors on floating/idle
 * pins, or capacitors on nets independent of the driven pin must NOT force the global
 * simulation into batch .tran mode (which freezes continuous real-time MCU execution
 * and blinking LEDs).
 */
function isReactiveConnectedToDrivenPin(
  components: StoreSnapshot['components'],
  boards: StoreSnapshot['boards'],
  wires: Wire[],
): boolean {
  if (!wires || wires.length === 0) {
    // When no wires are provided (e.g. synthetic test harnesses), fall back to hasDrivenPin
    return hasDrivenPin(boards);
  }

  const uf = new UnionFind();
  const pinKey = (compId: string, pin: string) => `${compId}:${pin}`;

  // 1. Union wire endpoints
  for (const w of wires) {
    if (!w.start || !w.end) continue;
    uf.union(pinKey(w.start.componentId, w.start.pinName), pinKey(w.end.componentId, w.end.pinName));
  }

  // 2. Resistors conduct DC between their two pins
  for (const c of components) {
    if (RESISTOR_META.has(c.metadataId) || c.metadataId === 'potentiometer') {
      uf.union(pinKey(c.id, '1'), pinKey(c.id, '2'));
    }
  }

  // 3. Collect nets of actively driven MCU pins
  const drivenNets = new Set<string>();
  for (const b of boards) {
    for (const [pinName, state] of Object.entries(b.pinStates)) {
      if (state.type === 'digital' || state.type === 'pwm') {
        drivenNets.add(uf.find(pinKey(b.id, pinName)));
      }
    }
  }

  if (drivenNets.size === 0) return false;

  // 4. Check if any reactive component shares a net with any driven pin
  for (const c of components) {
    if (CAPACITOR_META.has(c.metadataId) || INDUCTOR_META.has(c.metadataId)) {
      for (const pin of ['1', '2', '+', '-', 'anode', 'cathode']) {
        const net = uf.find(pinKey(c.id, pin));
        if (drivenNets.has(net)) return true;
      }
    }
  }

  return false;
}

/** Largest RC time constant visible in the circuit (for step-response sizing). */
function estimateLargestTau(components: StoreSnapshot['components']): number {
  let maxR = 0;
  let maxC = 0;
  let maxL = 0;
  for (const c of components) {
    if (RESISTOR_META.has(c.metadataId)) {
      const r = parseValueWithUnits(c.properties.value, 1000);
      if (Number.isFinite(r) && r > maxR) maxR = r;
    } else if (CAPACITOR_META.has(c.metadataId)) {
      const cap = parseValueWithUnits(c.properties.value, 1e-6);
      if (Number.isFinite(cap) && cap > maxC) maxC = cap;
    } else if (INDUCTOR_META.has(c.metadataId)) {
      const l = parseValueWithUnits(c.properties.value, 1e-3);
      if (Number.isFinite(l) && l > maxL) maxL = l;
    }
  }
  const r = maxR > 0 ? maxR : DEFAULT_R_OHMS;
  const tauRC = maxC > 0 ? r * maxC : 0;
  const tauRL = maxL > 0 ? maxL / r : 0;
  return Math.max(tauRC, tauRL);
}

/**
 * Scan components for time-dependent sources and pick a transient analysis
 * window that captures all frequencies with enough resolution. Returns `null`
 * if every source is DC and no MCU-driven reactive network is present (→
 * caller uses `.op`).
 *
 * Two triggers cause `.tran`:
 *   1. Any `signal-generator` with non-DC waveform (AC source)
 *   2. Any capacitor or inductor wired directly to an actively-driven MCU pin
 *      (step-response circuits like RC charging from a `digitalWrite(HIGH)`).
 */
function pickDynamicAnalysis(
  components: StoreSnapshot['components'],
  boards: StoreSnapshot['boards'],
  wires: Wire[],
): AnalysisMode | null {
  const frequencies: number[] = [];
  for (const c of components) {
    if (c.metadataId !== 'signal-generator') continue;
    const waveform = String(c.properties.waveform ?? 'sine').toLowerCase();
    if (waveform === 'dc') continue;
    const freq = Number(c.properties.frequency ?? 0);
    if (freq > 0) frequencies.push(freq);
  }

  if (frequencies.length > 0) {
    const maxFreq = Math.max(...frequencies);
    const minFreq = Math.min(...frequencies);
    const stepS = 1 / (maxFreq * SAMPLES_PER_PERIOD);
    const rawStop = PERIODS_TO_SETTLE / minFreq;
    const stopS = Math.min(MAX_TRAN_STOP_S, Math.max(MIN_TRAN_STOP_S, rawStop));
    return {
      kind: 'tran',
      step: stepS.toExponential(3),
      stop: stopS.toExponential(3),
    };
  }

  // Step-response branch: capacitor or inductor wired to an actively-driven MCU pin.
  const hasReactive = components.some(
    (c) => CAPACITOR_META.has(c.metadataId) || INDUCTOR_META.has(c.metadataId),
  );
  if (hasReactive && isReactiveConnectedToDrivenPin(components, boards, wires)) {
    const tau = estimateLargestTau(components);
    const rawStop = tau > 0 ? 5 * tau : MIN_TRAN_STOP_S;
    const stopS = Math.min(MAX_TRAN_STOP_S, Math.max(MIN_TRAN_STOP_S, rawStop));
    return {
      kind: 'tran',
      step: STEP_RESPONSE_STEP_S.toExponential(3),
      stop: stopS.toExponential(3),
    };
  }

  return null;
}

export interface StoreSnapshot {
  components: Array<{
    id: string;
    metadataId: string;
    properties: Record<string, unknown>;
  }>;
  wires: Wire[];
  boards: Array<{
    id: string;
    boardKind: BoardKind;
    pinStates: Record<string, PinSourceState>; // caller pre-populates from PinManager + PWM
  }>;
}

/**
 * Convert a MCU Maker store snapshot into the `BuildNetlistInput` consumed
 * by the NetlistBuilder.
 */
export function buildInputFromStore(snap: StoreSnapshot): BuildNetlistInput {
  const components: ComponentForSpice[] = snap.components.map((c) => ({
    id: c.id,
    metadataId: c.metadataId,
    properties: c.properties,
  }));

  const wires: WireForSpice[] = snap.wires.map((w) => ({
    id: w.id,
    start: { componentId: w.start.componentId, pinName: w.start.pinName },
    end: { componentId: w.end.componentId, pinName: w.end.pinName },
  }));

  const boards: BoardForSpice[] = snap.boards.map((b) => {
    const group = boardPinGroupFor(b.boardKind);
    return {
      id: b.id,
      boardKind: b.boardKind,
      vcc: group.vcc,
      pins: b.pinStates,
      groundPinNames: group.gnd,
      vccPinNames: group.vcc_pins,
      auxPinNames: group.aux?.pins,
      auxVolts: group.aux?.volts,
    };
  });

  // A probed wire needs a waveform even when the circuit itself is DC: a
  // resistor divider has no signal generator and no reactive part, so
  // pickDynamicAnalysis says `.op` and there is nothing for an analog scope
  // channel to plot. While the scope is watching a net, ask for a transient
  // anyway — a short one, since the point is a live window rather than a
  // settling study.
  const analysis: AnalysisMode =
    pickDynamicAnalysis(snap.components, snap.boards, snap.wires) ??
    (analogScopeWantsTransient()
      ? {
          kind: 'tran',
          step: SCOPE_TRAN_STEP_S.toExponential(3),
          stop: SCOPE_TRAN_STOP_S.toExponential(3),
        }
      : { kind: 'op' });

  return {
    components,
    wires,
    boards,
    analysis,
  };
}

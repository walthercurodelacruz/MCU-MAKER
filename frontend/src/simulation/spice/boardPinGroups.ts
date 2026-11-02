/**
 * Per-board pin classification: which pin names should be canonicalized
 * to the ground net ("0"), the Vcc rail, or a per-voltage aux rail, plus
 * the default supply voltage.
 *
 * Extend this table as new boards are added.
 */
import type { BoardKind } from '../../types/board';
import { getProBoard } from '../../lib/proBoardRegistry';

export interface BoardPinGroup {
  /** Supply voltage (V). */
  vcc: number;
  /** Pin names treated as ground. */
  gnd: string[];
  /** Pin names treated as the Vcc rail. */
  vcc_pins: string[];
  /**
   * Supply pins that sit at a DIFFERENT voltage than the main rail — the
   * VIN / 5V pins of a 3.3 V board, or the 3.3 V pin of a 5 V Arduino.
   * They get their own per-voltage net (`aux_rail_5` / `aux_rail_3v3`)
   * driven at `volts`, instead of collapsing onto `vcc_rail` and being
   * clamped to the board's logic voltage.
   */
  aux?: { volts: number; pins: string[] };
}

/**
 * SPICE net name for the aux supply rail at a given voltage.
 * 5 → "aux_rail_5", 3.3 → "aux_rail_3v3". Boards sharing a voltage share
 * the net, mirroring how all main supply pins share "vcc_rail".
 */
export function auxRailNetName(volts: number): string {
  return `aux_rail_${String(volts).replace('.', 'v')}`;
}

/** True if a net name is an aux supply rail (see auxRailNetName). */
export function isAuxRailNet(net: string): boolean {
  return net.startsWith('aux_rail_');
}

type AllBoardKinds = BoardKind | 'default';

export const BOARD_PIN_GROUPS: Record<AllBoardKinds, BoardPinGroup> = {
  default: { vcc: 5, gnd: ['GND', 'GND.1', 'GND.2'], vcc_pins: ['5V', 'VCC'] },

  // AREF stays on the main 5 V rail — it is VCC-referenced by default.
  'arduino-uno': {
    vcc: 5,
    gnd: ['GND.1', 'GND.2', 'GND.3', 'GND'],
    vcc_pins: ['5V', 'VCC', 'AREF'],
    aux: { volts: 3.3, pins: ['3.3V'] },
  },
  'arduino-nano': {
    vcc: 5,
    gnd: ['GND.1', 'GND.2', 'GND'],
    vcc_pins: ['5V', 'VCC', 'AREF'],
    aux: { volts: 3.3, pins: ['3V3'] },
  },
  'arduino-mega': {
    vcc: 5,
    gnd: ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND'],
    vcc_pins: ['5V', 'VCC', 'AREF'],
    aux: { volts: 3.3, pins: ['3.3V'] },
  },
  attiny85: { vcc: 5, gnd: ['GND'], vcc_pins: ['VCC'] },

  'raspberry-pi-pico': {
    vcc: 3.3,
    gnd: ['GND.1', 'GND.2', 'GND.3', 'GND'],
    vcc_pins: ['3V3'],
    aux: { volts: 5, pins: ['VBUS', 'VSYS'] },
  },
  'pi-pico-w': {
    vcc: 3.3,
    gnd: ['GND.1', 'GND.2', 'GND.3', 'GND'],
    vcc_pins: ['3V3'],
    aux: { volts: 5, pins: ['VBUS', 'VSYS'] },
  },

  esp32: {
    vcc: 3.3,
    gnd: ['GND', 'GND.1', 'GND.2'],
    vcc_pins: ['3V3'],
    aux: { volts: 5, pins: ['VIN', '5V'] },
  },
  'esp32-cam': {
    vcc: 3.3,
    gnd: ['GND'],
    vcc_pins: ['3V3', 'VCC'],
    aux: { volts: 5, pins: ['5V', '5V.1'] },
  },
  'esp32-s3': {
    vcc: 3.3,
    gnd: ['GND', 'GND.1', 'GND.2'],
    vcc_pins: ['3V3', '3V3.1', '3V3.2'],
    aux: { volts: 5, pins: ['VIN', '5V'] },
  },
  'arduino-nano-esp32': {
    vcc: 3.3,
    gnd: ['GND'],
    vcc_pins: ['3V3'],
    aux: { volts: 5, pins: ['5V', 'VUSB'] },
  },
  'esp32-c3': {
    vcc: 3.3,
    gnd: ['GND', 'GND.1', 'GND.2'],
    vcc_pins: ['3V3', '3V3.1', '3V3.2'],
    aux: { volts: 5, pins: ['VIN', '5V', '5V.1', '5V.2'] },
  },
};

/**
 * The pin classification for a board, including boards this table cannot name.
 *
 * BOARD_PIN_GROUPS is keyed by the BoardKind union, so an overlay board — whose
 * kind is a runtime string — could never appear in it and fell through to
 * `default`: a 5 V part whose only supply pad is called "5V". Every RP2350 and
 * ESP32-family board registered by the overlay was therefore solved at the
 * wrong rail. It shows up the moment anything analog is wired: a divider off
 * the 3V3 pad of a Pimoroni Pico Plus 2 W solved at 5 V, so a potentiometer at
 * half travel read 2.50 V instead of 1.65 V.
 *
 * A pro board declares its own supply pads through ProBoardDef.power.
 */
export function boardPinGroupFor(kind: string): BoardPinGroup {
  const known = BOARD_PIN_GROUPS[kind as AllBoardKinds];
  if (known) return known;
  const pro = getProBoard(kind)?.power;
  if (pro) return pro;
  return BOARD_PIN_GROUPS.default;
}

/**
 * Human form of an aux-rail tag: "5" -> "5 V", "3v3" -> "3.3 V" (the net name
 * spells the dot as "v"). Used by the messages that name a rail to the user.
 */
export function railVolts(tag: string): string {
  const m = /^(\d+)(?:v(\d+))?$/.exec(tag);
  if (!m) return `${tag} V`;
  return m[2] ? `${m[1]}.${m[2]} V` : `${m[1]} V`;
}

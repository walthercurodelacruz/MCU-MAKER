/**
 * Board geometry on the canvas: footprint size, rotation, and the rotated
 * bounding box.
 *
 * A board keeps (x, y) as the top-left of its UNROTATED footprint and turns
 * about the footprint's centre, the same convention components use (their
 * wrapper rotates about `center center`). Every consumer that turns a board
 * pin into canvas coordinates rotates (x + pin.x, y + pin.y) about that
 * centre — see calculatePinPosition's pivotBox and PinOverlay's pivotBox.
 */
import { getProBoard } from '../lib/proBoardRegistry';

// Board visual dimensions (width × height) for the drag-overlay sizing.
// ESP32 sizes match the wokwi-boards SVG rendered at 5 px/mm.
export const BOARD_SIZE: Record<string, { w: number; h: number }> = {
  // wokwi-elements: rendered at 96 dpi — 1mm = 3.7795px
  'arduino-uno': { w: 274, h: 202 }, // 72.58mm × 53.34mm
  'arduino-nano': { w: 170, h: 67 }, // 44.9mm  × 17.8mm
  'arduino-mega': { w: 388, h: 192 }, // 102.66mm × 50.80mm
  // Pi Pico physical board is 51mm × 21mm vertical-narrow. The render
  // uses mcu_maker's <mcu-maker-pi-pico-w>, same Web Component as 'pi-pico-w'
  // because the Pico and Pico W are pin-compatible. Used to render the
  // wokwi-nano-rp2040-connect (168×68) — that was a completely different
  // board with D2-D13 pin labels, so wires in pico examples that
  // referenced GP10/GP18/etc. landed at (0,0). The render now matches
  // the boardKind name.
  'raspberry-pi-pico': { w: 105, h: 264 },
  'pi-pico-w': { w: 105, h: 264 },
  esp32: { w: 141, h: 265 }, // esp32-devkit-v1: 28.2 × 53 mm
  'esp32-s3': { w: 128, h: 350 }, // esp32-s3-devkitc-1: 25.5 × 70 mm
  'esp32-c3': { w: 127, h: 215 }, // esp32-c3-devkitm-1: 25.4 × 42.9 mm
  'esp32-cam': { w: 136, h: 202 },
  'arduino-nano-esp32': { w: 217, h: 90 },
  attiny85: { w: 160, h: 132 },
};


const DEFAULT_SIZE = { w: 300, h: 200 };

/** Unrotated footprint of a board kind. */
export function boardSize(boardKind: string): { w: number; h: number } {
  return BOARD_SIZE[boardKind] ?? getProBoard(boardKind)?.size ?? DEFAULT_SIZE;
}

/** Rotation normalised to 0 / 90 / 180 / 270. */
export function normalizeRotation(rotation: unknown): number {
  const r = Math.round((Number(rotation) || 0) / 90) * 90;
  return ((r % 360) + 360) % 360;
}

/** Canvas-space bounding box of a (possibly rotated) board. */
export function boardBox(board: {
  boardKind: string;
  x: number;
  y: number;
  rotation?: number;
}): { left: number; top: number; w: number; h: number } {
  const size = boardSize(board.boardKind);
  const quarter = normalizeRotation(board.rotation) % 180 !== 0;
  const w = quarter ? size.h : size.w;
  const h = quarter ? size.w : size.h;
  const cx = board.x + size.w / 2;
  const cy = board.y + size.h / 2;
  return { left: cx - w / 2, top: cy - h / 2, w, h };
}

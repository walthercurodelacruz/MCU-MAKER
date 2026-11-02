import { describe, it, expect } from 'vitest';
import type { BoardKind } from '../types/board';
import { BOARD_KIND_FQBN, BOARD_KIND_LABELS } from '../types/board';
import { useSimulatorStore, getBoardSimulator, getEsp32Bridge, isEsp32Kind } from '../store/useSimulatorStore';
import { AVRSimulator } from '../simulation/AVRSimulator';
import { RP2040Simulator } from '../simulation/RP2040Simulator';

const CANONICAL_BOARDS: BoardKind[] = [
  'arduino-uno',
  'arduino-nano',
  'arduino-mega',
  'raspberry-pi-pico',
  'pi-pico-w',
  'esp32',
  'esp32-cam',
  'esp32-s3',
  'arduino-nano-esp32',
  'esp32-c3',
  'attiny85',
];

describe('Canonical Boards Parity and Integrity Test', () => {
  it('has exactly 11 canonical boards defined', () => {
    expect(CANONICAL_BOARDS).toHaveLength(11);
    expect(Object.keys(BOARD_KIND_FQBN)).toHaveLength(11);
  });

  for (const boardKind of CANONICAL_BOARDS) {
    it(`board ${boardKind} has valid label and FQBN mapping`, () => {
      const label = BOARD_KIND_LABELS[boardKind];
      const fqbn = BOARD_KIND_FQBN[boardKind];
      expect(label, `Label for ${boardKind}`).toBeDefined();
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);

      expect(fqbn, `FQBN for ${boardKind}`).toBeDefined();
      expect(typeof fqbn).toBe('string');
      expect(fqbn!.length).toBeGreaterThan(0);
    });

    it(`board ${boardKind} instantiates the correct simulator engine`, () => {
      const { addBoard, removeBoard } = useSimulatorStore.getState();
      const boardId = addBoard(boardKind, 100, 100);

      if (['arduino-uno', 'arduino-nano', 'arduino-mega', 'attiny85'].includes(boardKind)) {
        const sim = getBoardSimulator(boardId);
        expect(sim).toBeInstanceOf(AVRSimulator);
      } else if (['raspberry-pi-pico', 'pi-pico-w'].includes(boardKind)) {
        const sim = getBoardSimulator(boardId);
        expect(sim).toBeInstanceOf(RP2040Simulator);
      } else if (isEsp32Kind(boardKind)) {
        const bridge = getEsp32Bridge(boardId);
        expect(bridge).toBeDefined();
      }

      removeBoard(boardId);
    });
  }
});

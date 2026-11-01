import './PiPicoWElement';
import type { BoardKind } from '../../types/board';

interface PiPicoWProps {
  id?: string;
  x?: number;
  y?: number;
  boardKind?: BoardKind;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'mcu-maker-pi-pico-w': any;
    }
  }
}

export const PiPicoW = ({
  id = 'pi-pico-w',
  x = 0,
  y = 0,
  boardKind = 'pi-pico-w',
}: PiPicoWProps) => (
  <mcu-maker-pi-pico-w
    id={id}
    board-kind={boardKind}
    style={{ position: 'absolute', left: `${x}px`, top: `${y}px` }}
  />
);

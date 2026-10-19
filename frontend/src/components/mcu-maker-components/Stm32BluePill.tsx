import './Stm32BluePillElement';

type StmIntrinsic = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'mcu-maker-stm32-bluepill': StmIntrinsic;
      'mcu-maker-stm32-blackpill': StmIntrinsic;
      'mcu-maker-stm32-bluepill-f103cb': StmIntrinsic;
      'mcu-maker-stm32-blackpill-f401': StmIntrinsic;
      'mcu-maker-stm32-f4-discovery': StmIntrinsic;
      'mcu-maker-stm32-olimex-h405': StmIntrinsic;
      'mcu-maker-stm32-netduino-plus2': StmIntrinsic;
      'mcu-maker-stm32-netduino2': StmIntrinsic;
    }
  }
}

interface Props {
  id: string;
  x: number;
  y: number;
}

/** Thin React wrappers over the STM32 board Web Components (rule 6a). */
export const Stm32BluePill = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-bluepill id={id} style={{ position: 'absolute', left: x, top: y }} />
);

export const Stm32BlackPill = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-blackpill id={id} style={{ position: 'absolute', left: x, top: y }} />
);

export const Stm32BluePillF103CB = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-bluepill-f103cb id={id} style={{ position: 'absolute', left: x, top: y }} />
);

export const Stm32BlackPillF401 = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-blackpill-f401 id={id} style={{ position: 'absolute', left: x, top: y }} />
);

export const Stm32F4Discovery = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-f4-discovery id={id} style={{ position: 'absolute', left: x, top: y }} />
);

export const Stm32OlimexH405 = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-olimex-h405 id={id} style={{ position: 'absolute', left: x, top: y }} />
);

export const Stm32NetduinoPlus2 = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-netduino-plus2 id={id} style={{ position: 'absolute', left: x, top: y }} />
);

export const Stm32Netduino2 = ({ id, x, y }: Props) => (
  <mcu-maker-stm32-netduino2 id={id} style={{ position: 'absolute', left: x, top: y }} />
);

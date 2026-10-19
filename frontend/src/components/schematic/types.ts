/**
 * Schematic Viewer types & interfaces.
 */

export interface SchematicPin {
  name: string;
  label?: string;
  aliases?: string[];
  x: number; // offset relative to symbol origin
  y: number; // offset relative to symbol origin
  direction?: 'left' | 'right' | 'top' | 'bottom';
}

export interface SchematicComponentDef {
  type: string;
  designatorPrefix: string;
  displayName: string;
  width: number;
  height: number;
  pins: SchematicPin[];
  render: (props: SchematicRenderProps) => React.ReactElement;
}

export interface SchematicRenderProps {
  id: string;
  designator: string;
  value?: string;
  selected?: boolean;
  color?: string;
  rotation?: number;
  properties?: Record<string, unknown>;
}

export interface SchematicPlacedPart {
  id: string;
  originalId: string;
  type: string;
  designator: string;
  value?: string;
  displayName: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  pins: Array<SchematicPin & { absoluteX: number; absoluteY: number }>;
  isBoard?: boolean;
  properties?: Record<string, unknown>;
}

export interface SchematicNet {
  id: string;
  name: string;
  isGround: boolean;
  isPower: boolean;
  voltage?: string;
  pins: Array<{
    partId: string;
    pinName: string;
    x: number;
    y: number;
  }>;
  color?: string;
}

export interface SchematicWireSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SchematicWireTrunk {
  id?: string;
  orientation: 'horizontal' | 'vertical';
  coord: number;
  start: number;
  end: number;
  handlePos: { x: number; y: number };
}

export interface SchematicWirePath {
  netId: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  branches: Array<Array<{ x: number; y: number }>>;
  pathData: string;
  trunk?: SchematicWireTrunk;
  trunks?: SchematicWireTrunk[];
  junctions: Array<{ x: number; y: number }>;
  wireIds?: string[];
}


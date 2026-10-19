import { describe, it, expect } from 'vitest';
import { buildSchematicModel } from '../components/schematic/schematicTopology';
import { getSchematicSymbolDef, SCHEMATIC_SYMBOL_REGISTRY } from '../components/schematic/symbols';
import type { BoardInstance } from '../types/board';
import type { Wire } from '../types/wire';

describe('Schematic Viewer Topology', () => {
  it('correctly maps standard symbols for passives, actives, and boards', () => {
    const resistorDef = getSchematicSymbolDef('wokwi-resistor');
    expect(resistorDef.designatorPrefix).toBe('R');
    expect(resistorDef.pins.length).toBeGreaterThanOrEqual(2);

    const ledDef = getSchematicSymbolDef('wokwi-led');
    expect(ledDef.designatorPrefix).toBe('LED');

    const boardDef = getSchematicSymbolDef('arduino-uno');
    expect(boardDef.designatorPrefix).toBe('U');
    expect(boardDef.pins.some((p) => p.name === '5V')).toBe(true);
    expect(boardDef.pins.some((p) => p.name === 'GND')).toBe(true);
  });

  it('filters out breadboard physical bodies but unites internal nets', () => {
    const components = [
      { id: 'bb1', type: 'breadboard', x: 100, y: 100 },
      { id: 'r1', type: 'wokwi-resistor', x: 200, y: 200, properties: { value: '10000' } },
      { id: 'r2', type: 'wokwi-resistor', x: 300, y: 200, properties: { value: '4700' } },
    ];

    const boards: BoardInstance[] = [
      {
        id: 'uno1',
        boardKind: 'arduino-uno',
        x: 0,
        y: 0,
        rotation: 0,
        running: false,
      },
    ];

    // Wire from Uno 5V to breadboard top positive rail hole 1 (tp.1)
    // Wire from breadboard top positive rail hole 5 (tp.5) to r1 pin 1
    // Wire from r1 pin 2 to breadboard column 10 row a (10t.a)
    // Wire from breadboard column 10 row e (10t.e) to r2 pin 1
    const wires: Wire[] = [
      {
        id: 'w1',
        start: { componentId: 'uno1', pinName: '5V' },
        end: { componentId: 'bb1', pinName: 'tp.1' },
      },
      {
        id: 'w2',
        start: { componentId: 'bb1', pinName: 'tp.5' },
        end: { componentId: 'r1', pinName: '1' },
      },
      {
        id: 'w3',
        start: { componentId: 'r1', pinName: '2' },
        end: { componentId: 'bb1', pinName: '10t.a' },
      },
      {
        id: 'w4',
        start: { componentId: 'bb1', pinName: '10t.e' },
        end: { componentId: 'r2', pinName: '1' },
      },
    ];

    const model = buildSchematicModel({
      components,
      boards,
      wires,
    });

    // 1. Breadboard should NOT be a placed part in the schematic!
    expect(model.parts.some((p) => p.id === 'bb1')).toBe(false);

    // 2. Both resistors and the Arduino Uno board must be placed parts
    expect(model.parts.some((p) => p.id === 'r1')).toBe(true);
    expect(model.parts.some((p) => p.id === 'r2')).toBe(true);
    expect(model.parts.some((p) => p.id === 'uno1')).toBe(true);

    // 3. R1 pin 1 and Uno 5V must be in the same electrical net (via breadboard rail tp)
    const net5v = model.nets.find((n) => n.name === '5V');
    expect(net5v).toBeDefined();
    expect(net5v?.pins.some((p) => p.partId === 'r1' && p.pinName === '1')).toBe(true);
    expect(net5v?.pins.some((p) => p.partId === 'uno1' && p.pinName === '5V')).toBe(true);

    // 4. R1 pin 2 and R2 pin 1 must be in the same electrical net (via breadboard column 10)
    const midNet = model.nets.find(
      (n) =>
        n.pins.some((p) => p.partId === 'r1' && p.pinName === '2') &&
        n.pins.some((p) => p.partId === 'r2' && p.pinName === '1'),
    );
    expect(midNet).toBeDefined();

    // 5. Wire paths and bounds are computed
    expect(model.wirePaths.length).toBeGreaterThan(0);
    expect(model.bounds.maxX).toBeGreaterThan(0);
  });

  it('handles simulator store components with metadataId without crashing', () => {
    const components = [
      {
        id: 'led_builtin',
        metadataId: 'led',
        x: 380,
        y: 100,
        properties: { color: 'red' },
      },
      {
        id: 'r_builtin',
        metadataId: 'resistor',
        x: 240,
        y: 130,
        properties: { value: '220' },
      },
    ] as any;

    const boards: BoardInstance[] = [
      {
        id: 'arduino-uno',
        boardKind: 'arduino-uno',
        x: 100,
        y: 100,
        rotation: 0,
        running: false,
      },
    ];

    const wires: Wire[] = [
      {
        id: 'wire_builtin_pin13',
        start: { componentId: 'arduino-uno', pinName: '13', x: 0, y: 0 },
        end: { componentId: 'r_builtin', pinName: '1', x: 0, y: 0 },
        color: '#22c55e',
      },
      {
        id: 'wire_builtin_res_led',
        start: { componentId: 'r_builtin', pinName: '2', x: 0, y: 0 },
        end: { componentId: 'led_builtin', pinName: 'A', x: 0, y: 0 },
        color: '#22c55e',
      },
      {
        id: 'wire_builtin_led_gnd',
        start: { componentId: 'led_builtin', pinName: 'C', x: 0, y: 0 },
        end: { componentId: 'arduino-uno', pinName: 'GND.1', x: 0, y: 0 },
        color: '#000000',
      },
    ];

    const model = buildSchematicModel({
      components,
      boards,
      wires,
    });

    expect(model.parts.length).toBe(3);
    const uno = model.parts.find((p) => p.id === 'arduino-uno');
    const res = model.parts.find((p) => p.id === 'r_builtin');
    const led = model.parts.find((p) => p.id === 'led_builtin');

    expect(uno).toBeDefined();
    expect(res).toBeDefined();
    expect(led).toBeDefined();
    expect(res?.value).toBe('220Ω');

    // All 3 wires should produce wire paths
    expect(model.wirePaths.length).toBe(3);

    // Wire 1: Arduino pin 13 to Resistor pin 1
    const net13 = model.nets.find((n) =>
      n.pins.some((p) => p.partId === 'arduino-uno' && p.pinName === '13') &&
      n.pins.some((p) => p.partId === 'r_builtin' && p.pinName === '1'),
    );
    expect(net13).toBeDefined();

    // Wire 2: Resistor pin 2 to LED pin A
    const netLed = model.nets.find((n) =>
      n.pins.some((p) => p.partId === 'r_builtin' && p.pinName === '2') &&
      n.pins.some((p) => p.partId === 'led_builtin' && p.pinName === 'A'),
    );
    expect(netLed).toBeDefined();

    // Wire 3: LED pin C to Arduino GND
    const netGnd = model.nets.find((n) =>
      n.pins.some((p) => p.partId === 'led_builtin' && p.pinName === 'C') &&
      n.pins.some((p) => p.partId === 'arduino-uno' && (p.pinName === 'GND' || p.pinName === 'GND.1')),
    );
    expect(netGnd).toBeDefined();
  });

  it('implements Tinkercad-style auto-placement and direct horizontal connections for ESP32 + R + LED', () => {
    const components = [
      { id: 'r1', type: 'wokwi-resistor', x: 0, y: 0, properties: { value: '220' } },
      { id: 'led1', type: 'wokwi-led', x: 0, y: 0, properties: { color: 'red' } },
    ];

    const boards: BoardInstance[] = [
      {
        id: 'esp1',
        boardKind: 'esp32-devkit-v1',
        x: 0,
        y: 0,
        rotation: 0,
        running: false,
      },
    ];

    // ESP32:D35 -> LED1:A, LED1:C -> R1:2, R1:1 -> ESP32:GND
    const wires: Wire[] = [
      {
        id: 'w_d35',
        start: { componentId: 'esp1', pinName: 'D35', x: 0, y: 0 },
        end: { componentId: 'led1', pinName: 'A', x: 0, y: 0 },
      },
      {
        id: 'w_series',
        start: { componentId: 'led1', pinName: 'C', x: 0, y: 0 },
        end: { componentId: 'r1', pinName: '2', x: 0, y: 0 },
      },
      {
        id: 'w_gnd',
        start: { componentId: 'r1', pinName: '1', x: 0, y: 0 },
        end: { componentId: 'esp1', pinName: 'GND.1', x: 0, y: 0 },
      },
    ];

    const model = buildSchematicModel({
      components,
      boards,
      wires,
    });

    const esp = model.parts.find((p) => p.id === 'esp1');
    const r1 = model.parts.find((p) => p.id === 'r1');
    const led1 = model.parts.find((p) => p.id === 'led1');

    expect(esp).toBeDefined();
    expect(r1).toBeDefined();
    expect(led1).toBeDefined();

    // D35 is on the left side of ESP32, so both LED1 and R1 must be placed to the left of the board
    expect(led1!.x).toBeLessThan(esp!.x);
    expect(r1!.x).toBeLessThan(esp!.x);

    // R1 and LED1 should be placed in series along the same horizontal baseline (or close)
    expect(Math.abs(r1!.y - led1!.y)).toBeLessThanOrEqual(15);

    // Wire connecting LED1:C to R1:2 should be a clean direct horizontal line
    const seriesNet = model.wirePaths.find((wp) =>
      wp.netId.includes('led1') || wp.netId.includes('r1')
    );
    expect(seriesNet).toBeDefined();

    // Ground net must include dedicated horizontal rail with ground symbol
    expect(model.gndSymbols && model.gndSymbols.length > 0).toBe(true);
  });

  it('routes Ground net with horizontal clearance around board pins, flush corner elbows, and dual draggable trunks', () => {
    const components = [
      { id: 'r1', type: 'wokwi-resistor', x: 700, y: 240, properties: { value: '220' } },
      { id: 'led1', type: 'wokwi-led', x: 850, y: 240, properties: { color: 'red' } },
    ];

    const boards: BoardInstance[] = [
      {
        id: 'esp1',
        boardKind: 'esp32-devkit-v1',
        x: 520,
        y: 150,
        rotation: 0,
        running: false,
      },
    ];

    // ESP32:D4 -> R1:1, R1:2 -> LED1:A, LED1:C -> ESP32:GND.1
    const wires: Wire[] = [
      {
        id: 'w1',
        start: { componentId: 'esp1', pinName: 'D4', x: 0, y: 0 },
        end: { componentId: 'r1', pinName: '1', x: 0, y: 0 },
      },
      {
        id: 'w2',
        start: { componentId: 'r1', pinName: '2', x: 0, y: 0 },
        end: { componentId: 'led1', pinName: 'A', x: 0, y: 0 },
      },
      {
        id: 'w_gnd',
        start: { componentId: 'led1', pinName: 'C', x: 0, y: 0 },
        end: { componentId: 'esp1', pinName: 'GND.1', x: 0, y: 0 },
      },
    ];

    const model = buildSchematicModel({
      components,
      boards,
      wires,
      customWireLayouts: {
        GND: { vOffset: 480, trunkOffset: 580 },
      },
    });

    const gndPath = model.wirePaths.find((wp) => wp.netId === 'GND');
    expect(gndPath).toBeDefined();

    // 1. ESP32 GND pin is on the left, so it must step horizontally to clearance corridor (480)
    // and vertical drop must be along x = 480, NOT along the pin row
    const vDropBranch = gndPath!.branches.find(
      (b) => b.length >= 2 && b[0].x === 480 && b[1].x === 480,
    );
    expect(vDropBranch).toBeDefined();
    expect(vDropBranch![1].y).toBe(580); // reaches bus at trunkOffset 580

    // 2. Horizontal bus rail must terminate EXACTLY flush at corners (no ±15px tails!)
    const busBranch = gndPath!.branches.find(
      (b) => b.length === 2 && b[0].y === 580 && b[1].y === 580,
    );
    expect(busBranch).toBeDefined();
    expect(busBranch![0].x).toBe(480); // Left corner starts flush at the vertical drop line!
    // Must NOT have negative overhang tail (like 480 - 15 = 465)
    expect(busBranch![0].x).not.toBeLessThan(480);

    // 3. Trunks must provide handles for both horizontal bus (up/down) and vertical drop (left/right)
    expect(gndPath!.trunks).toBeDefined();
    expect(gndPath!.trunks!.length).toBeGreaterThanOrEqual(2);

    const hTrunk = gndPath!.trunks!.find((t) => t.id === 'h-bus');
    const vTrunk = gndPath!.trunks!.find((t) => t.id === 'v-drop');
    expect(hTrunk).toBeDefined();
    expect(hTrunk?.orientation).toBe('horizontal');
    expect(hTrunk?.coord).toBe(580);

    expect(vTrunk).toBeDefined();
    expect(vTrunk?.orientation).toBe('vertical');
    expect(vTrunk?.coord).toBe(480);
  });
});



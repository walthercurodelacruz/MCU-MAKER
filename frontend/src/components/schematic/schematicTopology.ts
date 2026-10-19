/**
 * Schematic Topology and Net Router
 *
 * Transforms the physical circuit representation into an electronic schematic model.
 * Features Tinkercad / KiCad style intelligent auto-placement, orthogonal channel
 * ribbon routing, dedicated ground and power buses, and standard IEEE/IEC symbols.
 */

import { UnionFind } from '../../simulation/spice/unionFind';
import { isBreadboard, breadboardGroupKey } from '../../utils/breadboardNets';
import { getSchematicSymbolDef } from './symbols';
import type {
  SchematicPlacedPart,
  SchematicNet,
  SchematicWirePath,
} from './types';
import type { BoardInstance } from '../../types/board';
import type { Wire } from '../../types/wire';

export interface CircuitRawData {
  components: Array<{
    id: string;
    type?: string;
    metadataId?: string;
    x: number;
    y: number;
    rotation?: number;
    properties?: Record<string, unknown>;
  }>;
  boards: BoardInstance[];
  wires: Wire[];
  customPositions?: Record<string, { x: number; y: number; rotation?: number }>;
  customWireLayouts?: Record<string, { trunkOffset?: number; vOffset?: number }>;
}

export interface SchematicGndSymbol {
  x: number;
  y: number;
  label?: string;
}

export interface SchematicModel {
  parts: SchematicPlacedPart[];
  nets: SchematicNet[];
  wirePaths: SchematicWirePath[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  gndSymbols?: SchematicGndSymbol[];
}

/**
 * Computes the absolute rotated offset of a pin inside a symbol bounding box.
 * SVG rotates around symbol center (width / 2, height / 2).
 */
export function rotatePinOffset(
  pinX: number,
  pinY: number,
  width: number,
  height: number,
  rotationDegrees: number = 0,
): { x: number; y: number } {
  const normRot = ((Math.round(rotationDegrees) % 360) + 360) % 360;
  if (normRot === 0) return { x: pinX, y: pinY };
  const cx = width / 2;
  const cy = height / 2;
  const dx = pinX - cx;
  const dy = pinY - cy;

  if (normRot === 90) {
    return { x: Math.round(cx - dy), y: Math.round(cy + dx) };
  } else if (normRot === 180) {
    return { x: Math.round(cx - dx), y: Math.round(cy - dy) };
  } else if (normRot === 270) {
    return { x: Math.round(cx + dy), y: Math.round(cy - dx) };
  }
  return { x: pinX, y: pinY };
}

/** Resolves component type whether given as `type` or `metadataId` */
export function getComponentType(c: { type?: string; metadataId?: string }): string {
  return c.type || c.metadataId || '';
}

/** Compares two pin names flexibly (e.g., '13' vs 'D13', 'GND' vs 'GND.1') */
export function pinsMatch(p1?: string, p2?: string): boolean {
  if (!p1 || !p2) return false;
  if (p1 === p2) return true;
  const s1 = p1.trim().toUpperCase();
  const s2 = p2.trim().toUpperCase();
  if (s1 === s2) return true;

  // Handle D13 vs 13, GP0 vs 0
  const num1 = s1.replace(/^(D|GP|GPIO)/, '');
  const num2 = s2.replace(/^(D|GP|GPIO)/, '');
  if (num1 && num2 && num1 === num2) return true;

  // Handle GND vs GND.1 vs GND.2
  if (s1.startsWith('GND') && s2.startsWith('GND')) return true;

  // Handle 3V3 vs 3.3V
  if ((s1 === '3V3' || s1 === '3.3V') && (s2 === '3V3' || s2 === '3.3V')) return true;

  return false;
}

/** Formats a numeric value with engineering units (e.g., 10000 -> 10k, 0.0000001 -> 100n) */
function formatComponentValue(rawType?: string, val?: unknown): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const str = String(val).trim();
  const num = parseFloat(str);
  if (isNaN(num)) return str;

  const type = (rawType || '').toLowerCase();
  if (type.includes('resistor')) {
    if (num >= 1e6) return `${(num / 1e6).toFixed(num % 1e6 === 0 ? 0 : 1)}MΩ`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(num % 1e3 === 0 ? 0 : 1)}kΩ`;
    return `${num}Ω`;
  }
  if (type.includes('cap')) {
    if (num >= 1e-3) return `${(num * 1e3).toFixed(1)}mF`;
    if (num >= 1e-6) return `${(num * 1e6).toFixed(num * 1e6 % 1 === 0 ? 0 : 1)}µF`;
    if (num >= 1e-9) return `${(num * 1e9).toFixed(num * 1e9 % 1 === 0 ? 0 : 1)}nF`;
    if (num >= 1e-12) return `${(num * 1e12).toFixed(0)}pF`;
    return `${num}F`;
  }
  return str;
}

/**
 * Intelligent Auto-Placement Engine (Tinkercad-Style)
 *
 * Places the primary MCU board at the center, groups peripherals by signal
 * pins into left and right clusters, aligns series chains (e.g. Resistor + LED)
 * horizontally, and maintains generous routing gutters.
 */
function computeAutoPlacement(
  boards: BoardInstance[],
  activeComponents: Array<{
    id: string;
    type?: string;
    metadataId?: string;
    properties?: Record<string, unknown>;
  }>,
  wires: Wire[],
  customPositions: Record<string, { x: number; y: number; rotation?: number }>,
): Record<string, { x: number; y: number; rotation: number }> {
  const result: Record<string, { x: number; y: number; rotation: number }> = {};

  const primaryBoard = boards[0];
  if (primaryBoard) {
    const custom = customPositions[primaryBoard.id];
    result[primaryBoard.id] = {
      x: custom ? custom.x : 520,
      y: custom ? custom.y : 180,
      rotation: custom?.rotation ?? 0,
    };
  }

  // Handle any additional boards
  boards.slice(1).forEach((b, idx) => {
    const custom = customPositions[b.id];
    result[b.id] = {
      x: custom ? custom.x : 520 + (idx + 1) * 260,
      y: custom ? custom.y : 180,
      rotation: custom?.rotation ?? 0,
    };
  });

  const boardDef = primaryBoard ? getSchematicSymbolDef(primaryBoard.boardKind) : null;
  const boardX = primaryBoard ? result[primaryBoard.id].x : 520;
  const boardY = primaryBoard ? result[primaryBoard.id].y : 180;
  const boardW = boardDef ? boardDef.width : 160;
  const boardH = boardDef ? boardDef.height : 320;

  // Preserve user custom positions if present
  activeComponents.forEach((c) => {
    if (customPositions[c.id]) {
      result[c.id] = {
        x: customPositions[c.id].x,
        y: customPositions[c.id].y,
        rotation: customPositions[c.id].rotation ?? 0,
      };
    }
  });

  const unplaced = activeComponents.filter((c) => !result[c.id]);
  if (unplaced.length === 0) return result;

  const isGndOrPwr = (pName: string) => {
    const s = pName.toLowerCase();
    return s.startsWith('gnd') || s === '5v' || s === '3v3' || s === '3.3v' || s === 'vin' || s === 'vcc';
  };

  interface Chain {
    boardPinName: string;
    isLeft: boolean;
    pinY: number;
    components: string[];
  }

  const chains: Chain[] = [];
  const assigned = new Set<string>();

  const compWiresMap = new Map<string, Wire[]>();
  for (const c of unplaced) {
    compWiresMap.set(
      c.id,
      wires.filter((w) => w.start.componentId === c.id || w.end.componentId === c.id),
    );
  }

  if (primaryBoard && boardDef) {
    for (const c of unplaced) {
      if (assigned.has(c.id)) continue;
      const cWires = compWiresMap.get(c.id) || [];
      for (const w of cWires) {
        const otherEp = w.start.componentId === c.id ? w.end : w.start;
        if (otherEp.componentId === primaryBoard.id && !isGndOrPwr(otherEp.pinName)) {
          const bPin = boardDef.pins.find((p) => pinsMatch(p.name, otherEp.pinName));
          const isLeft = bPin ? bPin.direction === 'left' || bPin.x <= boardW / 2 : true;
          const pinY = bPin ? boardY + bPin.y : boardY + 120;

          const chainComps = [c.id];
          assigned.add(c.id);

          // Find series partner (e.g. Resistor paired with LED)
          for (const w2 of cWires) {
            const nextEp = w2.start.componentId === c.id ? w2.end : w2.start;
            if (nextEp.componentId !== primaryBoard.id && !assigned.has(nextEp.componentId)) {
              const nextComp = unplaced.find((u) => u.id === nextEp.componentId);
              if (nextComp) {
                chainComps.push(nextComp.id);
                assigned.add(nextComp.id);
              }
            }
          }

          chains.push({
            boardPinName: otherEp.pinName,
            isLeft,
            pinY,
            components: chainComps,
          });
          break;
        }
      }
    }
  }

  const leftChains = chains.filter((ch) => ch.isLeft).sort((a, b) => a.pinY - b.pinY);
  const rightChains = chains.filter((ch) => !ch.isLeft).sort((a, b) => a.pinY - b.pinY);

  // Layout Left Side Components
  if (leftChains.length > 0) {
    if (leftChains.length <= 2) {
      // 1 or 2 chains: align straight horizontally with board pin Y
      leftChains.forEach((ch) => {
        ch.components.forEach((cId, idx) => {
          const comp = activeComponents.find((c) => c.id === cId);
          const cDef = comp
            ? getSchematicSymbolDef(getComponentType(comp))
            : { width: 60, height: 30 };
          result[cId] = {
            x: boardX - 160 - idx * 100,
            y: Math.round(ch.pinY - cDef.height / 2),
            rotation: 0,
          };
        });
      });
    } else {
      // 3 or more chains: arrange in a clean horizontal row (Tinkercad blueprint style)
      const baselineY = boardY + Math.min(boardH * 0.45, 140);
      leftChains.forEach((ch, chIdx) => {
        const groupX = boardX - 160 - chIdx * 90;
        ch.components.forEach((cId, idx) => {
          const comp = activeComponents.find((c) => c.id === cId);
          const cDef = comp
            ? getSchematicSymbolDef(getComponentType(comp))
            : { width: 60, height: 30 };
          result[cId] = {
            x: groupX - idx * 90,
            y: Math.round(baselineY - cDef.height / 2),
            rotation: 0,
          };
        });
      });
    }
  }

  // Layout Right Side Components
  if (rightChains.length > 0) {
    if (rightChains.length <= 2) {
      rightChains.forEach((ch) => {
        ch.components.forEach((cId, idx) => {
          const comp = activeComponents.find((c) => c.id === cId);
          const cDef = comp
            ? getSchematicSymbolDef(getComponentType(comp))
            : { width: 60, height: 30 };
          result[cId] = {
            x: boardX + boardW + 160 + idx * 100,
            y: Math.round(ch.pinY - cDef.height / 2),
            rotation: 0,
          };
        });
      });
    } else {
      const baselineY = boardY + Math.min(boardH * 0.45, 140);
      rightChains.forEach((ch, chIdx) => {
        const groupX = boardX + boardW + 160 + chIdx * 90;
        ch.components.forEach((cId, idx) => {
          const comp = activeComponents.find((c) => c.id === cId);
          const cDef = comp
            ? getSchematicSymbolDef(getComponentType(comp))
            : { width: 60, height: 30 };
          result[cId] = {
            x: groupX + idx * 90,
            y: Math.round(baselineY - cDef.height / 2),
            rotation: 0,
          };
        });
      });
    }
  }

  // Position remaining unassigned components in a tidy grid below
  const remaining = unplaced.filter((c) => !result[c.id]);
  remaining.forEach((c, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    result[c.id] = {
      x: boardX - 100 + col * 160,
      y: boardY + boardH + 80 + row * 120,
      rotation: 0,
    };
  });

  return result;
}

export function buildSchematicModel(data: CircuitRawData): SchematicModel {
  const { components, boards, wires, customPositions = {}, customWireLayouts = {} } = data;

  const breadboardParts = components.filter((c) => isBreadboard(getComponentType(c)));
  const activeComponents = components.filter((c) => !isBreadboard(getComponentType(c)));

  // 1. Calculate Auto-Placement for unpositioned parts
  const layoutPositions = computeAutoPlacement(boards, activeComponents, wires, customPositions);

  const parts: SchematicPlacedPart[] = [];
  const designatorCounters: Record<string, number> = {};

  const getNextDesignator = (prefix: string) => {
    designatorCounters[prefix] = (designatorCounters[prefix] || 0) + 1;
    return `${prefix}${designatorCounters[prefix]}`;
  };

  // Place Boards
  boards.forEach((board) => {
    const symbolDef = getSchematicSymbolDef(board.boardKind);
    const designator = getNextDesignator(symbolDef.designatorPrefix);
    const pos = layoutPositions[board.id] || { x: 520, y: 180, rotation: 0 };

    const absolutePins = symbolDef.pins.map((p) => {
      const rotPin = rotatePinOffset(p.x, p.y, symbolDef.width, symbolDef.height, pos.rotation);
      return {
        ...p,
        absoluteX: pos.x + rotPin.x,
        absoluteY: pos.y + rotPin.y,
      };
    });

    parts.push({
      id: board.id,
      originalId: board.id,
      type: board.boardKind,
      designator,
      displayName: symbolDef.displayName,
      x: pos.x,
      y: pos.y,
      rotation: pos.rotation,
      width: symbolDef.width,
      height: symbolDef.height,
      pins: absolutePins,
      isBoard: true,
    });
  });

  // Place Active Components
  activeComponents.forEach((comp) => {
    const compType = getComponentType(comp);
    const knownPins = wires
      .filter((w) => w.start.componentId === comp.id || w.end.componentId === comp.id)
      .map((w) => (w.start.componentId === comp.id ? w.start.pinName : w.end.pinName));

    const symbolDef = getSchematicSymbolDef(compType, knownPins);
    const designator = getNextDesignator(symbolDef.designatorPrefix);
    const pos = layoutPositions[comp.id] || { x: 200, y: 300, rotation: 0 };

    const val = formatComponentValue(
      compType,
      comp.properties?.value ?? comp.properties?.resistance ?? comp.properties?.capacitance,
    );

    const absolutePins = symbolDef.pins.map((p) => {
      const rotPin = rotatePinOffset(p.x, p.y, symbolDef.width, symbolDef.height, pos.rotation);
      return {
        ...p,
        absoluteX: pos.x + rotPin.x,
        absoluteY: pos.y + rotPin.y,
      };
    });

    parts.push({
      id: comp.id,
      originalId: comp.id,
      type: compType,
      designator,
      value: val,
      displayName: symbolDef.displayName,
      x: pos.x,
      y: pos.y,
      rotation: pos.rotation,
      width: symbolDef.width,
      height: symbolDef.height,
      pins: absolutePins,
      properties: comp.properties,
    });
  });

  // Helper to resolve an endpoint pinName to canonical pin name
  const resolveCanonicalPinName = (componentId: string, rawPinName: string): string => {
    const part = parts.find((p) => p.id === componentId);
    if (!part) return rawPinName;
    const direct = part.pins.find((p) => p.name === rawPinName);
    if (direct) return direct.name;
    const matched = part.pins.find(
      (p) => pinsMatch(p.name, rawPinName) || p.aliases?.some((a) => pinsMatch(a, rawPinName)),
    );
    return matched ? matched.name : rawPinName;
  };

  // 2. Identify Breadboards & Union-Find Electrical Nets
  const uf = new UnionFind();

  for (const bb of breadboardParts) {
    const bbType = getComponentType(bb);
    const groupAnchors = new Map<string, string>();
    for (const w of wires) {
      const checkEndpoint = (ep: { componentId: string; pinName: string }) => {
        if (ep.componentId === bb.id) {
          const group = breadboardGroupKey(bbType, ep.pinName);
          if (group) {
            const key = `${bb.id}:${ep.pinName}`;
            uf.add(key);
            const anchor = groupAnchors.get(group);
            if (anchor) {
              uf.union(anchor, key);
            } else {
              groupAnchors.set(group, key);
            }
          }
        }
      };
      checkEndpoint(w.start);
      checkEndpoint(w.end);
    }
  }

  for (const w of wires) {
    const pin1 = resolveCanonicalPinName(w.start.componentId, w.start.pinName);
    const pin2 = resolveCanonicalPinName(w.end.componentId, w.end.pinName);
    const k1 = `${w.start.componentId}:${pin1}`;
    const k2 = `${w.end.componentId}:${pin2}`;
    uf.union(k1, k2);
  }

  // Tag canonical ground and power nets
  for (const w of wires) {
    for (const ep of [w.start, w.end]) {
      const pinName = resolveCanonicalPinName(ep.componentId, ep.pinName);
      const pinLower = pinName.toLowerCase();
      const key = `${ep.componentId}:${pinName}`;
      if (pinLower === 'gnd' || pinLower.startsWith('gnd.') || pinLower === 'ground') {
        uf.setCanonical(key, 'GND');
      } else if (pinLower === '5v' || pinLower === 'vcc') {
        uf.setCanonical(key, '5V');
      } else if (pinLower === '3v3' || pinLower === '3.3v') {
        uf.setCanonical(key, '3.3V');
      }
    }
  }

  // 3. Resolve Nets & Schematic Pin Coordinates
  const netMap = new Map<string, SchematicNet>();

  for (const part of parts) {
    for (const p of part.pins) {
      const pinKey = `${part.id}:${p.name}`;
      const hasWire = wires.some((w) => {
        const pin1 = resolveCanonicalPinName(w.start.componentId, w.start.pinName);
        const pin2 = resolveCanonicalPinName(w.end.componentId, w.end.pinName);
        return (
          (w.start.componentId === part.id && pin1 === p.name) ||
          (w.end.componentId === part.id && pin2 === p.name)
        );
      });
      if (!hasWire) continue;

      const netId = uf.find(pinKey);
      if (!netMap.has(netId)) {
        const isGnd = netId === 'GND';
        const isPwr = netId === '5V' || netId === '3.3V' || netId === 'VCC';
        netMap.set(netId, {
          id: netId,
          name: netId,
          isGround: isGnd,
          isPower: isPwr,
          voltage: isPwr ? netId : undefined,
          pins: [],
          color: isGnd ? '#00e5ff' : isPwr ? '#ef4444' : '#10b981',
        });
      }
      netMap.get(netId)!.pins.push({
        partId: part.id,
        pinName: p.name,
        x: p.absoluteX,
        y: p.absoluteY,
      });
    }
  }

  const netWireIdsMap = new Map<string, Set<string>>();
  for (const w of wires) {
    const pin1 = resolveCanonicalPinName(w.start.componentId, w.start.pinName);
    const pin2 = resolveCanonicalPinName(w.end.componentId, w.end.pinName);
    const k1 = `${w.start.componentId}:${pin1}`;
    const k2 = `${w.end.componentId}:${pin2}`;
    const n1 = uf.find(k1);
    const n2 = uf.find(k2);
    const targetNet = netMap.has(n1) ? n1 : netMap.has(n2) ? n2 : n1;
    if (targetNet) {
      if (!netWireIdsMap.has(targetNet)) {
        netWireIdsMap.set(targetNet, new Set());
      }
      netWireIdsMap.get(targetNet)!.add(w.id);
    }
  }

  // 4. Generate Orthogonal Wire Paths, Junction Dots & Ground Symbols
  const wirePaths: SchematicWirePath[] = [];
  const gndSymbols: SchematicGndSymbol[] = [];

  const partsMinX = parts.length > 0 ? Math.min(...parts.map((p) => p.x)) : 0;
  const partsMaxX = parts.length > 0 ? Math.max(...parts.map((p) => p.x + p.width)) : 800;
  const partsMinY = parts.length > 0 ? Math.min(...parts.map((p) => p.y)) : 0;
  const partsMaxY = parts.length > 0 ? Math.max(...parts.map((p) => p.y + p.height)) : 600;

  const primaryBoardPart = parts.find((p) => p.isBoard);
  const partsMap = new Map<string, SchematicPlacedPart>(parts.map((p) => [p.id, p]));

  // Group signal nets by primary board side to allocate channel routing corridors
  const leftSignalNets: string[] = [];
  const rightSignalNets: string[] = [];

  for (const net of netMap.values()) {
    if (net.isGround || net.isPower || net.pins.length < 2) continue;
    const bPin = net.pins.find((p) => p.partId === primaryBoardPart?.id);
    if (bPin && primaryBoardPart) {
      if (bPin.x <= primaryBoardPart.x + primaryBoardPart.width / 2) {
        leftSignalNets.push(net.id);
      } else {
        rightSignalNets.push(net.id);
      }
    }
  }

  leftSignalNets.sort((idA, idB) => {
    const pinA = netMap.get(idA)?.pins.find((p) => p.partId === primaryBoardPart?.id);
    const pinB = netMap.get(idB)?.pins.find((p) => p.partId === primaryBoardPart?.id);
    return (pinA?.y ?? 0) - (pinB?.y ?? 0);
  });

  rightSignalNets.sort((idA, idB) => {
    const pinA = netMap.get(idA)?.pins.find((p) => p.partId === primaryBoardPart?.id);
    const pinB = netMap.get(idB)?.pins.find((p) => p.partId === primaryBoardPart?.id);
    return (pinA?.y ?? 0) - (pinB?.y ?? 0);
  });

  for (const net of netMap.values()) {
    if (net.pins.length < 2) continue;
    const customLayout = customWireLayouts?.[net.id];
    const junctions: Array<{ x: number; y: number }> = [];
    const branches: Array<Array<{ x: number; y: number }>> = [];
    let trunk: SchematicWirePath['trunk'];
    const trunks: SchematicWireTrunk[] = [];

    // ── CASE 1: Ground Net (Dedicated horizontal bottom rail like Tinkercad) ──
    if (net.isGround) {
      const netPins = [...net.pins];
      const gndBusY =
        customLayout?.trunkOffset !== undefined
          ? customLayout.trunkOffset
          : partsMaxY + 36;

      // Determine drop coordinates for each pin so we never route through component bodies or pin rows
      const dropPoints: Array<{ pin: (typeof netPins)[0]; dropX: number; hasHorizontalExit: boolean }> = [];

      for (const p of netPins) {
        const part = partsMap.get(p.partId);
        let dropX = p.x;
        let hasHorizontalExit = false;

        const hasOtherPinsInColumn =
          part &&
          (part.isBoard ||
            part.pins.some(
              (other) =>
                other.name !== p.pinName &&
                Math.abs(other.absoluteX - p.x) <= 10 &&
                Math.abs(other.absoluteY - p.y) > 5,
            ));

        if (hasOtherPinsInColumn && part) {
          const isLeft = p.x <= part.x + part.width / 2;
          dropX =
            customLayout?.vOffset !== undefined
              ? customLayout.vOffset
              : isLeft
              ? p.x - 30
              : p.x + 30;
          hasHorizontalExit = true;
        }

        dropPoints.push({ pin: p, dropX, hasHorizontalExit });
      }

      const allDropX = dropPoints.map((dp) => dp.dropX);
      const busMinX = Math.min(...allDropX);
      const busMaxX = Math.max(...allDropX);

      // 1. Horizontal Bus Rail (EXACT flush corners, NO overhanging -15px / +15px tails!)
      if (busMinX !== busMaxX) {
        branches.push([
          { x: busMinX, y: gndBusY },
          { x: busMaxX, y: gndBusY },
        ]);
      }

      // 2. Route each pin into the bus
      const dropsByX = new Map<number, typeof dropPoints>();
      for (const dp of dropPoints) {
        if (!dropsByX.has(dp.dropX)) {
          dropsByX.set(dp.dropX, []);
        }
        dropsByX.get(dp.dropX)!.push(dp);
      }

      for (const [dropX, dps] of dropsByX.entries()) {
        for (const dp of dps) {
          if (dp.hasHorizontalExit) {
            branches.push([
              { x: dp.pin.x, y: dp.pin.y },
              { x: dropX, y: dp.pin.y },
            ]);
          }
        }

        const minY = Math.min(...dps.map((dp) => dp.pin.y));
        branches.push([
          { x: dropX, y: minY },
          { x: dropX, y: gndBusY },
        ]);

        // Junction dots:
        // A) At the bus intersection (dropX, gndBusY): ONLY if it is an internal T-junction between busMinX and busMaxX!
        // At the outer ends (busMinX and busMaxX), it is a 90° corner/elbow, NOT a T-junction, so no solder dot!
        if (dropX > busMinX && dropX < busMaxX) {
          junctions.push({ x: dropX, y: gndBusY });
        }

        // B) If multiple pins connect to the same vertical drop line:
        if (dps.length > 1) {
          for (const dp of dps) {
            if (dp.pin.y > minY) {
              junctions.push({ x: dropX, y: dp.pin.y });
            }
          }
        }
      }

      const gndSymX = Math.round((busMinX + busMaxX) / 2);
      gndSymbols.push({
        x: gndSymX,
        y: gndBusY,
        label: primaryBoardPart ? `${primaryBoardPart.designator}_GND` : 'GND',
      });

      // A) Horizontal bus trunk (drag up/down)
      const hTrunk: SchematicWireTrunk = {
        id: 'h-bus',
        orientation: 'horizontal',
        coord: gndBusY,
        start: busMinX,
        end: busMaxX,
        handlePos: { x: gndSymX, y: gndBusY },
      };
      trunks.push(hTrunk);

      // B) Vertical clearance trunk(s) (drag left/right) for board/IC exits
      for (const dp of dropPoints) {
        if (dp.hasHorizontalExit) {
          const vDropY1 = dp.pin.y;
          const vDropY2 = gndBusY;
          trunks.push({
            id: 'v-drop',
            orientation: 'vertical',
            coord: dp.dropX,
            start: Math.min(vDropY1, vDropY2),
            end: Math.max(vDropY1, vDropY2),
            handlePos: {
              x: dp.dropX,
              y: Math.round((vDropY1 + vDropY2) / 2),
            },
          });
          break;
        }
      }

      trunk = hTrunk;

      const pathData = branches
        .map((b) => 'M ' + b.map((pt) => `${pt.x} ${pt.y}`).join(' L '))
        .join(' ');

      wirePaths.push({
        netId: net.id,
        color: '#00e5ff',
        points: branches.flat(),
        branches,
        pathData,
        trunk,
        trunks,
        junctions,
        wireIds: Array.from(netWireIdsMap.get(net.id) || []),
      });
      continue;
    }

    // ── CASE 2: Power Net (Dedicated horizontal top rail) ──
    if (net.isPower) {
      const netPins = [...net.pins];
      const pwrBusY =
        customLayout?.trunkOffset !== undefined
          ? customLayout.trunkOffset
          : partsMinY - 32;

      const dropPoints: Array<{ pin: (typeof netPins)[0]; dropX: number; hasHorizontalExit: boolean }> = [];

      for (const p of netPins) {
        const part = partsMap.get(p.partId);
        let dropX = p.x;
        let hasHorizontalExit = false;

        const hasOtherPinsInColumn =
          part &&
          (part.isBoard ||
            part.pins.some(
              (other) =>
                other.name !== p.pinName &&
                Math.abs(other.absoluteX - p.x) <= 10 &&
                Math.abs(other.absoluteY - p.y) > 5,
            ));

        if (hasOtherPinsInColumn && part) {
          const isLeft = p.x <= part.x + part.width / 2;
          dropX =
            customLayout?.vOffset !== undefined
              ? customLayout.vOffset
              : isLeft
              ? p.x - 30
              : p.x + 30;
          hasHorizontalExit = true;
        }

        dropPoints.push({ pin: p, dropX, hasHorizontalExit });
      }

      const allDropX = dropPoints.map((dp) => dp.dropX);
      const busMinX = Math.min(...allDropX);
      const busMaxX = Math.max(...allDropX);

      if (busMinX !== busMaxX) {
        branches.push([
          { x: busMinX, y: pwrBusY },
          { x: busMaxX, y: pwrBusY },
        ]);
      }

      const dropsByX = new Map<number, typeof dropPoints>();
      for (const dp of dropPoints) {
        if (!dropsByX.has(dp.dropX)) {
          dropsByX.set(dp.dropX, []);
        }
        dropsByX.get(dp.dropX)!.push(dp);
      }

      for (const [dropX, dps] of dropsByX.entries()) {
        for (const dp of dps) {
          if (dp.hasHorizontalExit) {
            branches.push([
              { x: dp.pin.x, y: dp.pin.y },
              { x: dropX, y: dp.pin.y },
            ]);
          }
        }

        const maxY = Math.max(...dps.map((dp) => dp.pin.y));
        branches.push([
          { x: dropX, y: maxY },
          { x: dropX, y: pwrBusY },
        ]);

        if (dropX > busMinX && dropX < busMaxX) {
          junctions.push({ x: dropX, y: pwrBusY });
        }

        if (dps.length > 1) {
          for (const dp of dps) {
            if (dp.pin.y < maxY) {
              junctions.push({ x: dropX, y: dp.pin.y });
            }
          }
        }
      }

      const hTrunk: SchematicWireTrunk = {
        id: 'h-bus',
        orientation: 'horizontal',
        coord: pwrBusY,
        start: busMinX,
        end: busMaxX,
        handlePos: { x: Math.round((busMinX + busMaxX) / 2), y: pwrBusY },
      };
      trunks.push(hTrunk);

      for (const dp of dropPoints) {
        if (dp.hasHorizontalExit) {
          const vDropY1 = dp.pin.y;
          const vDropY2 = pwrBusY;
          trunks.push({
            id: 'v-drop',
            orientation: 'vertical',
            coord: dp.dropX,
            start: Math.min(vDropY1, vDropY2),
            end: Math.max(vDropY1, vDropY2),
            handlePos: {
              x: dp.dropX,
              y: Math.round((vDropY1 + vDropY2) / 2),
            },
          });
          break;
        }
      }

      trunk = hTrunk;

      const pathData = branches
        .map((b) => 'M ' + b.map((pt) => `${pt.x} ${pt.y}`).join(' L '))
        .join(' ');

      wirePaths.push({
        netId: net.id,
        color: '#ef4444',
        points: branches.flat(),
        branches,
        pathData,
        trunk,
        trunks,
        junctions,
        wireIds: Array.from(netWireIdsMap.get(net.id) || []),
      });
      continue;
    }

    // ── CASE 3: Signal Nets ──
    if (net.pins.length === 2) {
      const [p1, p2] = [...net.pins].sort((a, b) => a.x - b.x);

      // Subcase 3A: Direct in-line connection (e.g. Resistor right pin to LED left pin)
      if (Math.abs(p1.y - p2.y) <= 8) {
        branches.push([
          { x: p1.x, y: p1.y },
          { x: p2.x, y: p1.y },
        ]);
      } else if (Math.abs(p1.x - p2.x) <= 8) {
        branches.push([
          { x: p1.x, y: p1.y },
          { x: p1.x, y: p2.y },
        ]);
      } else {
        // Subcase 3B: Board-to-Component connection (Ribbon staircase bus like Tinkercad)
        const pBoard =
          p1.partId === primaryBoardPart?.id
            ? p1
            : p2.partId === primaryBoardPart?.id
            ? p2
            : null;
        const pComp = pBoard === p1 ? p2 : p1;

        if (pBoard && pComp && primaryBoardPart) {
          const isLeft = pBoard.x <= primaryBoardPart.x + primaryBoardPart.width / 2;
          const channelList = isLeft ? leftSignalNets : rightSignalNets;
          const rawIdx = channelList.indexOf(net.id);
          const channelIdx = rawIdx >= 0 ? rawIdx : 0;

          const channelX =
            customLayout?.trunkOffset !== undefined
              ? customLayout.trunkOffset
              : isLeft
              ? primaryBoardPart.x - 24 - channelIdx * 14
              : primaryBoardPart.x + primaryBoardPart.width + 24 + channelIdx * 14;

          const busY = partsMaxY + 14 + channelIdx * 12;

          branches.push([
            { x: pBoard.x, y: pBoard.y },
            { x: channelX, y: pBoard.y },
            { x: channelX, y: busY },
            { x: pComp.x, y: busY },
            { x: pComp.x, y: pComp.y },
          ]);

          trunk = {
            orientation: 'vertical',
            coord: channelX,
            start: Math.min(pBoard.y, busY),
            end: Math.max(pBoard.y, busY),
            handlePos: { x: channelX, y: Math.round((pBoard.y + busY) / 2) },
          };
        } else {
          // Standard stepped Z-route between offset components
          const midX =
            customLayout?.trunkOffset !== undefined
              ? customLayout.trunkOffset
              : Math.round((p1.x + p2.x) / 2);

          branches.push([
            { x: p1.x, y: p1.y },
            { x: midX, y: p1.y },
            { x: midX, y: p2.y },
            { x: p2.x, y: p2.y },
          ]);

          trunk = {
            orientation: 'vertical',
            coord: midX,
            start: Math.min(p1.y, p2.y),
            end: Math.max(p1.y, p2.y),
            handlePos: { x: midX, y: Math.round((p1.y + p2.y) / 2) },
          };
        }
      }
    } else {
      // Multi-pin net (3+ pins, e.g. shared bus or I2C)
      const sortedPins = [...net.pins].sort((a, b) => a.x - b.x);
      const minX = Math.min(...sortedPins.map((p) => p.x));
      const maxX = Math.max(...sortedPins.map((p) => p.x));
      const trunkY =
        customLayout?.trunkOffset !== undefined
          ? customLayout.trunkOffset
          : Math.round(sortedPins.reduce((sum, p) => sum + p.y, 0) / sortedPins.length);

      branches.push([
        { x: minX, y: trunkY },
        { x: maxX, y: trunkY },
      ]);

      for (const p of sortedPins) {
        branches.push([
          { x: p.x, y: p.y },
          { x: p.x, y: trunkY },
        ]);
        if (p.x >= minX && p.x <= maxX) {
          junctions.push({ x: p.x, y: trunkY });
        }
      }

      trunk = {
        orientation: 'horizontal',
        coord: trunkY,
        start: minX,
        end: maxX,
        handlePos: { x: Math.round((minX + maxX) / 2), y: trunkY },
      };
    }

    const pathData = branches
      .map((b) => 'M ' + b.map((pt) => `${pt.x} ${pt.y}`).join(' L '))
      .join(' ');

    wirePaths.push({
      netId: net.id,
      color: net.color || '#10b981',
      points: branches.flat(),
      branches,
      pathData,
      trunk,
      junctions,
      wireIds: Array.from(netWireIdsMap.get(net.id) || []),
    });
  }

  // 5. Global Bounding Box
  let minX = 0;
  let minY = 0;
  let maxX = 1000;
  let maxY = 700;

  if (parts.length > 0) {
    const allX = [
      ...parts.map((p) => p.x),
      ...parts.map((p) => p.x + p.width),
      ...wirePaths.flatMap((w) => w.points.map((pt) => pt.x)),
    ];
    const allY = [
      ...parts.map((p) => p.y),
      ...parts.map((p) => p.y + p.height),
      ...wirePaths.flatMap((w) => w.points.map((pt) => pt.y)),
    ];
    minX = Math.min(...allX) - 80;
    minY = Math.min(...allY) - 80;
    maxX = Math.max(...allX) + 80;
    maxY = Math.max(...allY) + 80;
  }

  return {
    parts,
    nets: Array.from(netMap.values()),
    wirePaths,
    gndSymbols,
    bounds: {
      minX: Math.max(0, minX),
      minY: Math.max(0, minY),
      maxX: Math.max(1050, maxX),
      maxY: Math.max(720, maxY),
    },
  };
}

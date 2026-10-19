/**
 * SchematicCanvas — Interactive Electronic Schematic Viewer
 *
 * Renders circuit components as IEEE/IEC schematic symbols with orthogonal
 * channel ribbon wires, Tinkercad-style auto-placement, dedicated ground buses,
 * interactive trunk editing, pin-to-pin wiring, and high-resolution exports.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { useEditorStore } from '../../store/useEditorStore';
import { buildSchematicModel } from './schematicTopology';
import { getSchematicSymbolDef } from './symbols';
import type { SchematicPlacedPart, SchematicWirePath, SchematicPin } from './types';
import './SchematicCanvas.css';

interface SchematicCanvasProps {
  onSwitchToPhysical?: () => void;
  selectedComponentId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  onRotateComponent?: (id: string) => void;
  onDeleteComponent?: (id: string) => void;
}

/**
 * Tinkercad-Style Engineering Drawing Sheet Frame
 * Renders professional zone markings (1..6 / A..E) and title block.
 */
const SchematicDrawingSheet: React.FC<{
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  theme: 'dark' | 'light';
  showFrame?: boolean;
}> = ({ bounds, theme, showFrame = true }) => {
  if (!showFrame) return null;

  const minW = 1100;
  const minH = 760;
  const contentW = bounds.maxX - bounds.minX;
  const contentH = bounds.maxY - bounds.minY;
  const width = Math.max(contentW + 180, minW);
  const height = Math.max(contentH + 180, minH);
  const x = Math.min(bounds.minX - 90, (bounds.minX + bounds.maxX) / 2 - width / 2);
  const y = Math.min(bounds.minY - 90, (bounds.minY + bounds.maxY) / 2 - height / 2);

  const frameStroke = theme === 'light' ? '#dc2626' : 'rgba(56, 189, 248, 0.45)';
  const textFill = theme === 'light' ? '#dc2626' : '#38bdf8';
  const mutedText = theme === 'light' ? '#ef4444' : 'rgba(56, 189, 248, 0.7)';

  // 6 columns (1..6)
  const xCols = [0, 1, 2, 3, 4, 5, 6].map((i) => x + 16 + (i * (width - 32)) / 6);
  // 5 rows (A..E)
  const yRows = [0, 1, 2, 3, 4, 5].map((i) => y + 16 + (i * (height - 32)) / 5);

  // Title Block in bottom-right corner
  const tbW = 240;
  const tbH = 70;
  const tbX = x + width - 16 - tbW;
  const tbY = y + height - 16 - tbH;

  const todayStr = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <g className="sch-drawing-sheet" pointerEvents="none">
      {/* Outer Border */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={frameStroke}
        strokeWidth="1.8"
      />
      {/* Inner Frame */}
      <rect
        x={x + 16}
        y={y + 16}
        width={width - 32}
        height={height - 32}
        fill="none"
        stroke={frameStroke}
        strokeWidth="1.2"
      />

      {/* Zone divisions (1..6) top and bottom */}
      {['1', '2', '3', '4', '5', '6'].map((num, i) => {
        const midColX = (xCols[i] + xCols[i + 1]) / 2;
        return (
          <React.Fragment key={`col-${i}`}>
            <line x1={xCols[i + 1]} y1={y} x2={xCols[i + 1]} y2={y + 16} stroke={frameStroke} strokeWidth="1" />
            <text x={midColX} y={y + 12} textAnchor="middle" fontSize="10" fontWeight="bold" fill={mutedText}>
              {num}
            </text>
            <line x1={xCols[i + 1]} y1={y + height - 16} x2={xCols[i + 1]} y2={y + height} stroke={frameStroke} strokeWidth="1" />
            <text x={midColX} y={y + height - 4} textAnchor="middle" fontSize="10" fontWeight="bold" fill={mutedText}>
              {num}
            </text>
          </React.Fragment>
        );
      })}

      {/* Zone divisions (A..E) left and right */}
      {['A', 'B', 'C', 'D', 'E'].map((letter, i) => {
        const midRowY = (yRows[i] + yRows[i + 1]) / 2;
        return (
          <React.Fragment key={`row-${i}`}>
            <line x1={x} y1={yRows[i + 1]} x2={x + 16} y2={yRows[i + 1]} stroke={frameStroke} strokeWidth="1" />
            <text x={x + 11} y={midRowY + 3.5} textAnchor="middle" fontSize="10" fontWeight="bold" fill={mutedText}>
              {letter}
            </text>
            <line x1={x + width - 16} y1={yRows[i + 1]} x2={x + width} y2={yRows[i + 1]} stroke={frameStroke} strokeWidth="1" />
            <text x={x + width - 6} y={midRowY + 3.5} textAnchor="middle" fontSize="10" fontWeight="bold" fill={mutedText}>
              {letter}
            </text>
          </React.Fragment>
        );
      })}

      {/* Title Block Box */}
      <rect
        x={tbX}
        y={tbY}
        width={tbW}
        height={tbH}
        fill={theme === 'dark' ? 'rgba(10, 14, 23, 0.92)' : '#ffffff'}
        stroke={frameStroke}
        strokeWidth="1.2"
      />
      <line x1={tbX} y1={tbY + 32} x2={tbX + tbW} y2={tbY + 32} stroke={frameStroke} strokeWidth="1" />
      <line x1={tbX + 160} y1={tbY + 32} x2={tbX + 160} y2={tbY + tbH} stroke={frameStroke} strokeWidth="1" />

      {/* Title block labels */}
      <text x={tbX + 8} y={tbY + 14} fontSize="9" fill={mutedText}>
        Title:
      </text>
      <text x={tbX + 38} y={tbY + 16} fontSize="11" fontWeight="bold" fill={textFill}>
        ESQUEMA DE CIRCUITO
      </text>

      <text x={tbX + 8} y={tbY + 48} fontSize="9" fill={mutedText}>
        Date:
      </text>
      <text x={tbX + 38} y={tbY + 50} fontSize="10" fill={textFill} fontFamily="monospace">
        {todayStr}
      </text>

      <text x={tbX + 166} y={tbY + 48} fontSize="9" fill={mutedText}>
        Sheet:
      </text>
      <text x={tbX + 204} y={tbY + 50} fontSize="10" fontWeight="bold" fill={textFill} fontFamily="monospace">
        1/1
      </text>

      {/* Bottom Left Logo (Tinkercad style) */}
      <text x={x + 24} y={y + height - 26} fontSize="11" fontWeight="bold" fill={textFill} fontFamily="sans-serif">
        Made with MCU Maker®
      </text>
    </g>
  );
};

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  onSwitchToPhysical: _onSwitchToPhysical,
  selectedComponentId,
  onSelectComponent,
  onRotateComponent,
  onDeleteComponent,
}) => {
  const { components, boards, wires, addWire, removeWire, pushCommand } = useSimulatorStore();
  const {
    schematicPositions,
    schematicWireLayouts,
    setSchematicPositions,
    setSchematicWireLayouts,
    resetSchematicLayout,
  } = useEditorStore();

  // Viewport Pan & Zoom
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [zoom, setZoom] = useState<number>(1);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [showDrawingSheet, setShowDrawingSheet] = useState<boolean>(true);

  // Selection & Highlighting
  const [selectedPartId, setSelectedPartId] = useState<string | null>(selectedComponentId ?? null);
  const [selectedWireNetId, setSelectedWireNetId] = useState<string | null>(null);
  const [hoveredNetId, setHoveredNetId] = useState<string | null>(null);
  const [hoveredPin, setHoveredPin] = useState<{
    partId: string;
    pinName: string;
    x: number;
    y: number;
  } | null>(null);

  // Pin-to-pin wiring in schematic mode
  const [wiringFrom, setWiringFrom] = useState<{
    partId: string;
    pinName: string;
    x: number;
    y: number;
  } | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (selectedComponentId !== undefined) {
      setSelectedPartId(selectedComponentId);
      if (selectedComponentId) {
        setSelectedWireNetId(null);
      }
    }
  }, [selectedComponentId]);

  // Initial fit-to-screen guard so moving components doesn't re-scale or re-center the screen
  const initialFitDoneRef = useRef(false);

  // Dragging state refs
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const draggingPartRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    partStartX: number;
    partStartY: number;
    hasMoved?: boolean;
  } | null>(null);

  const draggingTrunkRef = useRef<{
    netId: string;
    trunkId?: string;
    orientation: 'horizontal' | 'vertical';
    startCoord: number;
    clientStart: number;
    hasMoved?: boolean;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Build the complete schematic model with Tinkercad auto-placement and channel router
  const model = useMemo(() => {
    try {
      return buildSchematicModel({
        components,
        boards,
        wires,
        customPositions: schematicPositions,
        customWireLayouts: schematicWireLayouts,
      });
    } catch (err) {
      console.error('[SchematicCanvas] Error building schematic model:', err);
      return {
        parts: [],
        nets: [],
        wirePaths: [],
        bounds: { minX: 0, minY: 0, maxX: 1050, maxY: 720 },
      };
    }
  }, [components, boards, wires, schematicPositions, schematicWireLayouts]);

  // Convert screen mouse coords into world schematic coords
  const getWorldCoords = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      return {
        x: Math.round((mouseX - pan.x) / zoom),
        y: Math.round((mouseY - pan.y) / zoom),
      };
    },
    [pan.x, pan.y, zoom],
  );

  // Fit to screen
  const handleFitToScreen = useCallback(() => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const width = rect.width > 50 ? rect.width : 900;
    const height = rect.height > 50 ? rect.height : 600;
    const bounds = model.bounds;
    const contentW = Math.max(bounds.maxX - bounds.minX, 400);
    const contentH = Math.max(bounds.maxY - bounds.minY, 300);

    const scaleX = (width - 120) / contentW;
    const scaleY = (height - 120) / contentH;
    const fitZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.5);

    setZoom(fitZoom);
    setPan({
      x: (width - contentW * fitZoom) / 2 - bounds.minX * fitZoom,
      y: (height - contentH * fitZoom) / 2 - bounds.minY * fitZoom,
    });
  }, [model.bounds]);

  useEffect(() => {
    // Only auto-fit to screen once upon initial load so user interactions/drags do not resize/pan the viewport
    if (!initialFitDoneRef.current && model.parts.length > 0) {
      initialFitDoneRef.current = true;
      const raf = requestAnimationFrame(() => {
        handleFitToScreen();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [model.parts.length, handleFitToScreen]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.25), 3.0);

    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan((prev) => ({
        x: mouseX - (mouseX - prev.x) * (newZoom / zoom),
        y: mouseY - (mouseY - prev.y) * (newZoom / zoom),
      }));
    }
    setZoom(newZoom);
  };

  // Canvas Mouse Down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (wiringFrom) {
      setWiringFrom(null);
      return;
    }
    setSelectedPartId(null);
    setSelectedWireNetId(null);
    if (onSelectComponent) onSelectComponent(null);
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Dragging component symbol
    if (draggingPartRef.current) {
      const { id, startX, startY, partStartX, partStartY, hasMoved } = draggingPartRef.current;
      const pixelDist = Math.hypot(e.clientX - startX, e.clientY - startY);

      // Drag threshold: ignore minor mouse jitter during a pure click so wires never scramble
      if (!hasMoved && pixelDist < 4) {
        return;
      }
      draggingPartRef.current.hasMoved = true;

      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;

      const snappedX = Math.round((partStartX + dx) / 10) * 10;
      const snappedY = Math.round((partStartY + dy) / 10) * 10;

      setSchematicPositions((prev) => {
        // Seed all other components from current model.parts so moving one component anchors
        // all remaining components in place and avoids resetting auto-placement or scrambling wires
        const base: Record<string, { x: number; y: number; rotation: number }> = {};
        model.parts.forEach((p) => {
          base[p.id] = prev[p.id] ?? { x: p.x, y: p.y, rotation: p.rotation };
        });
        base[id] = {
          x: snappedX,
          y: snappedY,
          rotation: prev[id]?.rotation ?? model.parts.find((p) => p.id === id)?.rotation ?? 0,
        };
        return base;
      });
      return;
    }

    // 2. Dragging wire trunk segment / elbow / bus
    if (draggingTrunkRef.current) {
      const { netId, trunkId, orientation, startCoord, clientStart, hasMoved } = draggingTrunkRef.current;
      const pixelDist = Math.abs((orientation === 'vertical' ? e.clientX : e.clientY) - clientStart);
      if (!hasMoved && pixelDist < 4) {
        return;
      }
      draggingTrunkRef.current.hasMoved = true;

      const delta = (orientation === 'vertical' ? e.clientX - clientStart : e.clientY - clientStart) / zoom;
      const snappedCoord = Math.round((startCoord + delta) / 10) * 10;

      setSchematicWireLayouts((prev) => {
        const existing = prev[netId] || {};
        if (trunkId === 'v-drop') {
          return {
            ...prev,
            [netId]: { ...existing, vOffset: snappedCoord },
          };
        } else {
          return {
            ...prev,
            [netId]: { ...existing, trunkOffset: snappedCoord },
          };
        }
      });
      return;
    }

    // 3. Wire preview following mouse
    if (wiringFrom) {
      const world = getWorldCoords(e);
      setMouseWorldPos({
        x: Math.round(world.x / 10) * 10,
        y: Math.round(world.y / 10) * 10,
      });
    }

    // 4. Viewport Pan
    if (isPanningRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    isPanningRef.current = false;
    draggingPartRef.current = null;
    draggingTrunkRef.current = null;
  };

  // Start dragging a component
  const handlePartMouseDown = (part: SchematicPlacedPart, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (wiringFrom) return;

    setSelectedPartId(part.id);
    setSelectedWireNetId(null);
    if (onSelectComponent) onSelectComponent(part.id);

    draggingPartRef.current = {
      id: part.id,
      startX: e.clientX,
      startY: e.clientY,
      partStartX: part.x,
      partStartY: part.y,
    };
  };

  // Start dragging a wire trunk
  const handleTrunkMouseDown = (
    wp: SchematicWirePath,
    trunk: SchematicWireTrunk,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (wiringFrom) return;

    setSelectedWireNetId(wp.netId);
    setSelectedPartId(null);
    if (onSelectComponent) onSelectComponent(null);

    draggingTrunkRef.current = {
      netId: wp.netId,
      trunkId: trunk.id,
      orientation: trunk.orientation,
      startCoord: trunk.coord,
      clientStart: trunk.orientation === 'vertical' ? e.clientX : e.clientY,
    };
  };

  // Handle pin click for wiring
  const handlePinClick = (
    part: SchematicPlacedPart,
    pin: SchematicPin & { absoluteX: number; absoluteY: number },
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!wiringFrom) {
      setWiringFrom({
        partId: part.id,
        pinName: pin.name,
        x: pin.absoluteX,
        y: pin.absoluteY,
      });
      setSelectedWireNetId(null);
      setSelectedPartId(null);
      if (onSelectComponent) onSelectComponent(null);
    } else {
      if (wiringFrom.partId === part.id && wiringFrom.pinName === pin.name) {
        setWiringFrom(null);
        return;
      }

      const newWireId = `wire-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newWire = {
        id: newWireId,
        start: {
          componentId: wiringFrom.partId,
          pinName: wiringFrom.pinName,
          x: wiringFrom.x,
          y: wiringFrom.y,
        },
        end: {
          componentId: part.id,
          pinName: pin.name,
          x: pin.absoluteX,
          y: pin.absoluteY,
        },
        waypoints: [],
        color: '#10b981',
        autoRouted: true,
      };

      addWire(newWire);
      pushCommand(
        {
          description: 'Añadir cable esquemático',
          execute: () => useSimulatorStore.getState().addWire(newWire),
          undo: () => useSimulatorStore.getState().removeWire(newWire.id),
        },
        { applyNow: false },
      );
      setWiringFrom(null);
    }
  };

  // Rotate selected component
  const handleRotateSelected = () => {
    if (!selectedPartId) return;
    if (onRotateComponent) onRotateComponent(selectedPartId);
    const part = model.parts.find((p) => p.id === selectedPartId);
    setSchematicPositions((prev) => {
      const base: Record<string, { x: number; y: number; rotation: number }> = {};
      model.parts.forEach((p) => {
        base[p.id] = prev[p.id] ?? { x: p.x, y: p.y, rotation: p.rotation };
      });
      const current = base[selectedPartId] || {
        x: part?.x ?? 0,
        y: part?.y ?? 0,
        rotation: part?.rotation ?? 0,
      };
      return {
        ...base,
        [selectedPartId]: {
          ...current,
          rotation: ((current.rotation ?? 0) + 90) % 360,
        },
      };
    });
  };

  // Delete selected component or selected wire
  const handleDeleteSelected = () => {
    if (selectedPartId) {
      if (onDeleteComponent) onDeleteComponent(selectedPartId);
      setSelectedPartId(null);
    } else if (selectedWireNetId) {
      const wp = model.wirePaths.find((p) => p.netId === selectedWireNetId);
      if (wp && wp.wireIds && wp.wireIds.length > 0) {
        const idsToRemove = [...wp.wireIds];
        const allWires = useSimulatorStore.getState().wires;
        const removedObjects = allWires.filter((w) => idsToRemove.includes(w.id));

        idsToRemove.forEach((wId) => removeWire(wId));

        pushCommand(
          {
            description: 'Eliminar cable esquemático',
            execute: () => {
              idsToRemove.forEach((wId) => useSimulatorStore.getState().removeWire(wId));
            },
            undo: () => {
              removedObjects.forEach((w) => useSimulatorStore.getState().addWire(w));
            },
          },
          { applyNow: false },
        );
      }
      setSelectedWireNetId(null);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        if (selectedPartId) {
          handleRotateSelected();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.key === 'Escape') {
        setWiringFrom(null);
        setSelectedWireNetId(null);
        setSelectedPartId(null);
        if (onSelectComponent) onSelectComponent(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPartId, selectedWireNetId, model.wirePaths, onDeleteComponent]);

  // Export Schematic as SVG
  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const svgString = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schematic.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export Schematic as PNG
  const handleExportPng = () => {
    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const { width, height } = svgElement.getBoundingClientRect();
    const clone = svgElement.cloneNode(true) as SVGSVGElement;

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.fillStyle = theme === 'dark' ? '#0f1219' : '#faf8f5';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = 'schematic.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="sch-canvas-container" data-theme={theme}>
      {/* ── Interactive SVG Viewport ── */}
      <svg
        ref={svgRef}
        className="sch-svg-viewport"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (!wiringFrom) {
            const target = e.target as HTMLElement | SVGElement | null;
            const isOverItem = !!target?.closest?.(
              '.sch-symbol-group, .sch-wire-group, .sch-wire-hitarea, .sch-pin-terminal, .sch-wire-trunk-handle'
            );
            if (!isOverItem) {
              setSelectedPartId(null);
              setSelectedWireNetId(null);
              if (onSelectComponent) onSelectComponent(null);
            }
          }
        }}
      >
        <defs>
          <pattern id="sch-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle
              cx="2"
              cy="2"
              r="1"
              fill={theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(120, 110, 95, 0.16)'}
            />
          </pattern>
        </defs>

        {/* Solid Background Fill */}
        <rect
          width="100%"
          height="100%"
          fill={theme === 'dark' ? 'var(--wb-1, #0a0e17)' : '#faf8f5'}
        />

        {/* Dot grid pattern */}
        <rect width="100%" height="100%" fill="url(#sch-grid)" />

        {/* Empty state message when circuit has no components */}
        {model.parts.length === 0 && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            fill="var(--wb-10, #94a3b8)"
            fontSize="14"
            fontFamily="sans-serif"
          >
            No hay componentes en el circuito. Añade componentes para ver su esquema.
          </text>
        )}

        {/* Viewport Transform Layer */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 1. Tinkercad-Style Engineering Drawing Sheet Frame */}
          <SchematicDrawingSheet
            bounds={model.bounds}
            theme={theme}
            showFrame={showDrawingSheet}
          />

          {/* 2. Ground Symbols (Tinkercad-Style Inverted Rake) */}
          {model.gndSymbols?.map((gnd, gIdx) => (
            <g key={`gnd-${gIdx}`} transform={`translate(${gnd.x}, ${gnd.y})`} className="sch-gnd-symbol">
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="10"
                stroke={theme === 'dark' ? '#00e5ff' : '#dc2626'}
                strokeWidth="2"
              />
              <line
                x1="-8"
                y1="10"
                x2="8"
                y2="10"
                stroke={theme === 'dark' ? '#00e5ff' : '#dc2626'}
                strokeWidth="2"
              />
              <line
                x1="-5"
                y1="13"
                x2="5"
                y2="13"
                stroke={theme === 'dark' ? '#00e5ff' : '#dc2626'}
                strokeWidth="1.8"
              />
              <line
                x1="-2"
                y1="16"
                x2="2"
                y2="16"
                stroke={theme === 'dark' ? '#00e5ff' : '#dc2626'}
                strokeWidth="1.5"
              />
              {gnd.label && (
                <text
                  x="0"
                  y="27"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="bold"
                  fill={theme === 'dark' ? '#00e5ff' : '#dc2626'}
                >
                  {gnd.label}
                </text>
              )}
            </g>
          ))}

          {/* 3. Net Wires & Junction Dots */}
          {model.wirePaths.map((wp, idx) => {
            const isHovered = hoveredNetId === wp.netId;
            const isSelected = selectedWireNetId === wp.netId;

            return (
              <g
                key={`wire-${idx}`}
                onMouseEnter={() => setHoveredNetId(wp.netId)}
                onMouseLeave={() => setHoveredNetId(null)}
              >
                <path
                  d={wp.pathData}
                  className={`sch-wire ${isHovered || isSelected ? 'sch-wire--highlighted' : ''}`}
                  stroke={isSelected ? '#00e5ff' : isHovered ? '#38bdf8' : wp.color}
                />

                <path
                  d={wp.pathData}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  className="sch-wire-hitarea"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!wiringFrom) {
                      setSelectedWireNetId(wp.netId);
                      setSelectedPartId(null);
                      if (onSelectComponent) onSelectComponent(null);
                    }
                  }}
                />

                {wp.junctions.map((j, jIdx) => (
                  <circle
                    key={`junction-${jIdx}`}
                    cx={j.x}
                    cy={j.y}
                    r={isSelected || isHovered ? 4.5 : 3.5}
                    className={`sch-junction-dot ${
                      isSelected || isHovered ? 'sch-junction-dot--highlighted' : ''
                    }`}
                  />
                ))}

                {(wp.trunks && wp.trunks.length > 0 ? wp.trunks : (wp.trunk ? [wp.trunk] : [])).map((t, tIdx) => (
                  <g
                    key={`trunk-${tIdx}`}
                    className={`sch-wire-trunk-handle ${
                      isHovered || isSelected ? 'sch-wire-trunk-handle--visible' : ''
                    }`}
                    style={{
                      cursor: t.orientation === 'vertical' ? 'ew-resize' : 'ns-resize',
                    }}
                    onMouseDown={(e) => handleTrunkMouseDown(wp, t, e)}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <title>
                      {t.orientation === 'vertical'
                        ? 'Arrastrar para mover cable vertical (izquierda / derecha)'
                        : 'Arrastrar para mover bus horizontal (arriba / abajo)'}
                    </title>
                    <line
                      x1={t.orientation === 'vertical' ? t.coord : t.start}
                      y1={t.orientation === 'vertical' ? t.start : t.coord}
                      x2={t.orientation === 'vertical' ? t.coord : t.end}
                      y2={t.orientation === 'vertical' ? t.end : t.coord}
                      stroke="transparent"
                      strokeWidth="16"
                    />
                    <circle
                      cx={t.handlePos.x}
                      cy={t.handlePos.y}
                      r="6"
                      className="sch-trunk-handle-pill"
                    />
                  </g>
                ))}
              </g>
            );
          })}

          {/* 4. Live Wiring Preview */}
          {wiringFrom && (
            <path
              d={`M ${wiringFrom.x} ${wiringFrom.y} L ${
                hoveredPin ? hoveredPin.x : mouseWorldPos.x
              } ${wiringFrom.y} L ${
                hoveredPin ? hoveredPin.x : mouseWorldPos.x
              } ${hoveredPin ? hoveredPin.y : mouseWorldPos.y}`}
              className="sch-wire-preview"
            />
          )}

          {/* 5. Placed Components (Schematic Symbols) */}
          {model.parts.map((part) => {
            const isSelected = selectedPartId === part.id;
            const symbolDef = getSchematicSymbolDef(part.type);

            return (
              <g
                key={part.id}
                className={`sch-symbol-group ${isSelected ? 'sch-symbol-group--selected' : ''}`}
                transform={`translate(${part.x}, ${part.y}) rotate(${part.rotation}, ${
                  part.width / 2
                }, ${part.height / 2})`}
                onMouseDown={(e) => handlePartMouseDown(part, e)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!wiringFrom) {
                    setSelectedPartId(part.id);
                    setSelectedWireNetId(null);
                    if (onSelectComponent) onSelectComponent(part.id);
                  }
                }}
              >
                {symbolDef.render({
                  id: part.id,
                  designator: part.designator,
                  value: part.value,
                  selected: isSelected,
                  properties: part.properties,
                })}

                {part.pins.map((p) => {
                  const isPinActive =
                    wiringFrom &&
                    wiringFrom.partId === part.id &&
                    wiringFrom.pinName === p.name;
                  const isHovered =
                    hoveredPin &&
                    hoveredPin.partId === part.id &&
                    hoveredPin.pinName === p.name;

                  return (
                    <circle
                      key={p.name}
                      cx={p.x}
                      cy={p.y}
                      r={isPinActive || isHovered ? 5.5 : 3}
                      fill="var(--wb-7, #3b4356)"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      className={`sch-pin-terminal ${
                        isPinActive
                          ? 'sch-pin-terminal--active'
                          : wiringFrom
                          ? 'sch-pin-terminal--candidate'
                          : ''
                      }`}
                      onMouseEnter={() =>
                        setHoveredPin({
                          partId: part.id,
                          pinName: p.name,
                          x: p.absoluteX,
                          y: p.absoluteY,
                        })
                      }
                      onMouseLeave={() => setHoveredPin(null)}
                      onClick={(e) => handlePinClick(part, p, e)}
                    >
                      <title>{`${part.designator} - Pin: ${p.label || p.name}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Right-Side Floating Tool Palette ── */}
      <div className="sch-tool-palette" role="toolbar" aria-label="Herramientas del esquema">
        {/* Auto-layout all components in clean Tinkercad layout */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={() => {
            resetSchematicLayout();
            setTimeout(handleFitToScreen, 60);
          }}
          title="Auto-organizar esquema en orden profesional (Tinkercad)"
          aria-label="Auto-organizar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>

        {/* Straighten / Reroute all wires */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={() => setSchematicWireLayouts({})}
          title="Enderezar y recalcular rutas de cables"
          aria-label="Enderezar cables"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 19h4a2 2 0 0 0 2-2V7a2 2 0 0 1 2-2h8" />
            <circle cx="4" cy="19" r="2" />
            <circle cx="20" cy="5" r="2" />
          </svg>
        </button>

        {/* Toggle Blueprint Drawing Sheet Frame */}
        <button
          type="button"
          className={`sch-palette-btn ${showDrawingSheet ? 'sch-drawing-sheet-btn--active' : ''}`}
          onClick={() => setShowDrawingSheet((s) => !s)}
          title="Mostrar / Ocultar marco de plano de ingeniería (Tinkercad)"
          aria-label="Alternar marco de plano"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        </button>

        {/* Rotate selected component */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={handleRotateSelected}
          disabled={!selectedPartId}
          title="Girar componente seleccionado (R)"
          aria-label="Girar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>

        {/* Delete selected component or wire */}
        <button
          type="button"
          className="sch-palette-btn sch-palette-btn--danger"
          onClick={handleDeleteSelected}
          disabled={!selectedPartId && !selectedWireNetId}
          title={
            selectedWireNetId
              ? 'Eliminar cable seleccionado (Supr)'
              : selectedPartId
              ? 'Eliminar componente seleccionado (Supr)'
              : 'Eliminar seleccionado'
          }
          aria-label="Eliminar seleccionado"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>

        <div className="sch-palette-divider" />

        {/* Zoom In */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={() => setZoom((z) => Math.min(z + 0.15, 3.0))}
          title="Acercar (+)"
          aria-label="Acercar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>

        {/* Zoom Badge */}
        <span className="sch-palette-zoom-badge" title="Nivel de zoom">
          {Math.round(zoom * 100)}%
        </span>

        {/* Zoom Out */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={() => setZoom((z) => Math.max(z - 0.15, 0.25))}
          title="Alejar (-)"
          aria-label="Alejar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>

        {/* Fit to screen */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={handleFitToScreen}
          title="Ajustar vista a pantalla"
          aria-label="Ajustar a pantalla"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>

        <div className="sch-palette-divider" />

        {/* Theme Toggle (Dark blueprint vs Light paper) */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          title={theme === 'dark' ? 'Cambiar a modo papel claro (Tinkercad)' : 'Cambiar a modo oscuro'}
          aria-label="Alternar tema de esquema"
        >
          {theme === 'dark' ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div className="sch-palette-divider" />

        {/* Export SVG */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={handleExportSvg}
          title="Descargar diagrama esquemático en SVG"
          aria-label="Descargar SVG"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>

        {/* Export PNG */}
        <button
          type="button"
          className="sch-palette-btn"
          onClick={handleExportPng}
          title="Descargar imagen PNG de alta resolución"
          aria-label="Descargar PNG"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
      </div>
    </div>
  );
};

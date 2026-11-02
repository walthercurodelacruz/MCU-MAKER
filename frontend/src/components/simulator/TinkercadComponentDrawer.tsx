/**
 * TinkercadComponentDrawer
 *
 * Sliding component catalog drawer docked to the right of the circuit workbench,
 * matching Autodesk Tinkercad Circuits' visual catalog and workflow.
 *
 * Supports:
 * - Direct click to add to next free slot
 * - Drag and drop directly onto the circuit canvas at mouse coordinates
 * - Categories: Básico (Tinkercad core set), Todos, Placas/MCUs, Sensores, Actuadores, Pasivos/SPICE, Lógica
 * - Fast search filtering
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ComponentRegistry } from '../../services/ComponentRegistry';
import type { ComponentMetadata } from '../../types/component-metadata';
import type { BoardKind } from '../../types/board';
import { isProBoardKind } from '../../lib/proBoardGate';
import './TinkercadComponentDrawer.css';

export interface TinkercadDrawerItem {
  id: string;
  type: 'component' | 'board';
  name: string;
  desc: string;
  imageSrc?: string;
  svgContent?: string;
  boardKind?: BoardKind;
  metadata?: ComponentMetadata;
  isPro?: boolean;
}

export interface TinkercadComponentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle?: () => void;
  onSelectComponent: (metadata: ComponentMetadata) => void;
  onSelectBoard: (kind: BoardKind) => void;
}

type CategoryFilter = 'basic' | 'all' | 'boards' | 'sensors' | 'actuators' | 'passives' | 'logic';

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string }[] = [
  { id: 'basic', label: 'Componentes: Básico' },
  { id: 'all', label: 'Componentes: Todos' },
  { id: 'boards', label: 'Placas y Microcontroladores' },
  { id: 'sensors', label: 'Entradas y Sensores' },
  { id: 'actuators', label: 'Salidas y Actuadores' },
  { id: 'passives', label: 'Pasivos y Analógicos (SPICE)' },
  { id: 'logic', label: 'Lógica y Circuitos Integrados' },
];

/** Standard curated Tinkercad Circuits basic set */
const TINKERCAD_BASIC_IDS = new Set([
  'resistor',
  'led',
  'pushbutton',
  'potentiometer',
  'capacitor',
  'capacitor-electrolytic',
  'slide-switch',
  'battery-9v',
  'battery-coin-cell',
  'battery-aa',
  'breadboard-mini',
  'breadboard',
  'board:arduino-uno',
  'rgb-led',
  'diode',
  'diode-1n4007',
  'dht22',
  'hc-sr04',
  'pir-motion-sensor',
  'photoresistor-sensor',
  'servo',
  'gear-motor',
  'light-bulb',
  'flex-sensor',
  'force-sensor',
  'buzzer',
  '7segment',
  'lcd1602',
  'lcd1602-i2c',
  'lcd2004',
  'analog-joystick',
  'board:raspberry-pi-pico',
  'board:esp32',
]);

const BOARD_ITEMS: { kind: BoardKind; name: string; desc: string; img: string }[] = [
  { kind: 'arduino-uno', name: 'Arduino Uno R3', desc: 'ATmega328P · 16 MHz', img: '/component-svgs/arduino-uno.svg' },
  { kind: 'arduino-nano', name: 'Arduino Nano', desc: 'ATmega328P compacto', img: '/component-svgs/arduino-nano.svg' },
  { kind: 'arduino-mega', name: 'Arduino Mega 2560', desc: 'ATmega2560 · 54 pines', img: '/component-svgs/arduino-mega.svg' },
  { kind: 'raspberry-pi-pico', name: 'Raspberry Pi Pico', desc: 'RP2040 dual ARM', img: '/component-svgs/raspberry-pi-pico.svg' },
  { kind: 'pi-pico-w', name: 'Pi Pico W', desc: 'RP2040 + WiFi', img: '/component-svgs/raspberry-pi-pico-w.svg' },
  { kind: 'esp32', name: 'ESP32 DevKit V1', desc: 'Xtensa dual-core + WiFi', img: '/component-svgs/esp32-devkit-v1.svg' },
  { kind: 'esp32-s3', name: 'ESP32-S3 DevKit', desc: 'Xtensa LX7 + USB OTG', img: '/component-svgs/esp32-s3.svg' },
  { kind: 'esp32-c3', name: 'ESP32-C3 DevKit', desc: 'RISC-V single core', img: '/component-svgs/esp32-c3.svg' },
  { kind: 'esp32-cam', name: 'ESP32-CAM', desc: 'Cámara 2MP + WiFi', img: '/component-svgs/esp32-cam.svg' },
  { kind: 'attiny85', name: 'ATtiny85 DIP-8', desc: 'AVR 8KB · 6 GPIO', img: '/component-svgs/attiny85.svg' },
];

function getComponentFallbackIcon(item: TinkercadDrawerItem): string {
  const cat = item.metadata?.category || (item.type === 'board' ? 'boards' : 'component');
  const name = item.name || item.id;
  const initials = name.slice(0, 3).toUpperCase();

  let iconSvg = '';
  if (cat === 'boards' || item.type === 'board') {
    iconSvg = '<rect x="10" y="8" width="44" height="48" rx="3" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/><circle cx="16" cy="14" r="2" fill="#38bdf8"/><text x="32" y="36" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#38bdf8">MCU</text>';
  } else if (cat === 'sensors' || cat === 'sensor' || cat === 'input') {
    iconSvg = '<circle cx="32" cy="32" r="20" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/><path d="M 24 24 Q 32 16 40 24 T 56 24" fill="none" stroke="#34d399" stroke-width="1.5"/><text x="32" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6.5" font-weight="bold" fill="#34d399">SENSOR</text>';
  } else if (cat === 'logic' || cat === 'logic-gates') {
    iconSvg = '<rect x="12" y="14" width="40" height="36" rx="2" fill="#1e293b" stroke="#8b5cf6" stroke-width="1.5"/><text x="32" y="36" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#a78bfa">LOGIC</text>';
  } else if (cat === 'output' || cat === 'outputs' || cat === 'displays') {
    iconSvg = '<rect x="8" y="14" width="48" height="36" rx="2" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/><text x="32" y="36" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="bold" fill="#fbbf24">DISP</text>';
  } else if (cat === 'analog' || cat === 'passive' || cat === 'passives') {
    iconSvg = '<rect x="12" y="16" width="40" height="32" rx="3" fill="#1e293b" stroke="#0ea5e9" stroke-width="1.5"/><text x="32" y="36" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6.5" font-weight="bold" fill="#38bdf8">SPICE</text>';
  } else {
    iconSvg = `<rect x="14" y="14" width="36" height="36" rx="3" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/><text x="32" y="35" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="bold" fill="#94a3b8">${initials}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${iconSvg}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const TinkercadComponentDrawer: React.FC<TinkercadComponentDrawerProps> = ({
  isOpen,
  onClose,
  onToggle,
  onSelectComponent,
  onSelectBoard,
}) => {
  const [category, setCategory] = useState<CategoryFilter>('basic');
  const [search, setSearch] = useState('');
  const [components, setComponents] = useState<ComponentMetadata[]>([]);

  useEffect(() => {
    const reg = ComponentRegistry.getInstance();
    if (reg.isLoaded) {
      setComponents(reg.getAllComponents());
    } else {
      reg.load().then(() => setComponents(reg.getAllComponents()));
    }
  }, []);

  // Map components and boards into unified drawer items
  const allItems = useMemo<TinkercadDrawerItem[]>(() => {
    const items: TinkercadDrawerItem[] = [];

    // Add boards
    for (const b of BOARD_ITEMS) {
      items.push({
        id: `board:${b.kind}`,
        type: 'board',
        name: b.name,
        desc: b.desc,
        imageSrc: b.img,
        boardKind: b.kind,
        isPro: isProBoardKind(b.kind),
      });
    }

    // Add components from registry
    for (const c of components) {
      if (c.id === 'junction') continue; // internal only
      let imgSrc: string | undefined;
      const idSvgPath = `/component-svgs/${c.id}.svg`;

      // Assign known SVG thumbnails or fritzing assets
      if (c.id === 'breadboard') {
        imgSrc = '/component-svgs/fritzing/breadboard-full.svg';
      } else if (c.id === 'breadboard-mini') {
        imgSrc = '/component-svgs/fritzing/breadboard-mini.svg';
      } else {
        imgSrc = idSvgPath;
      }

      const rawDesc = c.description || c.name || '';
      const safeDesc = rawDesc.length > 36 ? rawDesc.slice(0, 36) + '…' : rawDesc;

      items.push({
        id: c.id,
        type: 'component',
        name: c.name || c.id,
        desc: safeDesc,
        imageSrc: imgSrc,
        svgContent: typeof c.thumbnail === 'string' && c.thumbnail.startsWith('<svg') ? c.thumbnail : undefined,
        metadata: c,
      });
    }

    return items;
  }, [components]);

  // Filter items by category and search term
  const filteredItems = useMemo(() => {
    let list = allItems;

    // Category filtering
    if (category === 'basic') {
      list = list.filter((i) => TINKERCAD_BASIC_IDS.has(i.id));
    } else if (category === 'boards') {
      list = list.filter((i) => i.type === 'board' || i.metadata?.category === 'boards');
    } else if (category === 'sensors') {
      list = list.filter(
        (i) =>
          i.type === 'component' &&
          (i.metadata?.category === 'sensors' ||
            i.metadata?.category === 'sensor' ||
            i.metadata?.category === 'input' ||
            i.metadata?.tags?.some((t) =>
              [
                'sensor',
                'sensors',
                'input',
                'button',
                'switch',
                'potentiometer',
                'keypad',
                'encoder',
                'joystick',
                'gas',
                'flame',
                'sound',
                'heart',
                'rtc',
                'tilt',
                'temperature',
                'humidity',
                'light',
              ].includes(t),
            )),
      );
    } else if (category === 'actuators') {
      list = list.filter(
        (i) =>
          i.type === 'component' &&
          (i.metadata?.category === 'output' ||
            i.metadata?.category === 'outputs' ||
            i.metadata?.category === 'displays' ||
            i.metadata?.category === 'motors' ||
            i.metadata?.category === 'electromech' ||
            i.metadata?.tags?.some((t) =>
              [
                'output',
                'outputs',
                'actuator',
                'actuators',
                'led',
                'display',
                'screen',
                'oled',
                'lcd',
                'servo',
                'motor',
                'stepper',
                'buzzer',
                'relay',
                'speaker',
                '7segment',
                'neopixel',
              ].includes(t),
            )),
      );
    } else if (category === 'passives') {
      list = list.filter(
        (i) =>
          i.type === 'component' &&
          (i.metadata?.category === 'passive' ||
            i.metadata?.category === 'passives' ||
            i.metadata?.category === 'analog' ||
            i.metadata?.category === 'semiconductors' ||
            i.metadata?.tags?.some((t) =>
              [
                'resistor',
                'capacitor',
                'inductor',
                'diode',
                'zener',
                'schottky',
                'transistor',
                'bjt',
                'mosfet',
                'opamp',
                'analog',
                'spice',
                'passive',
                'battery',
                'probe',
                'meter',
                'breadboard',
              ].includes(t),
            )),
      );
    } else if (category === 'logic') {
      list = list.filter(
        (i) =>
          i.type === 'component' &&
          (i.metadata?.category === 'logic' ||
            i.metadata?.category === 'logic-gates' ||
            i.metadata?.category === 'integrated-circuits' ||
            i.metadata?.id === 'custom-chip' ||
            i.metadata?.tags?.some((t) =>
              [
                'logic',
                'gate',
                'ic',
                '74hc',
                'flip-flop',
                'optocoupler',
                'counter',
                'shift-register',
                'custom-chip',
                'wasm',
              ].includes(t),
            )),
      );
    }

    // Search query filtering
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (i) =>
          (i.name || '').toLowerCase().includes(q) ||
          (i.desc || '').toLowerCase().includes(q) ||
          (i.id || '').toLowerCase().includes(q) ||
          (i.metadata?.tags && i.metadata.tags.some((t) => (t || '').toLowerCase().includes(q))),
      );
    }

    return list;
  }, [allItems, category, search]);

  const handleCardClick = (item: TinkercadDrawerItem) => {
    if (item.type === 'component' && item.metadata) {
      onSelectComponent(item.metadata);
    } else if (item.type === 'board' && item.boardKind) {
      onSelectBoard(item.boardKind);
    }
  };

  const handleDragStart = (e: React.DragEvent, item: TinkercadDrawerItem) => {
    const payload =
      item.type === 'component'
        ? { type: 'component', id: item.id }
        : { type: 'board', kind: item.boardKind };

    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', item.name);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside
      className={`tinkercad-drawer ${isOpen ? 'tinkercad-drawer--open' : 'tinkercad-drawer--closed'}`}
      aria-label="Panel de componentes Tinkercad"
    >
      {/* Tab toggle on left border */}
      <button
        type="button"
        className="tinkercad-drawer-toggle-tab"
        onClick={() => {
          if (onToggle) onToggle();
          else if (isOpen) onClose();
        }}
        title={isOpen ? 'Cerrar panel de componentes' : 'Abrir panel de componentes'}
        aria-label={isOpen ? 'Cerrar panel de componentes' : 'Abrir panel de componentes'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isOpen ? (
            <polyline points="9 18 15 12 9 6" />
          ) : (
            <polyline points="15 18 9 12 15 6" />
          )}
        </svg>
      </button>

      {/* Drawer Header */}
      <div className="tinkercad-drawer-header">
        <div className="tinkercad-drawer-title-row">
          <div className="tinkercad-drawer-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
            <span>Componentes</span>
            <span className="tinkercad-drawer-count">{filteredItems.length}</span>
          </div>

          <button
            type="button"
            className="tinkercad-drawer-close-btn"
            onClick={onClose}
            title="Cerrar panel"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Category selector dropdown */}
        <div className="tinkercad-category-select-wrapper">
          <select
            className="tinkercad-category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryFilter)}
            aria-label="Filtro de categorías de componentes"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg className="tinkercad-category-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* Search bar */}
        <div className="tinkercad-search-box">
          <svg className="tinkercad-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="tinkercad-search-input"
            placeholder="Buscar componentes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="tinkercad-search-clear"
              onClick={() => setSearch('')}
              title="Borrar búsqueda"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Grid of Component Cards */}
      <div className="tinkercad-drawer-body">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tc-card"
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onClick={() => handleCardClick(item)}
            title={`Arrastra al lienzo o haz clic para añadir ${item.name}`}
          >
            {item.isPro && <span className="tc-card-badge">PRO</span>}

            <div className="tc-card-preview">
              {item.imageSrc ? (
                <img
                  src={item.imageSrc}
                  alt={item.name}
                  className="tc-card-img"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.onerror = null;
                    if (item.svgContent) {
                      target.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(item.svgContent);
                    } else {
                      target.src = getComponentFallbackIcon(item);
                    }
                  }}
                />
              ) : item.svgContent ? (
                <div
                  className="tc-card-img tc-card-img--svg"
                  dangerouslySetInnerHTML={{ __html: item.svgContent }}
                />
              ) : (
                <img
                  src={getComponentFallbackIcon(item)}
                  alt={item.name}
                  className="tc-card-img"
                />
              )}
            </div>

            <div className="tc-card-info">
              <span className="tc-card-name" title={item.name}>
                {item.name}
              </span>
              <span className="tc-card-desc" title={item.desc}>
                {item.desc}
              </span>
            </div>
          </button>
        ))}

        {filteredItems.length === 0 && (
          <div className="tinkercad-drawer-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>No se encontraron componentes para "{search}"</span>
          </div>
        )}
      </div>
    </aside>
  );
};

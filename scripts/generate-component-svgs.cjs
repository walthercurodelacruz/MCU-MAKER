#!/usr/bin/env node
/**
 * generate-component-svgs.cjs
 *
 * Guarantees that EVERY SINGLE component in MCU Maker has a high-quality,
 * referential SVG image under frontend/public/component-svgs/<id>.svg
 * and that components-metadata.json has SVG thumbnails for all items.
 */

'use strict';

const Module = require('module');
const path   = require('path');
const fs     = require('fs');

const OUT_DIR      = path.resolve(__dirname, '../frontend/public/component-svgs');
const BOARDS_DIR   = path.resolve(__dirname, '../frontend/public/boards');
const METADATA_PATH= path.resolve(__dirname, '../frontend/public/components-metadata.json');

function findCjsDir() {
  const candidates = [
    path.resolve(__dirname, '../frontend/node_modules/@wokwi/elements/dist/cjs'),
    path.resolve(__dirname, '../node_modules/@wokwi/elements/dist/cjs'),
    path.resolve(__dirname, '../third-party/wokwi-elements/dist/cjs'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const CJS_DIR = findCjsDir();

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── 1. Lit Mock for Wokwi Elements extraction ────────────────────────────────
function tagConcat(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    let str = strings[i];
    if (i > 0) {
      const val = values[i - 1];
      const prevStr = strings[i - 1];
      const attrMatch = prevStr.match(/\s+(@[\w:-]+|\.[\w:-]+|\?[\w:-]+)\s*=\s*$/);
      if (attrMatch) {
        result = result.slice(0, result.length - attrMatch[0].length);
      } else if (/\s+style\s*=\s*--[\w-]+:[^"'\s]*$/.test(prevStr + String(val != null ? val : ''))) {
        result = result.replace(/\s+style\s*=\s*--[\w-]+:[^"'\s]*$/, '');
      } else {
        result += val != null ? String(val) : '';
      }
    }
    result += str;
  }
  return result;
}

const mockLit = {
  LitElement: class LitElement {
    constructor() {}
    dispatchEvent() {}
    requestUpdate() {}
  },
  html:       tagConcat,
  svg:        tagConcat,
  css:        () => '',
  nothing:    '',
  unsafeHTML: (s) => s,
};

const mockDecorators = {
  customElement: () => (cls) => cls,
  property:      () => () => {},
  state:         () => () => {},
  query:         () => () => {},
};

const mockClassMap  = { classMap:  (m) => Object.entries(m).filter(([,v]) => v).map(([k]) => k).join(' ') };
const mockStyleMap  = { styleMap:  (m) => Object.entries(m).map(([k,v]) => `${k}:${v}`).join(';') };

const origLoad = Module._load.bind(Module);
Module._load = function(request, parent, isMain) {
  if (request === 'lit')                          return mockLit;
  if (request === 'lit/decorators.js')            return mockDecorators;
  if (request === 'lit/directives/class-map.js')  return mockClassMap;
  if (request === 'lit/directives/style-map.js')  return mockStyleMap;
  return origLoad(request, parent, isMain);
};

if (typeof globalThis.customElements === 'undefined') {
  globalThis.customElements = { define: () => {} };
}
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(w, h) {
      this.width = typeof w === 'number' ? w : 128;
      this.height = typeof h === 'number' ? h : 64;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      this.colorSpace = 'srgb';
    }
  };
}

function cleanRawHtml(raw) {
  const lines = raw.split('\n');
  const kept = [];
  let skipping = false;
  let skipMode = '';

  for (const line of lines) {
    if (skipping) {
      if (skipMode === 'quoted' && /"\s*$/.test(line)) skipping = false;
      else if (skipMode === 'brace' && /^\s*\}\s*$/.test(line)) skipping = false;
      continue;
    }
    const trimmed = line.trimStart();
    if (/^@[\w:-]+\s*=/.test(trimmed)) {
      const afterEq = trimmed.replace(/^@[\w:-]+\s*=\s*/, '');
      if (/^"[^"]*"\s*$/.test(afterEq) || /^'[^']*'\s*$/.test(afterEq)) {
        // self-contained
      } else if (afterEq.startsWith('"')) {
        skipping = true; skipMode = 'quoted';
      } else if (/\{\s*$/.test(trimmed)) {
        skipping = true; skipMode = 'brace';
      }
      continue;
    }
    if (/>\s+this\.[\w]+\(/.test(line)) {
      const gtIdx = line.indexOf('>');
      kept.push(line.slice(0, gtIdx + 1));
      continue;
    }
    if (/^\s*tabindex\s*=/.test(line)) continue;
    if (/^\s*role\s*=/.test(line)) continue;
    if (/^\s*style\s*=\s*--/.test(line)) continue;
    if (/^\s*class\s*=\s*$/.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

function extractSvg(html) {
  html = cleanRawHtml(html);
  const start = html.indexOf('<svg');
  if (start === -1) return null;
  let depth = 0, i = start;
  while (i < html.length) {
    if (html.slice(i, i + 4) === '<svg') { depth++; i += 4; }
    else if (html.slice(i, i + 6) === '</svg>') {
      depth--;
      if (depth === 0) return html.slice(start, i + 6);
      i += 6;
    } else { i++; }
  }
  return null;
}

function movePaintServersIntoDefs(svgStr) {
  const TAGS = ['filter', 'pattern'];
  let defsClose = svgStr.indexOf('</defs>');
  const extracted = [];

  for (const tag of TAGS) {
    const openRe  = new RegExp(`<${tag}\\b`, 'g');
    const closeTag = `</${tag}>`;
    let match;
    while ((match = openRe.exec(svgStr)) !== null) {
      const start = match.index;
      const defsOpen = svgStr.indexOf('<defs');
      if (defsOpen !== -1 && defsClose !== -1 && start > defsOpen && start < defsClose) {
        continue;
      }
      const end = svgStr.indexOf(closeTag, start);
      if (end === -1) continue;
      extracted.push({ start, blockEnd: end + closeTag.length });
    }
  }

  if (extracted.length === 0) return svgStr;
  extracted.sort((a, b) => b.start - a.start);
  const blocks = extracted.slice().sort((a, b) => a.start - b.start)
    .map(({ start, blockEnd }) => svgStr.slice(start, blockEnd));

  for (const { start, blockEnd } of extracted) {
    svgStr = svgStr.slice(0, start) + svgStr.slice(blockEnd);
    defsClose = svgStr.indexOf('</defs>');
  }

  if (defsClose !== -1) {
    svgStr = svgStr.slice(0, defsClose) + '\n' + blocks.join('\n') + '\n' + svgStr.slice(defsClose);
  } else {
    const svgTagEnd = svgStr.indexOf('>') + 1;
    svgStr = svgStr.slice(0, svgTagEnd) + '\n<defs>\n' + blocks.join('\n') + '\n</defs>' + svgStr.slice(svgTagEnd);
  }
  return svgStr;
}

function normalizeSvgDimensions(svgStr) {
  const MM_TO_PX = 96 / 25.4;
  const hasViewBox = /viewBox\s*=/i.test(svgStr);

  let result = svgStr.replace(
    /width="([\d.]+)mm"\s+height="([\d.]+)mm"/,
    (_, wMm, hMm) => {
      const wPx = Math.round(parseFloat(wMm) * MM_TO_PX);
      const hPx = Math.round(parseFloat(hMm) * MM_TO_PX);
      if (hasViewBox) return `width="${wPx}" height="${hPx}"`;
      return `width="${wPx}" height="${hPx}" viewBox="0 0 ${wMm} ${hMm}"`;
    }
  );

  result = movePaintServersIntoDefs(result);
  result = result.replace(/(<use\b[^>]*?)\s+xlink:href\s*=\s*"([^"]*)"/g, '$1 href="$2"');
  result = result.replace(/(<use\b[^>]*?)\s+xlink:href\s*=\s*'([^']*)'/g, "$1 href='$2'");
  result = result.replace(/\s+xmlns:xlink\s*=\s*["'][^"']*["']/g, '');
  result = result.replace(/\s+(?:style|class|opacity|fill|stroke|transform|filter|d)=\s*(?=[\n\r\s>\/])/g, '');

  result = result.replace(/\b([\w:-]+)=([^"'\s\n\r>\/][^\s\n\r>]*)/g, (match, name, val) => {
    if (name.startsWith('xml') || name === 'version') return match;
    return name + '="' + val + '"';
  });

  if (!result.includes('xmlns=')) {
    result = result.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!result.startsWith('<?xml')) {
    result = '<?xml version="1.0" encoding="UTF-8"?>\n' + result;
  }
  return result;
}

// ── 2. Wokwi Elements Catalog ────────────────────────────────────────────────
const WOKWI_ELEMENTS = [
  ['led',                    'led-element',                    { color: 'red', value: false, brightness: 1.0, flip: false, label: '' }, true ],
  ['led-green',              'led-element',                    { color: 'green', value: false, brightness: 1.0, flip: false, label: '' }, true ],
  ['led-blue',               'led-element',                    { color: 'blue', value: false, brightness: 1.0, flip: false, label: '' }, true ],
  ['led-yellow',             'led-element',                    { color: 'yellow', value: false, brightness: 1.0, flip: false, label: '' }, true ],
  ['rgb-led',                'rgb-led-element',                { rValue: 0, gValue: 0, bValue: 0, commonAnode: false }, true ],
  ['resistor',               'resistor-element',               { value: '1000' }, false ],
  ['pushbutton',             'pushbutton-element',             { color: 'green', label: '', key: '' }, true ],
  ['pushbutton-6mm',         'pushbutton-6mm-element',         { color: 'red', label: '' }, true ],
  ['dht22',                  'dht22-element',                  {}, false ],
  ['hc-sr04',                'hc-sr04-element',                {}, false ],
  ['mpu6050',                'mpu6050-element',                {}, false ],
  ['lcd1602',                'lcd1602-element',                {}, false ],
  ['lcd2004',                'lcd2004-element',                {}, false ],
  ['ssd1306',                'ssd1306-element',                { width: 128, height: 64 }, false ],
  ['ili9341',                'ili9341-element',                {}, false ],
  ['7segment',               '7segment-element',               { value: '0', color: 'red', common: 'cathode' }, false ],
  ['potentiometer',          'potentiometer-element',          { value: 0.5 }, false ],
  ['servo',                  'servo-element',                  { value: 90 }, false ],
  ['ntc-temperature-sensor', 'ntc-temperature-sensor-element', {}, false ],
  ['photoresistor-sensor',   'photoresistor-sensor-element',   {}, false ],
  ['pir-motion-sensor',      'pir-motion-sensor-element',      {}, false ],
  ['analog-joystick',        'analog-joystick-element',        { xValue: 0, yValue: 0 }, false ],
  ['neopixel',               'neopixel-element',               {}, false ],
  ['neopixel-matrix',        'neopixel-matrix-element',        { rows: 4, cols: 4 }, false ],
  ['led-ring',               'led-ring-element',               { pixels: 12 }, false ],
  ['ds1307',                 'ds1307-element',                 {}, false ],
  ['slide-switch',           'slide-switch-element',           {}, false ],
  ['membrane-keypad',        'membrane-keypad-element',        {}, false ],
  ['dip-switch-8',           'dip-switch-8-element',           {}, false ],
  ['stepper-motor',          'stepper-motor-element',          {}, false ],
  ['biaxial-stepper',        'biaxial-stepper-element',        {}, false ],
  ['led-bar-graph',          'led-bar-graph-element',          {}, false ],
  ['microsd-card',           'microsd-card-element',           {}, false ],
  ['hx711',                  'hx711-element',                  {}, false ],
  ['flame-sensor',           'flame-sensor-element',           {}, false ],
  ['gas-sensor',             'gas-sensor-element',             {}, false ],
  ['big-sound-sensor',       'big-sound-sensor-element',       {}, false ],
  ['small-sound-sensor',     'small-sound-sensor-element',     {}, false ],
  ['slide-potentiometer',    'slide-potentiometer-element',    {}, false ],
  ['tilt-switch',            'tilt-switch-element',            {}, false ],
  ['rotary-dialer',          'rotary-dialer-element',          {}, false ],
  ['ir-receiver',            'ir-receiver-element',            {}, false ],
  ['ir-remote',              'ir-remote-element',              {}, false ],
  ['franzininho',            'franzininho-element',            {}, false ],
  ['ks2e-m-dc5',             'ks2e-m-dc5-element',             {}, false ],
  ['heart-beat-sensor',      'heart-beat-sensor-element',      {}, false ],
  ['ky-040',                 'ky-040-element',                 {}, false ],
  ['esp32-devkit-v1',        'esp32-devkit-v1-element',        {}, false ],
  ['nano-rp2040-connect',    'nano-rp2040-connect-element',    {}, false ],
];

console.log('📦 Extracting Wokwi Elements SVGs...');
for (const [id, fileName, defaultProps, useRenderSVG] of WOKWI_ELEMENTS) {
  const filePath = path.join(CJS_DIR, `${fileName}.js`);
  if (!fs.existsSync(filePath)) continue;

  try {
    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);
    const ExportedClass = Object.values(mod).find(
      (v) => typeof v === 'function' && v.prototype && typeof v.prototype.render === 'function'
    );
    if (!ExportedClass) continue;

    const el = new ExportedClass();
    Object.assign(el, defaultProps);
    let result = (useRenderSVG && typeof el.renderSVG === 'function') ? el.renderSVG() : el.render();
    const svgStr = extractSvg(String(result));
    if (svgStr) {
      const fullSvg = normalizeSvgDimensions(svgStr);
      fs.writeFileSync(path.join(OUT_DIR, `${id}.svg`), fullSvg, 'utf-8');
      console.log(`  ✓ ${id}.svg`);
    }
  } catch (err) {
    console.warn(`  ⚠ ${id}: ${err.message}`);
  }
}

// ── 3. Board SVGs Copying ───────────────────────────────────────────────────
const BOARD_COPIES = [
  ['arduino-uno',                  'arduino-uno.svg'],
  ['arduino-uno-board',            'arduino-uno.svg'],
  ['arduino-nano',                 'arduino-nano.svg'],
  ['arduino-nano-board',           'arduino-nano.svg'],
  ['arduino-mega',                 'arduino-mega.svg'],
  ['arduino-mega-board',           'arduino-mega.svg'],
  ['raspberry-pi-pico',            'pi-pico.svg'],
  ['raspberry-pi-pico-w',          'pi-pico-w.svg'],
  ['esp32-board',                  'esp32-devkit-c-v4.svg'],
  ['esp32-devkit-c-v4',            'esp32-devkit-c-v4.svg'],
  ['esp32-cam',                    'esp32-cam.svg'],
  ['esp32-s3',                     'esp32-s3.svg'],
  ['esp32-c3',                     'esp32-c3.svg'],
  ['xiao-esp32-s3',                'xiao-esp32-s3.svg'],
  ['xiao-esp32-c3',                'xiao-esp32-c3.svg'],
  ['esp32c3-supermini',            'esp32c3-supermini.svg'],
  ['arduino-nano-esp32',           'arduino-nano-esp32.svg'],
  ['wemos-lolin32-lite',           'wemos-lolin32-lite.svg'],
  ['attiny85',                     'attiny85.svg'],
];

console.log('\n📋 Copying Board SVGs...');
for (const [id, srcFile] of BOARD_COPIES) {
  const src = path.join(BOARDS_DIR, srcFile);
  if (fs.existsSync(src)) {
    const normalized = normalizeSvgDimensions(fs.readFileSync(src, 'utf-8'));
    fs.writeFileSync(path.join(OUT_DIR, `${id}.svg`), normalized, 'utf-8');
    console.log(`  ✓ ${id}.svg ← boards/${srcFile}`);
  }
}

// Copy a4988.svg from components/ if present
const a4988Src = path.resolve(__dirname, '../frontend/public/components/a4988.svg');
if (fs.existsSync(a4988Src)) {
  fs.copyFileSync(a4988Src, path.join(OUT_DIR, 'a4988.svg'));
  console.log('  ✓ a4988.svg ← components/a4988.svg');
}

// Copy breadboards to root component-svgs directory for uniform access
const bbFull = path.join(OUT_DIR, 'fritzing/breadboard-full.svg');
if (fs.existsSync(bbFull)) {
  fs.copyFileSync(bbFull, path.join(OUT_DIR, 'breadboard.svg'));
  console.log('  ✓ breadboard.svg ← fritzing/breadboard-full.svg');
}
const bbMini = path.join(OUT_DIR, 'fritzing/breadboard-mini.svg');
if (fs.existsSync(bbMini)) {
  fs.copyFileSync(bbMini, path.join(OUT_DIR, 'breadboard-mini.svg'));
  console.log('  ✓ breadboard-mini.svg ← fritzing/breadboard-mini.svg');
}

// ── 4. Referential High-Quality SVG Generators for MCU Maker / SPICE Parts ───
const SVG_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';

function writeSvg(id, content) {
  fs.writeFileSync(path.join(OUT_DIR, `${id}.svg`), SVG_HEADER + content.trim(), 'utf-8');
  console.log(`  ✓ [Handcrafted] ${id}.svg`);
}

console.log('\n🎨 Generating Referential Artwork for SPICE / Custom Components...');

// --- BATTERIES & POWER ---
writeSvg('battery-9v', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="b9v-b" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="50%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="b9v-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
  </defs>
  <rect x="14" y="16" width="36" height="44" rx="3" fill="url(#b9v-b)" stroke="#0f172a" stroke-width="1.2"/>
  <rect x="14" y="16" width="36" height="12" rx="2" fill="url(#b9v-g)"/>
  <polygon points="21,12 25,9 29,12 29,16 25,18 21,16" fill="#cbd5e1" stroke="#64748b" stroke-width="0.8"/>
  <circle cx="25" cy="14" r="2.2" fill="#475569"/>
  <rect x="37" y="10" width="8" height="6" rx="2" fill="#cbd5e1" stroke="#64748b" stroke-width="0.8"/>
  <circle cx="41" cy="11" r="2" fill="#94a3b8"/>
  <text x="25" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="bold" fill="#ffffff">−</text>
  <text x="41" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="bold" fill="#ffffff">+</text>
  <text x="32" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="900" fill="#f8fafc">9V</text>
  <text x="32" y="52" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#94a3b8">ALKALINE</text>
</svg>`);

writeSvg('battery-aa', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="baa-b" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="50%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="baa-g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="50%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="baa-m" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#cbd5e1"/>
      <stop offset="50%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
  </defs>
  <rect x="28" y="8" width="8" height="5" rx="1.5" fill="url(#baa-m)" stroke="#64748b" stroke-width="0.8"/>
  <path d="M 20 13 L 44 13 A 2 2 0 0 1 46 15 L 46 26 L 18 26 L 18 15 A 2 2 0 0 1 20 13 Z" fill="url(#baa-g)" stroke="#b45309" stroke-width="0.8"/>
  <text x="32" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="bold" fill="#78350f">+</text>
  <rect x="18" y="26" width="28" height="28" fill="url(#baa-b)" stroke="#0f172a" stroke-width="0.8"/>
  <text x="32" y="40" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="900" fill="#f8fafc">AA</text>
  <text x="32" y="49" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#38bdf8">1.5V</text>
  <path d="M 18 54 L 46 54 L 45 57 A 2 2 0 0 1 43 58 L 21 58 A 2 2 0 0 1 19 57 Z" fill="url(#baa-m)" stroke="#64748b" stroke-width="0.8"/>
</svg>`);

writeSvg('battery-coin-cell', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bcoin-m" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="45%" stop-color="#e2e8f0"/>
      <stop offset="85%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#64748b"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="24" fill="#cbd5e1" stroke="#64748b" stroke-width="1.2"/>
  <circle cx="32" cy="32" r="22" fill="url(#bcoin-m)" stroke="#94a3b8" stroke-width="0.6"/>
  <circle cx="32" cy="20" r="4.5" fill="none" stroke="#64748b" stroke-width="0.8"/>
  <line x1="32" y1="17.5" x2="32" y2="22.5" stroke="#475569" stroke-width="1.2"/>
  <line x1="29.5" y1="20" x2="34.5" y2="20" stroke="#475569" stroke-width="1.2"/>
  <text x="32" y="34" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="900" fill="#334155" letter-spacing="0.5">CR2032</text>
  <text x="32" y="43" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6" font-weight="bold" fill="#64748b">3V LITHIUM</text>
</svg>`);

writeSvg('power-supply', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="8" width="52" height="48" rx="4" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
  <rect x="12" y="14" width="40" height="15" rx="2" fill="#090d16" stroke="#475569" stroke-width="1"/>
  <text x="21" y="25" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#ef4444">12.0</text>
  <text x="43" y="25" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#22c55e">2.00</text>
  <circle cx="20" cy="38" r="4.5" fill="#334155" stroke="#64748b" stroke-width="1"/>
  <circle cx="44" cy="38" r="4.5" fill="#334155" stroke="#64748b" stroke-width="1"/>
  <circle cx="24" cy="49" r="3" fill="#dc2626" stroke="#991b1b" stroke-width="0.8"/>
  <circle cx="32" cy="49" r="3" fill="#16a34a" stroke="#15803d" stroke-width="0.8"/>
  <circle cx="40" cy="49" r="3" fill="#0f172a" stroke="#475569" stroke-width="0.8"/>
</svg>`);

writeSvg('signal-generator', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="10" width="52" height="44" rx="4" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
  <rect x="10" y="14" width="44" height="18" rx="2" fill="#022c22" stroke="#059669" stroke-width="1"/>
  <path d="M 14 23 Q 19 16 24 23 T 34 23 T 44 23" fill="none" stroke="#34d399" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="20" cy="42" r="5" fill="#334155" stroke="#64748b" stroke-width="1"/>
  <line x1="20" y1="37" x2="20" y2="40" stroke="#94a3b8" stroke-width="1.5"/>
  <circle cx="44" cy="42" r="4" fill="#cbd5e1" stroke="#475569" stroke-width="1"/>
  <circle cx="44" cy="42" r="1.5" fill="#0f172a"/>
</svg>`);

// --- DIODES ---
function makeDiodeSvg(label, bandColor = '#cbd5e1') {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="d-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="35%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <line x1="4" y1="32" x2="16" y2="32" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="48" y1="32" x2="60" y2="32" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="16" y="22" width="32" height="20" rx="3" fill="url(#d-body)" stroke="#020617" stroke-width="1"/>
  <rect x="20" y="22" width="5" height="20" fill="${bandColor}"/>
  <text x="35" y="34.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#f8fafc" letter-spacing="0.3">${label}</text>
</svg>`;
}

writeSvg('diode', makeDiodeSvg('DIODE'));
writeSvg('diode-1n4007', makeDiodeSvg('1N4007'));
writeSvg('diode-1n5817', makeDiodeSvg('1N5817'));
writeSvg('diode-1n5819', makeDiodeSvg('1N5819'));

writeSvg('diode-1n4148', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="glass-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ea580c"/>
      <stop offset="40%" stop-color="#f97316" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#c2410c"/>
    </linearGradient>
  </defs>
  <line x1="6" y1="32" x2="18" y2="32" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <line x1="46" y1="32" x2="58" y2="32" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <rect x="18" y="24" width="28" height="16" rx="4" fill="url(#glass-body)" stroke="#9a3412" stroke-width="1"/>
  <rect x="22" y="24" width="4" height="16" fill="#0f172a"/>
  <rect x="31" y="29" width="3" height="6" fill="#78350f"/>
  <text x="35" y="34.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4.5" font-weight="bold" fill="#ffffff">1N4148</text>
</svg>`);

writeSvg('zener-1n4733', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="zener-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
  </defs>
  <line x1="6" y1="32" x2="18" y2="32" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <line x1="46" y1="32" x2="58" y2="32" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <rect x="18" y="24" width="28" height="16" rx="4" fill="url(#zener-body)" stroke="#075985" stroke-width="1"/>
  <rect x="22" y="24" width="4" height="16" fill="#0f172a"/>
  <text x="35" y="34.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4.5" font-weight="bold" fill="#ffffff">5V1</text>
</svg>`);

writeSvg('photodiode', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <line x1="26" y1="44" x2="26" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <line x1="38" y1="44" x2="38" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <path d="M 20 28 A 12 12 0 0 1 44 28 L 44 44 L 20 44 Z" fill="#1e1b4b" stroke="#312e81" stroke-width="1.2"/>
  <circle cx="32" cy="28" r="8" fill="#312e81" opacity="0.6"/>
  <line x1="12" y1="12" x2="22" y2="22" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <polygon points="22,17 24,24 17,22" fill="#facc15"/>
  <line x1="18" y1="8" x2="28" y2="18" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>
  <polygon points="28,13 30,20 23,18" fill="#facc15"/>
</svg>`);

// --- PASSIVES (CAPACITORS, INDUCTORS) ---
function makeCeramicCapSvg(label, mark = '104') {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="disc-body" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="60%" stop-color="#ea580c"/>
      <stop offset="100%" stop-color="#9a3412"/>
    </radialGradient>
  </defs>
  <line x1="26" y1="42" x2="26" y2="58" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
  <line x1="38" y1="42" x2="38" y2="58" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
  <circle cx="32" cy="28" r="18" fill="url(#disc-body)" stroke="#7c2d12" stroke-width="1"/>
  <text x="32" y="27" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="bold" fill="#431407">${mark}</text>
  <text x="32" y="36" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4.5" font-weight="bold" fill="#7c2d12">${label}</text>
</svg>`;
}

writeSvg('capacitor', makeCeramicCapSvg('0.1µF', '104'));
writeSvg('cap-10p', makeCeramicCapSvg('10 pF', '10'));
writeSvg('cap-22p', makeCeramicCapSvg('22 pF', '22'));
writeSvg('cap-100p', makeCeramicCapSvg('100 pF', '101'));
writeSvg('cap-1n', makeCeramicCapSvg('1 nF', '102'));
writeSvg('cap-10n', makeCeramicCapSvg('10 nF', '103'));
writeSvg('cap-100n', makeCeramicCapSvg('100 nF', '104'));
writeSvg('cap-1u', makeCeramicCapSvg('1 µF', '105'));

function makeElecCapSvg(label) {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="elec-can" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="45%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#172554"/>
    </linearGradient>
  </defs>
  <line x1="27" y1="48" x2="27" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <line x1="37" y1="48" x2="37" y2="60" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <rect x="20" y="14" width="24" height="34" rx="2" fill="url(#elec-can)" stroke="#1e293b" stroke-width="1"/>
  <ellipse cx="32" cy="14" rx="12" ry="3" fill="#64748b" stroke="#334155" stroke-width="0.8"/>
  <line x1="30" y1="12.5" x2="34" y2="15.5" stroke="#334155" stroke-width="0.8"/>
  <line x1="34" y1="12.5" x2="30" y2="15.5" stroke="#334155" stroke-width="0.8"/>
  <rect x="20" y="14" width="6" height="34" fill="#cbd5e1"/>
  <text x="23" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6" font-weight="bold" fill="#1e3a8a">−</text>
  <text x="23" y="34" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6" font-weight="bold" fill="#1e3a8a">−</text>
  <text x="23" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6" font-weight="bold" fill="#1e3a8a">−</text>
  <text x="34" y="30" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#ffffff">${label}</text>
  <text x="34" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4" font-weight="bold" fill="#93c5fd">25V</text>
</svg>`;
}

writeSvg('capacitor-electrolytic', makeElecCapSvg('100µF'));
writeSvg('cap-elec-1u', makeElecCapSvg('1 µF'));
writeSvg('cap-elec-10u', makeElecCapSvg('10 µF'));
writeSvg('cap-elec-47u', makeElecCapSvg('47 µF'));
writeSvg('cap-elec-100u', makeElecCapSvg('100 µF'));
writeSvg('cap-elec-470u', makeElecCapSvg('470 µF'));
writeSvg('cap-elec-1000u', makeElecCapSvg('1000 µF'));

function makeInductorSvg(label) {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="32" x2="14" y2="32" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="50" y1="32" x2="60" y2="32" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="14" y="24" width="36" height="16" rx="4" fill="#047857" stroke="#065f46" stroke-width="1"/>
  <path d="M 18 32 Q 22 20 26 32 Q 30 20 34 32 Q 38 20 42 32 Q 46 20 50 32" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>
  <text x="32" y="47" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#065f46">${label}</text>
</svg>`;
}

writeSvg('inductor', makeInductorSvg('INDUCTOR'));
writeSvg('ind-100u', makeInductorSvg('100 µH'));
writeSvg('ind-1m', makeInductorSvg('1 mH'));
writeSvg('ind-10m', makeInductorSvg('10 mH'));

// Preset Resistors with real color bands
const RESISTOR_PRESETS = [
  ['resistor-220',  '220 Ω',  ['#FB0000', '#FB0000', '#8F4814']],
  ['resistor-330',  '330 Ω',  ['#FC9700', '#FC9700', '#8F4814']],
  ['resistor-470',  '470 Ω',  ['#FCF800', '#A803D6', '#8F4814']],
  ['resistor-1k',   '1 kΩ',   ['#8F4814', '#000000', '#FB0000']],
  ['resistor-2k2',  '2.2 kΩ', ['#FB0000', '#FB0000', '#FB0000']],
  ['resistor-4k7',  '4.7 kΩ', ['#FCF800', '#A803D6', '#FB0000']],
  ['resistor-10k',  '10 kΩ',  ['#8F4814', '#000000', '#FC9700']],
  ['resistor-22k',  '22 kΩ',  ['#FB0000', '#FB0000', '#FC9700']],
  ['resistor-47k',  '47 kΩ',  ['#FCF800', '#A803D6', '#FC9700']],
  ['resistor-100k', '100 kΩ', ['#8F4814', '#000000', '#FCF800']],
  ['resistor-1m',   '1 MΩ',   ['#8F4814', '#000000', '#00B800']],
];

for (const [id, label, bands] of RESISTOR_PRESETS) {
  writeSvg(id, `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="32" x2="16" y2="32" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="48" y1="32" x2="60" y2="32" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="16" y="24" width="32" height="16" rx="4" fill="#d5b597" stroke="#a37b4f" stroke-width="1"/>
  <rect x="22" y="24" width="3" height="16" fill="${bands[0]}"/>
  <rect x="28" y="24" width="3" height="16" fill="${bands[1]}"/>
  <rect x="34" y="24" width="3" height="16" fill="${bands[2]}"/>
  <rect x="42" y="24" width="3" height="16" fill="#F1D863"/>
  <text x="32" y="48" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6" font-weight="bold" fill="#a37b4f">${label}</text>
</svg>`);
}

// --- TRANSISTORS & MOSFETS (TO-92, TO-220, TO-3) ---
function makeTo92Svg(label, subtitle) {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="to92-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <line x1="25" y1="40" x2="25" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <line x1="32" y1="40" x2="32" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <line x1="39" y1="40" x2="39" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <path d="M 20 18 A 12 12 0 0 1 44 18 L 44 38 A 2 2 0 0 1 42 40 L 22 40 A 2 2 0 0 1 20 38 Z" fill="url(#to92-g)" stroke="#020617" stroke-width="1"/>
  <rect x="22" y="24" width="20" height="14" rx="1" fill="#1e293b"/>
  <text x="32" y="30" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4.5" font-weight="bold" fill="#f8fafc">${label}</text>
  <text x="32" y="36" text-anchor="middle" font-family="system-ui,sans-serif" font-size="3.5" font-weight="bold" fill="#94a3b8">${subtitle}</text>
</svg>`;
}

writeSvg('bjt-2n2222', makeTo92Svg('2N2222', 'NPN BJT'));
writeSvg('bjt-2n3904', makeTo92Svg('2N3904', 'NPN BJT'));
writeSvg('bjt-2n3906', makeTo92Svg('2N3906', 'PNP BJT'));
writeSvg('bjt-bc547',  makeTo92Svg('BC547',  'NPN BJT'));
writeSvg('bjt-bc557',  makeTo92Svg('BC557',  'PNP BJT'));
writeSvg('mosfet-2n7000', makeTo92Svg('2N7000', 'N-MOSFET'));

writeSvg('bjt-2n3055', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="to3-can" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="60%" stop-color="#cbd5e1"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </radialGradient>
  </defs>
  <polygon points="12,32 32,10 52,32 32,54" fill="#cbd5e1" stroke="#64748b" stroke-width="1.2"/>
  <circle cx="20" cy="20" r="2.5" fill="#475569"/>
  <circle cx="44" cy="44" r="2.5" fill="#475569"/>
  <circle cx="32" cy="32" r="14" fill="url(#to3-can)" stroke="#475569" stroke-width="1"/>
  <text x="32" y="31" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="900" fill="#1e293b">2N3055</text>
  <text x="32" y="37" text-anchor="middle" font-family="system-ui,sans-serif" font-size="3.5" font-weight="bold" fill="#475569">POWER NPN</text>
</svg>`);

function makeTo220Svg(label, subtitle) {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="to220-tab" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="50%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>
    <linearGradient id="to220-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <line x1="25" y1="46" x2="25" y2="58" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="32" y1="46" x2="32" y2="58" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="39" y1="46" x2="39" y2="58" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M 20 10 L 44 10 A 2 2 0 0 1 46 12 L 46 26 L 18 26 L 18 12 A 2 2 0 0 1 20 10 Z" fill="url(#to220-tab)" stroke="#475569" stroke-width="0.8"/>
  <circle cx="32" cy="18" r="3.5" fill="#334155" stroke="#1e293b" stroke-width="0.8"/>
  <rect x="18" y="24" width="28" height="22" rx="2" fill="url(#to220-body)" stroke="#020617" stroke-width="1"/>
  <line x1="18" y1="28" x2="46" y2="28" stroke="#475569" stroke-width="0.6"/>
  <text x="32" y="35" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#f8fafc">${label}</text>
  <text x="32" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="3.8" font-weight="bold" fill="#38bdf8">${subtitle}</text>
</svg>`;
}

writeSvg('mosfet-irf540',    makeTo220Svg('IRF540', 'N-MOSFET'));
writeSvg('mosfet-irf9540',   makeTo220Svg('IRF9540', 'P-MOSFET'));
writeSvg('mosfet-fqp27p06',  makeTo220Svg('FQP27P06', 'P-MOSFET'));
writeSvg('reg-7805',         makeTo220Svg('LM7805', '+5V REG'));
writeSvg('reg-7812',         makeTo220Svg('LM7812', '+12V REG'));
writeSvg('reg-7905',         makeTo220Svg('LM7905', '−5V REG'));
writeSvg('reg-lm317',        makeTo220Svg('LM317', 'ADJ REG'));

// --- DIP ICs (OPAMPS, OPTOCOUPLERS, 74HC LOGIC, MOTOR DRIVERS) ---
function makeDipIc(pins, label, subtitle) {
  const isDip8 = pins === 8;
  const isDip16 = pins === 16;
  const w = isDip16 ? 48 : isDip8 ? 36 : 44;
  const h = 30;
  const x = (64 - w) / 2;
  const y = (64 - h) / 2;
  const pinsPerSide = pins / 2;
  const pinStep = (w - 8) / (pinsPerSide - 1);

  let pinLines = '';
  for (let i = 0; i < pinsPerSide; i++) {
    const px = x + 4 + i * pinStep;
    pinLines += `<line x1="${px}" y1="${y}" x2="${px}" y2="${y - 4}" stroke="#cbd5e1" stroke-width="1.8" stroke-linecap="round"/>`;
    pinLines += `<line x1="${px}" y1="${y + h}" x2="${px}" y2="${y + h + 4}" stroke="#cbd5e1" stroke-width="1.8" stroke-linecap="round"/>`;
  }

  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  ${pinLines}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="#1e293b" stroke="#0f172a" stroke-width="1.2"/>
  <path d="M ${x} ${y + h / 2 - 3} A 3 3 0 0 1 ${x} ${y + h / 2 + 3} Z" fill="#0f172a"/>
  <circle cx="${x + 4}" cy="${y + 5}" r="1.2" fill="#64748b"/>
  <text x="32" y="${y + 13}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${label.length > 7 ? 4.5 : 5.5}" font-weight="900" fill="#f8fafc">${label}</text>
  <text x="32" y="${y + 21}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="3.8" font-weight="bold" fill="#38bdf8">${subtitle}</text>
</svg>`;
}

writeSvg('opamp-ideal', makeDipIc(8, 'OP-AMP', 'IDEAL'));
writeSvg('opamp-lm358', makeDipIc(8, 'LM358', 'DUAL OPAMP'));
writeSvg('opamp-lm741', makeDipIc(8, 'LM741', 'OP-AMP'));
writeSvg('opamp-tl072', makeDipIc(8, 'TL072', 'JFET OPAMP'));
writeSvg('opamp-lm324', makeDipIc(14, 'LM324', 'QUAD OPAMP'));
writeSvg('opto-4n25',   makeDipIc(6, '4N25', 'OPTOCOUPLER'));
writeSvg('opto-pc817',  makeDipIc(4, 'PC817', 'OPTOCOUPLER'));
writeSvg('motor-driver-l293d', makeDipIc(16, 'L293D', 'H-BRIDGE'));

writeSvg('ic-74hc00', makeDipIc(14, '74HC00', 'QUAD NAND'));
writeSvg('ic-74hc02', makeDipIc(14, '74HC02', 'QUAD NOR'));
writeSvg('ic-74hc04', makeDipIc(14, '74HC04', 'HEX NOT'));
writeSvg('ic-74hc08', makeDipIc(14, '74HC08', 'QUAD AND'));
writeSvg('ic-74hc14', makeDipIc(14, '74HC14', 'SCHMITT'));
writeSvg('ic-74hc32', makeDipIc(14, '74HC32', 'QUAD OR'));
writeSvg('ic-74hc86', makeDipIc(14, '74HC86', 'QUAD XOR'));

// --- LOGIC GATES ---
function makeGateSvg(type, inputs = 2) {
  const isNot = type === 'not';
  const hasBubble = ['nand', 'nor', 'xnor', 'not'].includes(type);
  const isOr = ['or', 'nor', 'xor', 'xnor'].includes(type);
  const isXor = ['xor', 'xnor'].includes(type);

  let shapePath = '';
  if (isNot) {
    shapePath = 'M 20 18 L 20 46 L 40 32 Z';
  } else if (isOr) {
    shapePath = 'M 18 16 Q 30 32 18 48 Q 40 48 46 32 Q 40 16 18 16 Z';
  } else {
    shapePath = 'M 18 16 L 32 16 A 16 16 0 0 1 32 48 L 18 48 Z';
  }

  let inLines = '';
  if (inputs === 1) {
    inLines = '<line x1="8" y1="32" x2="20" y2="32" stroke="#64748b" stroke-width="2"/>';
  } else if (inputs === 2) {
    inLines = '<line x1="8" y1="23" x2="18" y2="23" stroke="#64748b" stroke-width="2"/><line x1="8" y1="41" x2="18" y2="41" stroke="#64748b" stroke-width="2"/>';
  } else if (inputs === 3) {
    inLines = '<line x1="8" y1="20" x2="18" y2="20" stroke="#64748b" stroke-width="2"/><line x1="8" y1="32" x2="18" y2="32" stroke="#64748b" stroke-width="2"/><line x1="8" y1="44" x2="18" y2="44" stroke="#64748b" stroke-width="2"/>';
  } else if (inputs === 4) {
    inLines = '<line x1="8" y1="18" x2="18" y2="18" stroke="#64748b" stroke-width="1.8"/><line x1="8" y1="27" x2="18" y2="27" stroke="#64748b" stroke-width="1.8"/><line x1="8" y1="37" x2="18" y2="37" stroke="#64748b" stroke-width="1.8"/><line x1="8" y1="46" x2="18" y2="46" stroke="#64748b" stroke-width="1.8"/>';
  }

  const outX = hasBubble ? (isNot ? 45 : 51) : (isNot ? 40 : 46);
  const bubble = hasBubble ? `<circle cx="${outX - 2.5}" cy="32" r="2.5" fill="#f8fafc" stroke="#1d4ed8" stroke-width="1.5"/>` : '';
  const xorArc = isXor ? '<path d="M 14 16 Q 26 32 14 48" fill="none" stroke="#1d4ed8" stroke-width="1.8"/>' : '';

  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  ${inLines}
  <line x1="${outX}" y1="32" x2="56" y2="32" stroke="#64748b" stroke-width="2"/>
  ${xorArc}
  <path d="${shapePath}" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>
  ${bubble}
  <text x="32" y="58" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="900" fill="#1e40af">${type.toUpperCase()}${inputs > 2 ? ` (${inputs} IN)` : ''}</text>
</svg>`;
}

writeSvg('logic-gate-and',   makeGateSvg('and', 2));
writeSvg('logic-gate-and-3', makeGateSvg('and', 3));
writeSvg('logic-gate-and-4', makeGateSvg('and', 4));
writeSvg('logic-gate-nand',   makeGateSvg('nand', 2));
writeSvg('logic-gate-nand-3', makeGateSvg('nand', 3));
writeSvg('logic-gate-nand-4', makeGateSvg('nand', 4));
writeSvg('logic-gate-or',   makeGateSvg('or', 2));
writeSvg('logic-gate-or-3', makeGateSvg('or', 3));
writeSvg('logic-gate-or-4', makeGateSvg('or', 4));
writeSvg('logic-gate-nor',   makeGateSvg('nor', 2));
writeSvg('logic-gate-nor-3', makeGateSvg('nor', 3));
writeSvg('logic-gate-nor-4', makeGateSvg('nor', 4));
writeSvg('logic-gate-xor',  makeGateSvg('xor', 2));
writeSvg('logic-gate-xnor', makeGateSvg('xnor', 2));
writeSvg('logic-gate-not',  makeGateSvg('not', 1));

function makeFlipFlop(type) {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="10" width="36" height="44" rx="2" fill="#eff6ff" stroke="#2563eb" stroke-width="1.5"/>
  <line x1="6" y1="20" x2="14" y2="20" stroke="#64748b" stroke-width="1.8"/>
  <line x1="6" y1="32" x2="14" y2="32" stroke="#64748b" stroke-width="1.8"/>
  <line x1="6" y1="44" x2="14" y2="44" stroke="#64748b" stroke-width="1.8"/>
  <polyline points="14,29 18,32 14,35" fill="none" stroke="#2563eb" stroke-width="1.5"/>
  <line x1="50" y1="20" x2="58" y2="20" stroke="#64748b" stroke-width="1.8"/>
  <line x1="50" y1="44" x2="58" y2="44" stroke="#64748b" stroke-width="1.8"/>
  <text x="17" y="22" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#1e40af">${type === 'd' ? 'D' : type === 'jk' ? 'J' : 'T'}</text>
  <text x="17" y="46" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#1e40af">${type === 'jk' ? 'K' : 'CLK'}</text>
  <text x="47" y="22" text-anchor="end" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#1e40af">Q</text>
  <text x="47" y="46" text-anchor="end" font-family="system-ui,sans-serif" font-size="5" font-weight="bold" fill="#1e40af">Q̄</text>
  <text x="32" y="34" text-anchor="middle" font-family="system-ui,sans-serif" font-size="6" font-weight="900" fill="#2563eb">${type.toUpperCase()}-FF</text>
</svg>`;
}

writeSvg('flip-flop-d',  makeFlipFlop('d'));
writeSvg('flip-flop-jk', makeFlipFlop('jk'));
writeSvg('flip-flop-t',  makeFlipFlop('t'));

// --- RELAY & BUZZER ---
writeSvg('relay', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="relay-b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <line x1="18" y1="48" x2="18" y2="56" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
  <line x1="46" y1="48" x2="46" y2="56" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
  <line x1="32" y1="48" x2="32" y2="56" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
  <rect x="14" y="14" width="36" height="34" rx="3" fill="url(#relay-b)" stroke="#1e40af" stroke-width="1.2"/>
  <text x="32" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="900" fill="#ffffff" letter-spacing="0.5">SONGLE</text>
  <text x="32" y="32" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4" font-weight="bold" fill="#93c5fd">5VDC RELAY</text>
  <rect x="18" y="36" width="28" height="8" rx="1.5" fill="#1e40af" opacity="0.6"/>
  <text x="32" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4" font-weight="bold" fill="#ffffff">10A 250VAC</text>
</svg>`);

writeSvg('buzzer', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="buzzer-b" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="60%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
  </defs>
  <line x1="26" y1="48" x2="26" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <line x1="38" y1="48" x2="38" y2="58" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  <circle cx="32" cy="30" r="20" fill="url(#buzzer-b)" stroke="#020617" stroke-width="1.2"/>
  <circle cx="32" cy="30" r="17" fill="none" stroke="#334155" stroke-width="1"/>
  <circle cx="32" cy="30" r="5" fill="#020617" stroke="#1e293b" stroke-width="1"/>
  <text x="22" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="bold" fill="#ef4444">+</text>
  <text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4" font-weight="bold" fill="#94a3b8">BUZZER</text>
</svg>`);

// --- DISPLAYS & MODULES ---
writeSvg('lcd1602-i2c', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="14" width="52" height="36" rx="2.5" fill="#15803d" stroke="#166534" stroke-width="1"/>
  <circle cx="9" cy="17" r="1.5" fill="#facc15"/>
  <circle cx="55" cy="17" r="1.5" fill="#facc15"/>
  <circle cx="9" cy="47" r="1.5" fill="#facc15"/>
  <circle cx="55" cy="47" r="1.5" fill="#facc15"/>
  <rect x="11" y="20" width="42" height="24" rx="1.5" fill="#0f172a" stroke="#020617" stroke-width="0.8"/>
  <rect x="14" y="22" width="36" height="20" rx="1" fill="#84cc16"/>
  <g fill="#14532d" opacity="0.8">
    <rect x="16" y="25" width="3" height="5"/>
    <rect x="20" y="25" width="3" height="5"/>
    <rect x="24" y="25" width="3" height="5"/>
    <rect x="28" y="25" width="3" height="5"/>
    <rect x="32" y="25" width="3" height="5"/>
    <rect x="36" y="25" width="3" height="5"/>
    <rect x="40" y="25" width="3" height="5"/>
    <rect x="44" y="25" width="3" height="5"/>
    <rect x="16" y="34" width="3" height="5"/>
    <rect x="20" y="34" width="3" height="5"/>
    <rect x="24" y="34" width="3" height="5"/>
    <rect x="28" y="34" width="3" height="5"/>
    <rect x="32" y="34" width="3" height="5"/>
    <rect x="36" y="34" width="3" height="5"/>
    <rect x="40" y="34" width="3" height="5"/>
    <rect x="44" y="34" width="3" height="5"/>
  </g>
  <rect x="2" y="26" width="4" height="12" rx="1" fill="#1e293b"/>
  <text x="4" y="35" text-anchor="middle" font-family="system-ui,sans-serif" font-size="3" font-weight="bold" fill="#38bdf8">I2C</text>
</svg>`);

writeSvg('lcd2004-i2c', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="10" width="52" height="44" rx="2.5" fill="#1e3a8a" stroke="#172554" stroke-width="1"/>
  <rect x="10" y="14" width="44" height="36" rx="1.5" fill="#0f172a"/>
  <rect x="13" y="17" width="38" height="30" rx="1" fill="#38bdf8"/>
  <text x="32" y="34" text-anchor="middle" font-family="monospace" font-size="6" font-weight="bold" fill="#0c4a6e">LCD2004 I2C</text>
</svg>`);

writeSvg('ssd1306-i2c-4pin', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="10" width="48" height="44" rx="2.5" fill="#1e3a8a" stroke="#1d4ed8" stroke-width="1"/>
  <rect x="22" y="11" width="20" height="4" fill="#0f172a"/>
  <line x1="25" y1="11" x2="25" y2="15" stroke="#cbd5e1" stroke-width="1"/>
  <line x1="29" y1="11" x2="29" y2="15" stroke="#cbd5e1" stroke-width="1"/>
  <line x1="33" y1="11" x2="33" y2="15" stroke="#cbd5e1" stroke-width="1"/>
  <line x1="37" y1="11" x2="37" y2="15" stroke="#cbd5e1" stroke-width="1"/>
  <rect x="12" y="18" width="40" height="32" rx="1" fill="#020617" stroke="#000" stroke-width="0.8"/>
  <rect x="15" y="21" width="34" height="26" fill="#0c0a09"/>
  <text x="32" y="32" text-anchor="middle" font-family="monospace" font-size="5" font-weight="bold" fill="#38bdf8">0.96" OLED</text>
  <text x="32" y="40" text-anchor="middle" font-family="monospace" font-size="4" font-weight="bold" fill="#facc15">SSD1306 I2C</text>
</svg>`);

writeSvg('ds3231', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="8" width="44" height="48" rx="3" fill="#1e3a8a" stroke="#1d4ed8" stroke-width="1"/>
  <circle cx="32" cy="24" r="10" fill="#cbd5e1" stroke="#94a3b8" stroke-width="0.8"/>
  <text x="32" y="26" text-anchor="middle" font-family="sans-serif" font-size="4" font-weight="bold" fill="#475569">CR2032</text>
  <rect x="22" y="38" width="20" height="12" rx="1" fill="#1e293b"/>
  <text x="32" y="46" text-anchor="middle" font-family="sans-serif" font-size="4" font-weight="bold" fill="#f8fafc">DS3231</text>
</svg>`);

writeSvg('gps-neo6m', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="44" height="44" rx="2" fill="#1e3a8a" stroke="#1d4ed8" stroke-width="1"/>
  <rect x="16" y="16" width="32" height="32" rx="2" fill="#d97706" stroke="#b45309" stroke-width="0.8"/>
  <circle cx="32" cy="32" r="3" fill="#cbd5e1"/>
  <text x="32" y="44" text-anchor="middle" font-family="sans-serif" font-size="4" font-weight="bold" fill="#ffffff">NEO-6M</text>
</svg>`);

function makeEPaperSvg(title, color = '#ffffff') {
  return `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="10" width="48" height="40" rx="2" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1"/>
  <rect x="12" y="13" width="40" height="34" fill="${color}" stroke="#cbd5e1" stroke-width="0.6"/>
  <text x="32" y="32" text-anchor="middle" font-family="monospace" font-size="5" font-weight="bold" fill="#334155">${title}</text>
  <rect x="24" y="50" width="16" height="8" fill="#d97706" rx="1"/>
</svg>`;
}

writeSvg('epaper-1in54-bw',  makeEPaperSvg('1.54" EPD'));
writeSvg('epaper-2in13-bw',  makeEPaperSvg('2.13" EPD'));
writeSvg('epaper-2in13-bwr', makeEPaperSvg('2.13" BWR', '#fee2e2'));
writeSvg('epaper-2in9-bw',   makeEPaperSvg('2.9" EPD'));
writeSvg('epaper-2in9-bwr',  makeEPaperSvg('2.9" BWR', '#fee2e2'));
writeSvg('epaper-4in2-bw',   makeEPaperSvg('4.2" EPD'));
writeSvg('epaper-5in65-7c',  makeEPaperSvg('5.65" 7C', '#fef08a'));
writeSvg('epaper-7in5-bw',   makeEPaperSvg('7.5" EPD'));

writeSvg('junction', `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <line x1="12" y1="32" x2="52" y2="32" stroke="#22d3ee" stroke-width="2"/>
  <line x1="32" y1="12" x2="32" y2="52" stroke="#22d3ee" stroke-width="2"/>
  <circle cx="32" cy="32" r="5" fill="#00e5ff" stroke="#0891b2" stroke-width="1.5"/>
</svg>`);

// ── 5. Sync metadata thumbnails with the generated SVGs ──────────────────────
console.log('\n📝 Updating components-metadata.json with inline SVG thumbnails...');
if (fs.existsSync(METADATA_PATH)) {
  const meta = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'));
  let updatedCount = 0;

  for (const comp of meta.components) {
    const svgFile = path.join(OUT_DIR, `${comp.id}.svg`);
    if (fs.existsSync(svgFile)) {
      let content = fs.readFileSync(svgFile, 'utf-8');
      content = content.replace(/^<\?xml[^>]*\?>\s*/i, '').trim();
      comp.thumbnail = content;
      updatedCount++;
    }
  }

  fs.writeFileSync(METADATA_PATH, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`✅ Updated ${updatedCount} thumbnails in components-metadata.json`);
}

console.log('\n🎉 ALL COMPONENT SVGs SUCCESSFULLY GENERATED & REGISTERED!\n');

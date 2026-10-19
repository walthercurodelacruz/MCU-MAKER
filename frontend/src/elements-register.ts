/**
 * Side-effect module: register every custom element (upstream wokwi +
 * mcu-maker-local) without pulling in any React component. Import this when you
 * need `document.createElement('wokwi-…')` to resolve — e.g. pin-metadata
 * introspection in tests/generators — but don't want DynamicComponent's
 * store/simulation dependency graph.
 */

import '@wokwi/elements';
import './mcu-maker-elements';

// Element classes that live next to their React wrappers instead of in
// mcu-maker-elements/ (each module self-registers its tags, guarded against
// double-registration and non-DOM environments).
import './components/mcu-maker-components/Attiny85Element';
import './components/mcu-maker-components/Bmp280Element';
import './components/mcu-maker-components/DiodeElements';
import './components/mcu-maker-components/Ds3231Element';
import './components/mcu-maker-components/EPaperElement';
import './components/mcu-maker-components/Esp32Element';
import './components/mcu-maker-components/FlipFlopElements';
import './components/mcu-maker-components/GpsNeo6mElement';
import './components/mcu-maker-components/IC74HC595';
import './components/mcu-maker-components/LogicGateElements';
import './components/mcu-maker-components/LogicICElements';
import './components/mcu-maker-components/MotorDriverElements';
import './components/mcu-maker-components/OpAmpElements';
import './components/mcu-maker-components/PiPicoWElement';
import './components/mcu-maker-components/PowerElements';
import './components/mcu-maker-components/RelayElements';
import './components/mcu-maker-components/Ssd1306I2cElement';
import './components/mcu-maker-components/TransistorElements';
import './components/mcu-maker-components/TinkercadElements';

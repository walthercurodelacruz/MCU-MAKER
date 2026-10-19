/**
 * Pin function tables for every OSS board kind (DESIGN section 5.2).
 *
 * Importing this module registers them. The pro overlay registers its own
 * boards the same way, through registerBoardPinFunctions.
 */
import type { BoardKind } from '../../../types/board';
import { registerBoardPinFunctions, type BoardPinFunctions } from '../pinFunctions';
import { ATMEGA2560_TABLE, ATMEGA328P_TABLE, ATTINY85_TABLE } from './avr';
import { PICO_TABLE } from './rp2040';
import {
  ESP32_CAM_TABLE,
  ESP32_DEVKIT_C_V4_TABLE,
  ESP32_DEVKIT_V1_TABLE,
  LOLIN32_LITE_TABLE,
} from './esp32';
import { ESP32S3_DEVKITC_TABLE, NANO_ESP32_TABLE, XIAO_ESP32S3_TABLE } from './esp32s3';
import { ESP32C3_DEVKITM_TABLE, ESP32C3_SUPERMINI_TABLE, XIAO_ESP32C3_TABLE } from './esp32c3';

/** Board kind -> table. Typed over the OSS union so a new kind without a table fails to compile. */
export const OSS_BOARD_PIN_TABLES: Record<BoardKind, BoardPinFunctions> = {
  'arduino-uno': ATMEGA328P_TABLE,
  'arduino-nano': ATMEGA328P_TABLE,
  'arduino-mega': ATMEGA2560_TABLE,
  attiny85: ATTINY85_TABLE,
  'raspberry-pi-pico': PICO_TABLE,
  'pi-pico-w': PICO_TABLE,
  esp32: ESP32_DEVKIT_V1_TABLE,
  'esp32-devkit-c-v4': ESP32_DEVKIT_C_V4_TABLE,
  'esp32-cam': ESP32_CAM_TABLE,
  'wemos-lolin32-lite': LOLIN32_LITE_TABLE,
  'esp32-s3': ESP32S3_DEVKITC_TABLE,
  'xiao-esp32-s3': XIAO_ESP32S3_TABLE,
  'arduino-nano-esp32': NANO_ESP32_TABLE,
  'esp32-c3': ESP32C3_DEVKITM_TABLE,
  'xiao-esp32-c3': XIAO_ESP32C3_TABLE,
  'aitewinrobot-esp32c3-supermini': ESP32C3_SUPERMINI_TABLE,
};

for (const [kind, table] of Object.entries(OSS_BOARD_PIN_TABLES)) {
  registerBoardPinFunctions([kind], table);
}

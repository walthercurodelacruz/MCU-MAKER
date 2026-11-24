// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';
import { compileChip, chipCompileStatus } from '../services/chipCompileService';
import { compileRom } from '../services/romCompileService';
import { compileCode } from '../services/compilation';

describe('API Contract Alignment with mcu-maker-server (Rust)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compileChip posts to /api/compile-chip without trailing slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        wasm_base64: 'AA==',
        stdout: '',
        stderr: '',
        error: null,
        byte_size: 1,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await compileChip('void chip_setup(void) {}');
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/compile-chip',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('chipCompileStatus requests /api/compile-chip/status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: false, wasi_sdk: null, sdk_include: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const status = await chipCompileStatus();
    expect(status.available).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/compile-chip/status', { credentials: 'include' });
  });

  it('compileRom posts to /api/compile-rom without trailing slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        rom_base64: 'q80=',
        byte_size: 2,
        stderr: '',
        error: null,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await compileRom(':02000000ABCD86\n:00000001FF\n', '8080', 'hex');
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/compile-rom',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('compileCode aborts promptly after consecutive poll failures instead of hanging forever', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { job_id: 'job-123' } });
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Network Error'));

    await expect(
      compileCode([{ name: 'sketch.ino', content: 'void setup(){} void loop(){}' }], 'arduino:avr:uno'),
    ).rejects.toThrow(/Lost connection to the compile server/i);
  }, 20_000);
});

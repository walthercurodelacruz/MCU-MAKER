import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { registerEditorCommand } from '../../lib/editorCommands';
import { publishCompileOutput } from '../../lib/intellisenseRegistry';
import { useEditorStore, chipFileGroupId } from '../../store/useEditorStore';
import { useSimulatorStore, piRerunScript, getEsp32Bridge, getStm32Bridge, getBoardPinManager } from '../../store/useSimulatorStore';
import { decideEngine } from '../../lib/instantEngine';
import { blockedByBoardGate } from '../../lib/proBoardGate';
import { useElectricalStore } from '../../store/useElectricalStore';
import { type VerificationResult } from '../../simulation/verify/circuitVerifier';
import { verifyCircuitFromStore } from '../../simulation/verify/verifyFromStore';
import { CircuitVerificationModal } from '../simulator/CircuitVerificationModal';
import type { BoardKind, LanguageMode } from '../../types/board';
import { BOARD_KIND_FQBN, BOARD_SUPPORTS_ESPIDF, BOARD_SUPPORTS_MICROPYTHON, fqbnForLanguage, isKnownBoardKind, isPiBoardKind, boardDisplayName } from '../../types/board';
import { compileCode, clearCompileCache } from '../../services/compilation';
import { compileOptionsForBoard } from '../../utils/boardCompile';
import {
  compileRom,
  isChipProgramFile,
  formatForFile,
  targetForChip,
} from '../../services/romCompileService';
import { ensureChipWasm, flushChipFileSync } from '../../services/chipFiles';
import { clearChipDrives } from '../../simulation/customChips/chipPinDrives';
import { requestElectricalResolve } from '../../simulation/spice/electricalResolveHook';
import { reportRunEvent } from '../../services/metricsService';
import { useProjectStore } from '../../store/useProjectStore';
import { triggerDownloadVlx } from '../../utils/vlxFile';
import {
  compileProgress,
  MULTI_BOARD_PROGRESS_ID,
} from '../../store/useCompileProgressStore';
import { LibraryManagerModal } from '../simulator/LibraryManagerModal';
import { InstallLibrariesModal } from '../simulator/InstallLibrariesModal';
import { mergeSuggestedLibraries } from '../../utils/libraryManifest';
import { parseCompileResult, isNoiseBuildLine } from '../../utils/compilationLogger';
import type { CompilationLog, CompileTarget } from '../../utils/compilationLogger';
import { exportToWokwiZip, retargetBoardWires } from '../../utils/wokwiZip';
import { wifiSsidNoteFor } from '../../utils/firmwareWifiNote';
import { importProjectFile, PROJECT_FILE_ACCEPT } from '../../utils/importProject';
import { readFirmwareFile } from '../../utils/firmwareLoader';
import {
  trackCompileCode,
  trackRunSimulation,
  trackStopSimulation,
  trackResetSimulation,
  trackOpenLibraryManager,
} from '../../utils/analytics';
import './EditorToolbar.css';
import { getResolvedTheme } from '../../lib/theme';

/**
 * Output-console group for circuit pre-flight + runtime faults. Routing these
 * into the compile console (instead of an inline toolbar toast that overlapped
 * the Run/Stop buttons) gives one unified, red-coloured diagnostics log —
 * Proteus-style. id is matched when clearing so the findings survive an
 * auto-compile triggered by the same Run.
 */
const CIRCUIT_CHECK_TARGET: CompileTarget = {
  id: 'circuit-check',
  label: 'Circuit check',
  kind: 'board',
};

/**
 * Clear the output drives of every custom chip on the canvas and re-solve, so
 * chip-driven LEDs go dark on Stop. A chip drives its nets via its own SPICE
 * voltage sources (registered in chipPinDrives); stopBoard / electrical-pause
 * don't touch those, so without this the LEDs would freeze at their last frame.
 */
function clearAllChipDrives(): void {
  const comps = useSimulatorStore.getState().components;
  let any = false;
  for (const c of comps) {
    if (c.metadataId === 'custom-chip') {
      clearChipDrives(c.id);
      any = true;
    }
  }
  if (any) requestElectricalResolve();
}

/**
 * Boards whose firmware runs in a QEMU worker rather than a client-side AVR
 * core. They can start without a pre-stored `compiledProgram`. Shared by
 * handleRun and handleRunAll so the two paths can't drift.
 */
function isQemuBoardKind(kind: BoardKind | undefined): boolean {
  if (!kind) return false;
  return (
    isPiBoardKind(kind) ||
    kind === 'esp32' ||
    kind === 'esp32-s3' ||
    kind === 'esp32-cam' ||
    kind === 'esp32-c3' ||
    kind === 'esp32-devkit-c-v4' ||
    kind === 'wemos-lolin32-lite' ||
    kind === 'xiao-esp32-s3' ||
    kind === 'arduino-nano-esp32' ||
    kind === 'xiao-esp32-c3' ||
    kind === 'aitewinrobot-esp32c3-supermini'
  );
}

interface EditorToolbarProps {
  consoleOpen: boolean;
  setConsoleOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  compileLogs: CompilationLog[];
  setCompileLogs: (logs: CompilationLog[] | ((prev: CompilationLog[]) => CompilationLog[])) => void;
  /**
   * Optional element rendered between the left action group and the right
   * action group. Normally empty (the slot just acts as a flexible spacer
   * that keeps the right action icons pinned); private overlays may inject
   * deployment-specific content here without forking the toolbar.
   */
  centerSlot?: React.ReactNode;
  /**
   * Optional extra elements rendered after the built-in right-group buttons
   * (Libraries / Import-Export / Output Console). Used by private overlays
   * to add deployment-specific actions without forking the toolbar.
   */
  rightSlot?: React.ReactNode;
  circuitToolsSlotRef?: React.Ref<HTMLDivElement>;
}

const BOARD_PILL_ICON: Record<BoardKind, string> = {
  'arduino-uno': '⬤',
  'arduino-nano': '▪',
  'arduino-mega': '▬',
  attiny85: '▫',
  'raspberry-pi-pico': '◆',
  'pi-pico-w': '◇',
  esp32: '⬡',
  'esp32-devkit-c-v4': '⬡',
  'esp32-cam': '📷',
  'wemos-lolin32-lite': '⬡',
  'esp32-s3': '⬢',
  'xiao-esp32-s3': '⬢',
  'arduino-nano-esp32': '⬢',
  'esp32-c3': '⬡',
  'xiao-esp32-c3': '⬡',
  'aitewinrobot-esp32c3-supermini': '⬡',
};

const BOARD_PILL_COLOR: Record<BoardKind, string> = {
  'arduino-uno': '#4fc3f7',
  'arduino-nano': '#4fc3f7',
  'arduino-mega': '#4fc3f7',
  attiny85: '#4fc3f7',
  'raspberry-pi-pico': '#ce93d8',
  'pi-pico-w': '#ce93d8',
  esp32: 'var(--color-feedback-success)',
  'esp32-devkit-c-v4': 'var(--color-feedback-success)',
  'esp32-cam': 'var(--color-feedback-success)',
  'wemos-lolin32-lite': 'var(--color-feedback-success)',
  'esp32-s3': 'var(--color-feedback-success)',
  'xiao-esp32-s3': 'var(--color-feedback-success)',
  'arduino-nano-esp32': 'var(--color-feedback-success)',
  'esp32-c3': 'var(--color-feedback-success)',
  'xiao-esp32-c3': 'var(--color-feedback-success)',
  'aitewinrobot-esp32c3-supermini': 'var(--color-feedback-success)',
};

export const EditorToolbar = ({
  consoleOpen,
  setConsoleOpen,
  compileLogs: _compileLogs,
  setCompileLogs,
  centerSlot,
  rightSlot,
  circuitToolsSlotRef,
}: EditorToolbarProps) => {
  const { t } = useTranslation();
  const { files, codeChangedSinceLastCompile, markCompiled } = useEditorStore();
  const {
    boards,
    activeBoardId,
    compileBoardProgram,
    loadMicroPythonProgram,
    setBoardLanguageMode,
    updateBoard,
    startBoard,
    stopBoard,
    resetBoard,
    clearBoardSerialOutput,
    // legacy compat
    startSimulation,
    stopSimulation,
    resetSimulation,
    running,
    compiledHex,
  } = useSimulatorStore();

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];
  const currentProject = useProjectStore((s) => s.currentProject);

  // Board-less mode: digital / analog SPICE-only circuits. The Run / Stop
  // buttons toggle the SPICE solver's `paused` flag — pausing freezes every
  // LED at its current brightness so the user can inspect the state, and
  // resuming flushes the most recent switch toggle through the engine.
  const electricalPaused = useElectricalStore((s) => s.paused);
  const setElectricalPaused = useElectricalStore((s) => s.setPaused);
  const isBoardless = boards.length === 0;
  const digitalRunning = isBoardless && !electricalPaused;
  // Any board actually running — the correct multi-target signal for the
  // Run-All / Stop buttons (the flat `running` flag only tracks the ACTIVE
  // board, so it misreports a multi-board or non-active-board run).
  const anyBoardRunning = boards.some((b) => b.running);
  const isSimRunning = isBoardless ? digitalRunning : anyBoardRunning;
  // Multi-board: the primary Run button runs ALL boards (the whole wired
  // project is one system — running a subset is almost never intended), with a
  // split-menu to still run just the active board. Single-board is unchanged.
  const isMultiBoard = boards.length > 1;

  // A "run target" is a board OR a programmable custom-chip (a CPU that runs a
  // ROM). When there is more than one target — two boards, a board + a chip, or
  // several chips — the unified Compile-All / Run-All buttons appear and act on
  // every target, the same way multiple Arduinos behave. Resolved as a number
  // so the toolbar only re-renders when the count changes. The predicate is a
  // cheap string test (no JSON.parse) since this selector runs on every store
  // change, including high-frequency simulation churn. (The compile/run paths
  // deliberately act on ALL custom chips, not just programmable ones.)
  const targetCount = useSimulatorStore((s) => {
    let chips = 0;
    for (const c of s.components) {
      if (c.metadataId !== 'custom-chip') continue;
      const p = c.properties as Record<string, unknown>;
      if (String(p?.programFile ?? '').trim() || String(p?.chipJson ?? '').includes('"programTargets"'))
        chips++;
    }
    return s.boards.length + chips;
  });

  // Circuit-verification modal state. When `pendingRun` is non-null we've
  // already paid the cost of solving + analysing — the user can either
  // bail out or proceed by running `pendingRun()`.
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const pendingRunRef = useRef<(() => void) | null>(null);

  // Helper: report a Run event to the backend for analytics. Resolves the
  // FQBN from the board kind so the backend can group by family/fqbn.
  const reportRun = useCallback(
    (boardKind: BoardKind | undefined, engine?: 'instant' | 'linux') => {
      const fqbn = boardKind ? BOARD_KIND_FQBN[boardKind] : null;
      void reportRunEvent({
        project_id: currentProject?.id ?? null,
        board_fqbn: fqbn ?? null,
        board_kind: boardKind ?? null,
        example_id: useProjectStore.getState().currentExampleId,
        engine: engine ?? null,
      });
    },
    [currentProject],
  );
  const [compiling, setCompiling] = useState(false);
  // True while the pre-flight circuit verification SPICE solve is running.
  // Drives the Run-button spinner so the user gets feedback during the
  // (sometimes multi-second, cold-worker) solve instead of a dead button.
  const [verifying, setVerifying] = useState(false);
  // Synchronous re-entrancy guard: a click while a run/verify is already in
  // flight is ignored, so rapid clicks can't stack multiple verifications.
  const runInFlightRef = useRef(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [libManagerOpen, setLibManagerOpen] = useState(false);
  const [pendingLibraries, setPendingLibraries] = useState<string[]>([]);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const firmwareInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [missingLibHint, setMissingLibHint] = useState(false);
  // Split-button menu for the multi-board Run control ("Run all" / "Run active only").
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const runMenuRef = useRef<HTMLDivElement>(null);

  // Open the Library Manager when another component (e.g. the mcu_maker.json entry
  // in the FileExplorer) asks for it via a window event. Avoids prop-drilling
  // the modal state down to the explorer.
  useEffect(() => {
    const open = () => setLibManagerOpen(true);
    window.addEventListener('mcu-maker-open-library-manager', open);
    window.addEventListener('open-libraries-modal', open);
    return () => {
      window.removeEventListener('mcu-maker-open-library-manager', open);
      window.removeEventListener('open-libraries-modal', open);
    };
  }, []);

  // Surface a runtime circuit fault (e.g. an LED that burnt out from
  // overcurrent during the live SPICE solve) in the output console, in red,
  // under the "Circuit check" group — same place as the pre-flight findings.
  // (Previously an inline toolbar toast that overlapped the Run/Stop buttons.)
  // We do NOT auto-open the console here: the continuous solver can fault on
  // load, and popping the console open then would be intrusive. The pre-flight
  // (on Run) opens it; this entry then lands in the already-open log.
  useEffect(() => {
    const onFault = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { message?: string; severity?: 'error' | 'warning' | 'info' }
        | undefined;
      if (!detail?.message) return;
      const text = detail.message;
      // Everything on this channel used to land as an ERROR, and the agent
      // panel counts those: a heuristic that turned out to be wrong, or the
      // line that says so, both read as "Compile failed with N errors" on a
      // build that succeeded. Producers may now say what a line is worth;
      // omitting it keeps the old behaviour for the solver and burnout
      // reporters, which really are faults.
      const type = detail.severity ?? 'error';
      setCompileLogs((prev) => [
        ...prev,
        { timestamp: new Date(), type, message: text, target: CIRCUIT_CHECK_TARGET },
      ]);
    };
    window.addEventListener('mcu-maker-circuit-fault', onFault);
    return () => window.removeEventListener('mcu-maker-circuit-fault', onFault);
  }, [setCompileLogs]);


  // Close the Run split-menu on outside click / Escape (mirrors the more-menu).
  useEffect(() => {
    if (!runMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (runMenuRef.current && !runMenuRef.current.contains(e.target as Node)) {
        setRunMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRunMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [runMenuOpen]);

  // Compile All / Run All — runs sequentially, logs to console (no dialog)
  const [compileAllRunning, setCompileAllRunning] = useState(false);

  const addLog = useCallback(
    (log: CompilationLog) => {
      setCompileLogs((prev: CompilationLog[]) => [...prev, log]);
    },
    [setCompileLogs],
  );

  /**
   * Make every custom-chip on the canvas runnable: compile its C source to
   * WASM (when it has none yet) and, for programmable CPU chips, assemble or
   * compile the program file it references into ROM bytes — stashing both on
   * the chip component's `properties` so the next simulation start picks them
   * up. Non-fatal by design: a chip that fails to compile is logged and
   * skipped so the board itself still runs.
   */
  const prepareCustomChips = useCallback(
    async (
      chips: { id: string; properties: Record<string, unknown> }[],
      boardFiles: { name: string; content: string }[],
    ) => {
      const codeChanged = useEditorStore.getState().codeChangedSinceLastCompile;
      const updateComponent = useSimulatorStore.getState().updateComponent;
      let failed = 0;

      // Commit any chip.c/chip.json edit still sitting in the sync debounce
      // before reading properties — Run must never build a stale source.
      flushChipFileSync();

      for (const chip of chips) {
        // Re-read the freshest properties each iteration (an earlier chip's
        // update doesn't touch this one, but be defensive).
        const live = useSimulatorStore.getState().components.find((c) => c.id === chip.id);
        const props = { ...(live?.properties ?? chip.properties) } as Record<string, unknown>;
        const chipLabel = String(props.chipName ?? 'custom chip');
        const sourceC = String(props.sourceC ?? '');
        const chipJson = String(props.chipJson ?? '{}');
        // Stamp every line for this chip with its target so the console groups
        // it under its own section (alongside the boards).
        const chipTarget: CompileTarget = { id: chip.id, label: chipLabel, kind: 'chip' };
        const clog = (type: CompilationLog['type'], message: string) =>
          addLog({ timestamp: new Date(), type, message, target: chipTarget });

        // 1. C -> WASM. ensureChipWasm recompiles when the wasm is missing
        //    OR the source hash changed since the last build (chip.c edits
        //    clear the wasm via the file sync, but a property written
        //    directly — e.g. by the agent — must not leave a stale binary).
        //    It writes the component itself, merging onto live properties.
        if (sourceC) {
          const r = await ensureChipWasm(chip.id, clog);
          if (!r.ok) failed++;
        }

        // 2. program file -> ROM bytes (programmable CPU chips). Recompile
        //    when there's no ROM yet or the user edited code since last build.
        const programFile = String(props.programFile ?? '').trim();
        if (programFile && (!String(props.romBytes ?? '') || codeChanged)) {
          // The program lives in the chip's OWN editor group (its collapsible
          // section in the file explorer), separate from the board sketch.
          // Fall back to the board files for older projects that still carried
          // the program alongside sketch.ino in the board group.
          const chipGroupFiles = useEditorStore
            .getState()
            .getGroupFiles(chipFileGroupId(chip.id));
          const file =
            chipGroupFiles.find((f) => f.name === programFile) ??
            boardFiles.find((f) => f.name === programFile);
          if (!file) {
            clog('error', `Chip "${chipLabel}": program file "${programFile}" not found in the chip's files.`);
            failed++;
          } else {
            const target = targetForChip(chipJson);
            const fmt = formatForFile(programFile);
            clog(
              'info',
              `Assembling "${programFile}" (target=${target}, format=${fmt}) for chip "${chipLabel}"...`,
            );
            try {
              const rr = await compileRom(file.content, target, fmt);
              if (rr.success && rr.rom_base64) {
                // Merge onto the LIVE properties — the compile was an await
                // and a stale spread here would revert anything written in
                // the meantime (the wasm step above, a concurrent edit).
                const fresh = useSimulatorStore.getState().components.find((c) => c.id === chip.id);
                updateComponent(chip.id, {
                  properties: {
                    ...((fresh?.properties ?? props) as Record<string, unknown>),
                    romBytes: rr.rom_base64,
                    programFile,
                  },
                } as any);
                clog('success', `ROM ready: ${rr.byte_size} B injected into "${chipLabel}".`);
              } else {
                clog(
                  'error',
                  `ROM compile failed for "${programFile}": ${rr.error || rr.stderr || 'unknown error'}`,
                );
                failed++;
              }
            } catch (e) {
              clog(
                'error',
                `ROM compile error for "${programFile}": ${e instanceof Error ? e.message : String(e)}`,
              );
              failed++;
            }
          }
        }
      }
      return { failed };
    },
    [addLog],
  );

  const handleCompile = async () => {
    setCompiling(true);
    setMessage(null);
    setConsoleOpen(true);
    // Wipe the previous build's output before we append anything new.
    // Issue #209: lingering logs from prior compiles made it impossible
    // to tell the latest errors / warnings apart from stale ones.
    // Keep the "Circuit check" findings, though: a Run auto-compiles right
    // after the pre-flight verification logs them, and clearing here would
    // wipe a circuit warning the user just triggered.
    setCompileLogs((prev) => prev.filter((l) => l.target?.id === CIRCUIT_CHECK_TARGET.id));
    trackCompileCode();

    // Limpiar programa compilado anterior y caché antes de compilar
    if (activeBoardId) {
      updateBoard(activeBoardId, { compiledProgram: null });
      getEsp32Bridge(activeBoardId)?.clearFirmware();
    }
    void clearCompileCache();

    // ── Custom-chip preparation ─────────────────────────────────────────
    // Any custom-chip on the canvas is made "live" here so a single
    // Compile / Run is enough — no separate trip through the chip designer
    // or a manual ROM compile. For every custom-chip we:
    //   1. compile its C source to WASM (when it has none yet), and
    //   2. for programmable CPU chips, assemble/compile the program file it
    //      points at (larson.s, chaser.c, …) into ROM bytes.
    // Both artefacts are stashed on the chip component's `properties`;
    // CustomChipPart reads wasmBase64 + romBytes at simulation start.
    //
    // The chip program files are ALSO kept out of the Arduino sketch compile
    // below (see `chipProgramFiles`) — otherwise arduino-cli/avr-gcc would
    // try to build e.g. chaser.c and choke on SDCC-only syntax such as
    // `__at(0xC000)`, which is exactly what broke the Z80 examples.
    const componentsForCompile = useSimulatorStore.getState().components;
    const customChips = componentsForCompile.filter((c) => c.metadataId === 'custom-chip');
    const chipProgramFiles = new Set<string>();
    for (const chip of customChips) {
      const pf = String((chip.properties as any)?.programFile ?? '').trim();
      if (pf) chipProgramFiles.add(pf);
    }

    if (customChips.length > 0) {
      const boardFiles = activeBoard?.activeFileGroupId
        ? useEditorStore.getState().getGroupFiles(activeBoard.activeFileGroupId)
        : files;
      await prepareCustomChips(customChips, boardFiles);
    }
    // ── End custom-chip preparation ─────────────────────────────────────

    const kind = activeBoard?.boardKind;
    // The active board's console target, defined up front so EVERY board path
    // (Pi, MicroPython, arduino-cli, errors) groups its lines under one section.
    const boardLabel = activeBoard ? boardDisplayName(activeBoard) : 'Unknown';
    const boardTarget: CompileTarget | undefined = activeBoardId
      ? { id: activeBoardId, label: boardLabel, kind: 'board' }
      : undefined;
    const blog = (type: CompilationLog['type'], message: string) =>
      addLog({ timestamp: new Date(), type, message, target: boardTarget });

    // QEMU-Linux boards don't need arduino-cli compilation
    if (isPiBoardKind(kind)) {
      blog('info', `${boardLabel}: no compilation needed — run Python scripts directly.`);
      setMessage({ type: 'success', text: 'Ready (no compilation needed)' });
      setCompiling(false);
      return;
    }

    // MicroPython mode — no backend compilation needed
    if (activeBoard?.languageMode === 'micropython' && activeBoardId) {
      blog('info', 'MicroPython: loading firmware and user files...');
      try {
        const groupFiles = useEditorStore.getState().getGroupFiles(activeBoard.activeFileGroupId);
        const pyFiles = groupFiles.map((f) => ({ name: f.name, content: f.content }));
        await loadMicroPythonProgram(activeBoardId, pyFiles);
        blog('success', 'MicroPython firmware loaded successfully');
        setMessage({ type: 'success', text: 'MicroPython ready' });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to load MicroPython';
        blog('error', errMsg);
        setMessage({ type: 'error', text: errMsg });
      } finally {
        setCompiling(false);
      }
      return;
    }

    const fqbn = kind ? fqbnForLanguage(kind, activeBoard?.languageMode) : null;

    if (!fqbn) {
      blog('error', `No FQBN for board kind: ${kind}`);
      setMessage({ type: 'error', text: 'Unknown board' });
      setCompiling(false);
      return;
    }

    blog('info', `Starting compilation for ${boardLabel} (${fqbn})...`);

    // Board-less projects still compile (a sketch with no board on the canvas),
    // but there is no board id to key the progress card on. Null = no card,
    // which is the pre-existing behaviour for that case.
    const progressBoardId = activeBoardId ?? null;

    try {
      // Reconcile the two "active group" pointers before reading sources.
      // If the editor drifted to another BOARD's group (dangling pointer
      // after a board delete/add, a restore race), Monaco edits — and the
      // agent's write_file calls — land in a group this compile silently
      // ignores, shipping a stale same-named sketch.ino instead of the code
      // on screen. Re-point the editor at the group being compiled. Chip
      // program groups are legitimate cross-edits and stay untouched.
      const edGroup = useEditorStore.getState().activeGroupId;
      if (
        activeBoard?.activeFileGroupId &&
        edGroup !== activeBoard.activeFileGroupId &&
        !edGroup.startsWith('group-chip-')
      ) {
        blog(
          'warning',
          `Editor file group (${edGroup}) diverged from the compiled board group ` +
            `(${activeBoard.activeFileGroupId}) — switching the editor to the compiled group.`,
        );
        useEditorStore.getState().setActiveGroup(activeBoard.activeFileGroupId);
      }
      const groupFiles = activeBoard?.activeFileGroupId
        ? useEditorStore.getState().getGroupFiles(activeBoard.activeFileGroupId)
        : files;
      const sketchFiles = (groupFiles.length > 0 ? groupFiles : files)
        // Keep chip-program files (a chip's programFile, or .s/.asm/.hex/.bin)
        // out of the arduino-cli build — they're compiled to ROM above, not
        // Arduino sources, and avr-gcc chokes on e.g. SDCC's __at().
        .filter((f) => !chipProgramFiles.has(f.name) && !isChipProgramFile(f.name))
        .map((f) => ({
          name: f.name,
          content: f.content,
        }));

      // Progress card over the canvas: from here on the user can see the
      // build advance (and, when the server is busy, that it is queued rather
      // than stuck). Only the paths that actually reach the backend register —
      // MicroPython and the Pi boards returned above without a build.
      if (progressBoardId) compileProgress.begin(progressBoardId, boardLabel);

      // Stream live cmake + ninja output into the compilation console as
      // it arrives, instead of waiting for the whole build to finish.
      // Each poll the backend returns the cumulative stdout buffer; we
      // append only the delta since the previous call as 'info' lines.
      let lastStreamedLen = 0;
      const result = await compileCode(
        sketchFiles,
        fqbn,
        currentProject?.id ?? null,
        (info) => {
          const { stdout } = info;
          const grew = stdout.length > lastStreamedLen;
          const delta = grew ? stdout.slice(lastStreamedLen) : '';
          if (grew) lastStreamedLen = stdout.length;
          const newLines = delta
            .split('\n')
            .filter((s) => s.trim() && !isNoiseBuildLine(s));
          // The card shows the newest line under the bar, so it updates on
          // every poll — including the ones that brought no output at all,
          // which is exactly when the queue/stage fields matter most.
          if (progressBoardId) {
            compileProgress.update(progressBoardId, info, newLines[newLines.length - 1]);
          }
          if (!newLines.length) return;
          const now = new Date();
          setCompileLogs((prev: CompilationLog[]) => [
            ...prev,
            ...newLines.map((line) => ({
              timestamp: now,
              type: 'info' as const,
              message: line,
              target: boardTarget,
            })),
          ]);
        },
        // Per-board ESP32 build options + SPIFFS uploads + manifest +
        // language — one definition shared with the Flash dialog's
        // compile-before-flash (utils/boardCompile.ts).
        compileOptionsForBoard(activeBoard),
      );

      // After the build settles, append the structured analysis on top of
      // the live stream — parseCompileResult highlights FAILED blocks and
      // tags compiler errors with type='error', which the console uses for
      // colour + the auto-switch-to-errors filter. streamedLive tells it not
      // to reprint the stdout the stream (final 'done' flush included)
      // already showed.
      const resultLogs = parseCompileResult(result, boardLabel, boardTarget, lastStreamedLen > 0);
      setCompileLogs((prev: CompilationLog[]) => [...prev, ...resultLogs]);

      // Intellisense seam: hand the raw compiler text to the overlay so it
      // can paint file:line markers in the editor. Empty string clears the
      // markers after a successful build. No-op in OSS.
      publishCompileOutput(
        result.success ? '' : [result.stderr, result.error].filter(Boolean).join('\n'),
      );

      if (result.success) {
        const program = result.hex_content ?? result.binary_content ?? null;
        if (program && activeBoardId) {
          compileBoardProgram(activeBoardId, program, { uf2: result.uf2_content ?? null });
          if (result.has_wifi !== undefined) {
            updateBoard(activeBoardId, { hasWifi: result.has_wifi });
          }
          // P2.4 auto-migration: a green build reports the libraries it
          // really used; fold single-candidate ones into this board's
          // declared manifest so the NEXT compile runs scoped instead of
          // scan-all (the mode where unrelated libraries could leak in).
          const mergedLibs = mergeSuggestedLibraries(
            activeBoard?.libraries,
            result.manifest_suggested_libraries,
          );
          if (mergedLibs) {
            updateBoard(activeBoardId, { libraries: mergedLibs });
            console.log('[manifest] auto-declared from build:', mergedLibs);
          }
        }
        setMessage({ type: 'success', text: 'Compiled successfully' });
        markCompiled();
        setMissingLibHint(false);
        if (progressBoardId) compileProgress.finish(progressBoardId, 'success');
      } else {
        if (progressBoardId) compileProgress.finish(progressBoardId, 'error');
        const errText = result.error || result.stderr || 'Compile failed';
        setMessage({ type: 'error', text: errText });
        // Issue #208: drop the previous successful program from this
        // board so a subsequent Run cannot silently execute stale code
        // that doesn't match the editor any more. The Run button gates
        // on `!compiledProgram` and will refuse + force a re-compile.
        if (activeBoardId) {
          updateBoard(activeBoardId, { compiledProgram: null });
        }
        // Detect missing library errors — common patterns:
        // "No such file or directory" for #include, "fatal error: XXX.h"
        const looksLikeMissingLib =
          /No such file or directory|fatal error:.*\.h|library not found/i.test(errText);
        setMissingLibHint(looksLikeMissingLib);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Compile failed';
      blog('error', errMsg);
      setMessage({ type: 'error', text: errMsg });
      if (progressBoardId) compileProgress.finish(progressBoardId, 'error');
    } finally {
      setCompiling(false);
    }
  };

  // Track whether we should auto-run after compilation completes
  const autoRunAfterCompile = useRef(false);

  /**
   * Pre-flight safety check: solves the current circuit and flags shorts,
   * LED over-current and resistor over-power. Returns the result. When the
   * solver fails to converge (degenerate netlist, no power source, …) we
   * silently report a clean result so the user isn't blocked on circuits
   * that aren't physically meaningful yet.
   */
  const runVerification = useCallback(
    (): Promise<VerificationResult | null> => verifyCircuitFromStore(),
    [],
  );

  /**
   * Returns true if the caller should proceed inline. All findings are written
   * to the output console (red errors / orange warnings, "Circuit check"
   * group). If the verifier finds errors we also stash a resume callback in
   * `pendingRunRef` and pop the verification modal; the resume callback
   * re-enters `handleRun` with `skipVerify = true` so we don't loop.
   * Warnings-only results don't block — the console entry is enough.
   */
  const checkOrBlock = useCallback(
    async (resume: () => void): Promise<boolean> => {
      const result = await runVerification();
      if (!result) return true;
      if (result.errors.length === 0 && result.warnings.length === 0) return true;

      // Write every finding to the output console under "Circuit check" — red
      // for errors, orange for warnings — so there's one persistent, unified
      // diagnostics log next to the compiler output (Proteus-style). Replace
      // any prior circuit-check entries so repeated runs stay clean, and open
      // the console so the findings are visible.
      const now = new Date();
      setCompileLogs((prev) => [
        ...prev.filter((l) => l.target?.id !== CIRCUIT_CHECK_TARGET.id),
        ...result.errors.map((e) => ({
          timestamp: now,
          type: 'error' as const,
          message: e.message,
          target: CIRCUIT_CHECK_TARGET,
        })),
        ...result.warnings.map((w) => ({
          timestamp: now,
          type: 'warning' as const,
          message: w.message,
          target: CIRCUIT_CHECK_TARGET,
        })),
      ]);
      setConsoleOpen(true);

      // Warnings only — non-blocking; the console entry is enough, run continues.
      if (result.errors.length === 0) return true;

      // Errors → also pop the modal so the user makes an explicit Run-anyway /
      // Cancel decision; the console keeps the persistent red record.
      pendingRunRef.current = resume;
      setVerification(result);
      return false;
    },
    [runVerification, setCompileLogs, setConsoleOpen],
  );

  const handleRun = async (skipVerify = false) => {
    console.log('[handleRun] click', { activeBoardId, running, codeChangedSinceLastCompile });

    // Pro gate, first thing: a run the gate refuses must not compile first.
    // STM32 builds on the server, and the refusal used to arrive only from
    // startBoard's backstop AFTER the build — an anonymous or trial-exhausted
    // user waited for arduino-cli just to be told no. Same verdict as the
    // backstop (which stays, for the paths that do not come through here).
    if (activeBoardId && !running) {
      const gated = boards.find((b) => b.id === activeBoardId);
      if (gated && blockedByBoardGate(gated.boardKind, 'run')) return;
    }

    // Pre-flight: solve the circuit and check for shorts / overcurrent /
    // overpower. If anything trips we hand control to the modal, which
    // resumes by calling `handleRun(true)` for "Run anyway".
    if (!skipVerify) {
      // The verification solve can take a second or two (cold ngspice worker).
      // Show the Run-button spinner and ignore re-clicks while it runs — the
      // button otherwise looks idle and gets clicked repeatedly, stacking
      // multiple verifications.
      if (runInFlightRef.current) return;
      runInFlightRef.current = true;
      setVerifying(true);
      let ok = false;
      try {
        ok = await checkOrBlock(() => handleRun(true));
      } finally {
        setVerifying(false);
        runInFlightRef.current = false;
      }
      if (!ok) return;
    }

    // Board-less circuits have no MCU to start. If there are custom-chip CPUs
    // on the canvas, compile them (WASM + ROM) and re-attach so they pick up
    // the fresh WASM — MCU Maker runs custom chips with no Arduino/ESP32 board,
    // as a general-purpose electronics simulator. Then resume the electrical
    // solver (replays any switch toggles captured while paused).
    if (isBoardless) {
      const customChips = useSimulatorStore
        .getState()
        .components.filter((c) => c.metadataId === 'custom-chip');
      if (customChips.length > 0) {
        setCompiling(true);
        setConsoleOpen(true);
        // Fresh chip output, but keep the circuit pre-flight findings just
        // logged by checkOrBlock so they survive a "Run anyway".
        setCompileLogs((prev) => prev.filter((l) => l.target?.id === CIRCUIT_CHECK_TARGET.id));
        try {
          await prepareCustomChips(customChips, files);
        } catch (e) {
          addLog({
            timestamp: new Date(),
            type: 'error',
            message: e instanceof Error ? e.message : String(e),
          });
        }
        setCompiling(false);
        // Force the chip parts to re-attach with their freshly compiled WASM.
        useSimulatorStore.getState().restartParts();
      }
      setElectricalPaused(false);
      setMessage(null);
      return;
    }

    if (activeBoardId) {
      const board = boards.find((b) => b.id === activeBoardId);
      console.log('[handleRun] active board', {
        id: board?.id,
        kind: board?.boardKind,
        hasCompiledProgram: !!board?.compiledProgram,
        compiledProgramLen: board?.compiledProgram?.length ?? 0,
      });

      // MicroPython mode: stop any running session first, then reload firmware + start
      if (board?.languageMode === 'micropython') {
        trackRunSimulation(board.boardKind);
        reportRun(board.boardKind);

        // Always stop the current session so the new run gets a clean QEMU boot.
        // This also prevents the double start_esp32 that occurs when the bridge
        // is already connected and startBoard() is called again.
        if (board.running) {
          stopBoard(activeBoardId);
          // Give the WebSocket a moment to close cleanly before reconnecting.
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        setCompiling(true);
        setMessage(null);
        const mpyTarget: CompileTarget = {
          id: activeBoardId,
          label: boardDisplayName(board),
          kind: 'board',
        };
        const mlog = (type: CompilationLog['type'], message: string) =>
          addLog({ timestamp: new Date(), type, message, target: mpyTarget });
        mlog('info', 'MicroPython: loading firmware and user files...');
        try {
          const groupFiles = useEditorStore.getState().getGroupFiles(board.activeFileGroupId);
          const pyFiles = groupFiles.map((f) => ({ name: f.name, content: f.content }));
          await loadMicroPythonProgram(activeBoardId, pyFiles);
          mlog('success', 'MicroPython firmware loaded');
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Failed to load MicroPython';
          mlog('error', errMsg);
          setMessage({ type: 'error', text: errMsg });
          setCompiling(false);
          return;
        }
        setCompiling(false);
        startBoard(activeBoardId);
        setMessage(null);
        return;
      }

      const isQemuBoard = isQemuBoardKind(board?.boardKind);

      // QEMU boards: auto-compile if no firmware available yet
      if (isQemuBoard) {
        console.log('[handleRun] QEMU path');
        // QEMU-Linux boards (Raspberry Pi family + overlay piFamily kinds)
        // boot straight from the rootfs — there is no firmware to compile,
        // and handleCompile's Pi early-return never sets compiledProgram, so
        // the gate below would surface a bogus "Compilation produced no
        // firmware" error. Power the board on directly (Run follows the
        // standard disabled-while-running convention; RESET is the fast
        // re-run-without-reboot on a booted guest). Must stay ABOVE the
        // generic stop-then-boot restart below.
        if (isPiBoardKind(board?.boardKind ?? '')) {
          trackRunSimulation(board?.boardKind);
          reportRun(
            board?.boardKind,
            decideEngine(activeBoardId, board?.enginePinned).engine,
          );
          if (board?.running) {
            // Zombie/edge case (Run is normally disabled while running):
            // power-cycle for a clean boot.
            stopBoard(activeBoardId);
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
          console.log('[handleRun] → startBoard (QEMU-Linux, no firmware)', activeBoardId);
          startBoard(activeBoardId);
          setMessage(null);
          return;
        }
        // Pre-simulation clean reset:
        // Automatically execute a reset before starting to ensure no zombie sockets,
        // lingering workers, or stale GPIO/serial states interfere with the new session.
        const esp32Bridge = getEsp32Bridge(activeBoardId);
        const stm32Bridge = getStm32Bridge(activeBoardId);
        const hasLingeringSocket = Boolean(
          esp32Bridge?.connected || esp32Bridge?.socket ||
          stm32Bridge?.connected || stm32Bridge?.socket
        );

        if (board?.running || hasLingeringSocket) {
          console.log('[handleRun] Pre-simulation reset: stopping previous session & disconnecting bridge');
          stopBoard(activeBoardId);
          esp32Bridge?.disconnect();
          stm32Bridge?.disconnect();
          await new Promise((resolve) => setTimeout(resolve, 350));
        }

        clearBoardSerialOutput(activeBoardId);
        getBoardPinManager(activeBoardId)?.hardResetPinStates();

        // Si ya hay firmware previo válido y el código no ha cambiado, iniciar la simulación de inmediato
        const hasValidFirmware = Boolean(board?.compiledProgram);
        const codeChanged = useEditorStore.getState().codeChangedSinceLastCompile;

        if (hasValidFirmware && !codeChanged) {
          console.log('[handleRun] Firmware previo válido encontrado -> iniciando simulación directamente');
          trackRunSimulation(board?.boardKind);
          reportRun(board?.boardKind);
          startBoard(activeBoardId);
          setMessage(null);
          return;
        }

        console.log('[handleRun] No hay firmware previo o el código cambió -> compilar y ejecutar');
        autoRunAfterCompile.current = true;
        await handleCompile();
        const updatedBoard = useSimulatorStore
          .getState()
          .boards.find((b) => b.id === activeBoardId);
        console.log('[handleRun] after compile', {
          hasCompiledProgram: !!updatedBoard?.compiledProgram,
          compiledProgramLen: updatedBoard?.compiledProgram?.length ?? 0,
          autoRunFlag: autoRunAfterCompile.current,
        });
        if (autoRunAfterCompile.current) {
          autoRunAfterCompile.current = false;
          if (updatedBoard?.compiledProgram) {
            trackRunSimulation(updatedBoard.boardKind);
            reportRun(updatedBoard.boardKind);
            console.log('[handleRun] → startBoard tras compilar', activeBoardId);
            startBoard(activeBoardId);
            setMessage(null);
          } else {
            // handleCompile returned without producing a firmware/program.
            const isMicropython = updatedBoard?.languageMode === 'micropython';
            const errText = isMicropython
              ? 'MicroPython firmware did not load. Click "Load MicroPython" to retry, or check the console for the underlying error.'
              : 'Compilation produced no firmware. Check the output console for the underlying error.';
            console.warn('[handleRun] compile finished but no compiledProgram — not starting');
            setMessage({ type: 'error', text: errText });
            addLog({ timestamp: new Date(), type: 'error', message: errText });
          }
        }
        return;
      }

      // Non-QEMU boards (Arduino AVR, RP2040, etc.)
      if (board?.running) {
        stopBoard(activeBoardId);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      clearBoardSerialOutput(activeBoardId);
      getBoardPinManager(activeBoardId)?.hardResetPinStates();

      const hasValidProgram = Boolean(board?.compiledProgram);
      const codeChanged = useEditorStore.getState().codeChangedSinceLastCompile;

      if (hasValidProgram && !codeChanged) {
        console.log('[handleRun] Programa previo válido encontrado -> iniciando simulación directamente');
        trackRunSimulation(board?.boardKind);
        reportRun(board?.boardKind);
        startBoard(activeBoardId);
        setMessage(null);
        return;
      }

      autoRunAfterCompile.current = true;
      await handleCompile();
      // After compile, check if it succeeded and run
      const updatedBoard = useSimulatorStore
        .getState()
        .boards.find((b) => b.id === activeBoardId);
      if (autoRunAfterCompile.current && updatedBoard?.compiledProgram) {
        autoRunAfterCompile.current = false;
        trackRunSimulation(updatedBoard.boardKind);
        reportRun(updatedBoard.boardKind);
        startBoard(activeBoardId);
        setMessage(null);
      } else {
        autoRunAfterCompile.current = false;
      }
      return;
    }

    // Legacy fallback
    const hex = useSimulatorStore.getState().compiledHex;
    const codeChanged = useEditorStore.getState().codeChangedSinceLastCompile;
    if (hex && !codeChanged) {
      trackRunSimulation();
      reportRun(undefined);
      startSimulation();
      setMessage(null);
      return;
    }

    autoRunAfterCompile.current = true;
    await handleCompile();
    const newHex = useSimulatorStore.getState().compiledHex;
    if (autoRunAfterCompile.current && newHex) {
      autoRunAfterCompile.current = false;
      trackRunSimulation();
      reportRun(undefined);
      startSimulation();
      setMessage(null);
    } else {
      autoRunAfterCompile.current = false;
    }
  };

  const handleStop = () => {
    trackStopSimulation();
    if (isBoardless) {
      // Freeze the chip tick (the paused flag) AND clear the chip's output
      // drives so its LEDs go dark on Stop — not frozen at their last frame.
      setElectricalPaused(true);
      clearAllChipDrives();
      setMessage(null);
      return;
    }
    // Stop EVERY running board — Run-All can start several, and leaving any
    // running keeps chips ticking (their gate is boards.some(running)).
    const runningBoards = useSimulatorStore.getState().boards.filter((b) => b.running);
    if (runningBoards.length > 0) runningBoards.forEach((b) => stopBoard(b.id));
    else if (activeBoardId) stopBoard(activeBoardId);
    else stopSimulation();
    // A chip wired to a board drives its LEDs via its own SPICE sources, which
    // stopBoard doesn't touch — clear them so those LEDs also go dark.
    clearAllChipDrives();
    setMessage(null);
  };

  const handleReset = () => {
    trackResetSimulation();
    // QEMU-Linux boards: Reset = re-upload the edited files and re-run the
    // script on the live guest (no ~45 s reboot). Mirrors what Reset means
    // elsewhere — restart the program — while Run keeps the standard
    // disabled-while-running behaviour.
    if (activeBoard && isPiBoardKind(activeBoard.boardKind) && activeBoard.piBooted) {
      void piRerunScript(activeBoard.id, activeBoard.boardKind);
      setMessage(null);
      return;
    }
    if (activeBoardId) resetBoard(activeBoardId);
    else resetSimulation();
    setMessage(null);
  };

  /**
   * Compile every board on the canvas sequentially. Progress + per-board
   * results stream to the existing compilation console — no separate dialog.
   * Returns the count of boards that ended up with a runnable program (so
   * Run All can use it to decide whether to proceed to start them).
   */
  const compileAllBoards = async (): Promise<{ ok: number; failed: number }> => {
    const boardsList = useSimulatorStore.getState().boards;
    // Every custom-chip is a target too — Compile-All / Run-All build chips
    // (WASM + ROM) alongside boards, so the flow works for a board + chip, for
    // several chips with no board, etc.
    const allCustomChips = useSimulatorStore
      .getState()
      .components.filter((c) => c.metadataId === 'custom-chip');
    if (boardsList.length === 0 && allCustomChips.length === 0) return { ok: 0, failed: 0 };

    setCompileAllRunning(true);
    setConsoleOpen(true);
    const targetSummary = [
      boardsList.length ? `${boardsList.length} board${boardsList.length === 1 ? '' : 's'}` : '',
      allCustomChips.length ? `${allCustomChips.length} chip${allCustomChips.length === 1 ? '' : 's'}` : '',
    ]
      .filter(Boolean)
      .join(' + ');
    addLog({
      timestamp: new Date(),
      type: 'info',
      message: `Compiling all targets (${targetSummary})...`,
    });

    // Make every custom-chip live (WASM + ROM) before compiling the boards,
    // mirroring the single-board Compile path, and collect their program file
    // names so they stay out of the arduino-cli builds below.
    const chipProgramFiles = new Set<string>();
    for (const chip of allCustomChips) {
      const pf = String((chip.properties as any)?.programFile ?? '').trim();
      if (pf) chipProgramFiles.add(pf);
    }
    let chipFailed = 0;
    if (allCustomChips.length > 0) {
      const everyFile = boardsList.flatMap((b) =>
        useEditorStore.getState().getGroupFiles(b.activeFileGroupId),
      );
      chipFailed = (await prepareCustomChips(allCustomChips, everyFile)).failed;
    }

    let ok = 0;
    let boardFailed = 0;

    // One progress card for the whole run, relabelled per board — the builds
    // are sequential, so "board 2 of 3" is the honest headline and the elapsed
    // time should be the run's, not the current board's.
    //
    // The denominator counts boards that will REALLY reach the backend: Pi and
    // MicroPython boards are handled locally, and a board with no FQBN is
    // skipped before it ever compiles, so counting either left the label
    // stuck at "(2/3)" for a run that only ever built two.
    const compilableCount = boardsList.filter(
      (b) =>
        !isPiBoardKind(b.boardKind) &&
        b.languageMode !== 'micropython' &&
        !!fqbnForLanguage(b.boardKind, b.languageMode),
    ).length;
    let compiledIndex = 0;

    void clearCompileCache();

    for (const board of boardsList) {
      if (!isPiBoardKind(board.boardKind) && board.languageMode !== 'micropython') {
        updateBoard(board.id, { compiledProgram: null });
        getEsp32Bridge(board.id)?.clearFirmware();
      }
      const label = boardDisplayName(board);
      // Stamp this board's lines so the console groups them under its section.
      const boardTarget: CompileTarget = { id: board.id, label, kind: 'board' };
      const blog = (type: CompilationLog['type'], message: string) =>
        addLog({ timestamp: new Date(), type, message, target: boardTarget });

      if (isPiBoardKind(board.boardKind)) {
        blog('info', 'skipped (no compilation needed)');
        ok++;
        continue;
      }

      // MicroPython boards never go through the C++ toolchain — mirror the
      // single-Run branch and load the firmware + user files instead. Without
      // this, fqbnForLanguage falls back to the Arduino FQBN and the board's
      // main.py is compiled as sketch.ino.cpp (issue #269).
      if (board.languageMode === 'micropython') {
        blog('info', 'MicroPython: loading firmware and user files...');
        try {
          const groupFiles = useEditorStore.getState().getGroupFiles(board.activeFileGroupId);
          const pyFiles = groupFiles.map((f) => ({ name: f.name, content: f.content }));
          await loadMicroPythonProgram(board.id, pyFiles);
          blog('success', 'MicroPython firmware loaded successfully');
          ok++;
        } catch (err) {
          blog('error', err instanceof Error ? err.message : 'Failed to load MicroPython');
          boardFailed++;
        }
        continue;
      }

      const fqbn = fqbnForLanguage(board.boardKind, board.languageMode);
      if (!fqbn) {
        blog('error', 'no FQBN configured');
        boardFailed++;
        continue;
      }

      blog('info', 'compiling...');

      compiledIndex++;
      const cardLabel =
        compilableCount > 1 ? `${label} (${compiledIndex}/${compilableCount})` : label;
      // Raise the card at the FIRST real compile, not before the loop: any
      // MicroPython / Pi boards ahead of it are handled locally, and starting
      // the card early made it claim "Waiting for a build slot" while nothing
      // had been submitted to the server at all.
      if (compiledIndex === 1) {
        compileProgress.begin(MULTI_BOARD_PROGRESS_ID, cardLabel);
      } else {
        compileProgress.relabel(MULTI_BOARD_PROGRESS_ID, cardLabel);
      }

      try {
        const groupFiles = useEditorStore.getState().getGroupFiles(board.activeFileGroupId);
        const sketchFiles = groupFiles
          .filter((f) => !chipProgramFiles.has(f.name) && !isChipProgramFile(f.name))
          .map((f) => ({ name: f.name, content: f.content }));

        // Stream live cmake + ninja output per-board (Compile-All flow).
        let lastStreamedLen = 0;
        const result = await compileCode(
          sketchFiles,
          fqbn,
          currentProject?.id ?? null,
          (info) => {
            const { stdout } = info;
            const grew = stdout.length > lastStreamedLen;
            const delta = grew ? stdout.slice(lastStreamedLen) : '';
            if (grew) lastStreamedLen = stdout.length;
            const newLines = delta
            .split('\n')
            .filter((s) => s.trim() && !isNoiseBuildLine(s));
            compileProgress.update(
              MULTI_BOARD_PROGRESS_ID, info, newLines[newLines.length - 1],
            );
            if (!newLines.length) return;
            const now = new Date();
            setCompileLogs((prev: CompilationLog[]) => [
              ...prev,
              // No `${label}: ` prefix — the target section header carries it.
              ...newLines.map((line) => ({
                timestamp: now,
                type: 'info' as const,
                message: line,
                target: boardTarget,
              })),
            ]);
          },
          { boardOptions: board.boardOptions, spiffsFiles: board.spiffsFiles, boardKind: board.boardKind, exampleId: useProjectStore.getState().currentExampleId, libraries: board.libraries, language: board.languageMode === 'espidf' ? 'espidf' : undefined },
        );

        const resultLogs = parseCompileResult(result, label, boardTarget, lastStreamedLen > 0);
        setCompileLogs((prev: CompilationLog[]) => [...prev, ...resultLogs]);

        if (result.success) {
          const program = result.hex_content ?? result.binary_content ?? null;
          if (program) {
            compileBoardProgram(board.id, program, { uf2: result.uf2_content ?? null });
            if (result.has_wifi !== undefined) {
              updateBoard(board.id, { hasWifi: result.has_wifi });
            }
          }
          ok++;
        } else {
          boardFailed++;
        }
      } catch (err) {
        blog('error', err instanceof Error ? err.message : String(err));
        boardFailed++;
      }
    }

    if (compiledIndex > 0) {
      compileProgress.finish(
        MULTI_BOARD_PROGRESS_ID, boardFailed > 0 ? 'error' : 'success',
      );
    }

    const failed = boardFailed + chipFailed;
    const chipOk = allCustomChips.length - chipFailed;
    const doneParts = [];
    if (boardsList.length)
      doneParts.push(`${ok} board${ok === 1 ? '' : 's'} ok${boardFailed > 0 ? `, ${boardFailed} failed` : ''}`);
    if (allCustomChips.length)
      doneParts.push(`${chipOk} chip${chipOk === 1 ? '' : 's'} ok${chipFailed > 0 ? `, ${chipFailed} failed` : ''}`);
    addLog({
      timestamp: new Date(),
      type: failed > 0 ? 'error' : 'success',
      message: `Done — ${doneParts.join('; ')}`,
    });
    if (failed === 0) markCompiled();
    setCompileAllRunning(false);
    return { ok, failed };
  };

  const handleCompileAll = () => {
    trackCompileCode();
    void compileAllBoards();
  };

  /**
   * Run All = compile every target (boards + chips) if needed, then start every
   * one: boards via startBoard, chips via restartParts (re-attach with the
   * fresh WASM/ROM) + resuming the electrical solver when there's no board.
   * Mirrors single Run, generalised across all targets.
   */
  const handleRunAll = async (skipVerify = false) => {
    const sim = useSimulatorStore.getState();
    const boardsList = sim.boards;
    const chips = sim.components.filter((c) => c.metadataId === 'custom-chip');
    if (boardsList.length === 0 && chips.length === 0) return;

    // Same gate-before-compile rule as handleRun, for every board that is
    // about to start. One prompt is enough: the first refused board fires it.
    for (const b of boardsList) {
      if (!b.running && blockedByBoardGate(b.boardKind, 'run')) return;
    }

    // Same pre-flight safety check as handleRun — block on shorts / overcurrent
    // before starting every board, with a "Run anyway" escape.
    if (!skipVerify) {
      const ok = await checkOrBlock(() => handleRunAll(true));
      if (!ok) return;
    }

    // Detener placas en ejecución
    for (const b of boardsList) {
      if (b.running) stopBoard(b.id);
    }

    const codeChanged = useEditorStore.getState().codeChangedSinceLastCompile;
    const hasCompilableTargets =
      chips.some((c) => !(c.properties as any)?.wasmBase64 || codeChanged) ||
      boardsList.some(
        (b) =>
          !isPiBoardKind(b.boardKind) &&
          b.languageMode !== 'micropython' &&
          (!b.compiledProgram || codeChanged),
      );

    if (hasCompilableTargets) {
      const { failed } = await compileAllBoards();
      if (failed > 0) return; // a board failed — don't start anything
    }

    // Start every board (compiledProgram may have changed during compile).
    const refreshed = useSimulatorStore.getState().boards;
    for (const board of refreshed) {
      if (board.running) continue;
      if (isQemuBoardKind(board.boardKind) || board.compiledProgram || board.languageMode === 'micropython') {
        // MicroPython boards get their firmware + project (re)loaded before
        // every start, exactly like single Run does: the pending-program slot
        // is consumed by each boot, so a re-run that skipped compileAllBoards
        // (nothing changed) would otherwise boot into a bare REPL. The load
        // is a setter, so doing it again right after compile-all is harmless.
        if (board.languageMode === 'micropython') {
          const groupFiles = useEditorStore.getState().getGroupFiles(board.activeFileGroupId);
          const pyFiles = groupFiles.map((f) => ({ name: f.name, content: f.content }));
          await loadMicroPythonProgram(board.id, pyFiles);
        }
        trackRunSimulation(board.boardKind);
        reportRun(board.boardKind);
        startBoard(board.id);
      }
    }

    // Run the chips: re-attach so they pick up the freshly compiled WASM/ROM.
    // The chip tick gates on a running board, so when NO board actually started
    // (board-less, or a board that compiled to nothing) resume the electrical
    // solver instead, otherwise the chips would stay frozen.
    if (chips.length > 0) {
      useSimulatorStore.getState().restartParts();
      const anyBoardRunning = useSimulatorStore.getState().boards.some((b) => b.running);
      if (!anyBoardRunning) setElectricalPaused(false);
    }
  };

  /** Export the workspace as a portable .vlx — the lossless format, unlike
   *  the Wokwi .zip below which stores ONE board and drops the other boards'
   *  wires. It was reachable only from the OSS save button (which the pro
   *  overlay replaces with the server save modal) and from the desktop menu,
   *  so on mcumaker.dev a .vlx could be imported but never produced. */
  const handleExportVlx = () => {
    try {
      // Chip files sync on a 300 ms debounce; without this a chip.c edited
      // seconds ago would export against stale properties.
      flushChipFileSync();
      const proj = useProjectStore.getState().currentProject;
      const name =
        proj?.slug ??
        files.find((f) => f.name.endsWith('.ino'))?.name.replace('.ino', '') ??
        undefined;
      const filename = triggerDownloadVlx({ name });
      setMessage({ type: 'success', text: `Exported ${filename}` });
    } catch (err) {
      setMessage({
        type: 'error',
        text: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const handleExport = async () => {
    try {
      const { components, wires, boards, activeBoardId, boardPosition, boardType } =
        useSimulatorStore.getState();
      // The board itself, not the flat legacy mirror. `boardType` only tracks
      // the active board through setActiveBoardId/setBoardType, so a project
      // hydrated straight into `boards` leaves it stale — and it reports every
      // Raspberry Pi as an 'arduino-uno' on purpose (see setActiveBoardId).
      // Exporting from it wrote the wrong board into the file; taking the kind
      // and the canvas id off one object means they cannot disagree (#268).
      const board = boards.find((b) => b.id === activeBoardId) ?? boards[0];
      const projectName =
        files.find((f) => f.name.endsWith('.ino'))?.name.replace('.ino', '') || 'mcu-maker-project';
      // The other boards cannot travel: the format stores one. Their wires are
      // left out rather than written against this board's part id, which used
      // to re-attach their components to this chip on import — same pins, wrong
      // board, nothing said (#268 review).
      const foreignBoardIds = boards.filter((b) => b.id !== board?.id).map((b) => b.id);
      const foreign = new Set(foreignBoardIds);
      const strandedWires = wires.filter(
        (w) => foreign.has(w.start.componentId) || foreign.has(w.end.componentId),
      ).length;
      await exportToWokwiZip(
        files,
        components,
        wires,
        board?.boardKind ?? boardType,
        projectName,
        board ? { x: board.x, y: board.y } : boardPosition,
        board?.id,
        board?.libraries ?? [],
        foreignBoardIds,
      );
      if (foreignBoardIds.length > 0) {
        setMessage({
          type: 'error',
          text:
            `Exported the ${boardDisplayName(board!)} only — a .zip holds one board, so the ` +
            `other ${foreignBoardIds.length === 1 ? 'board' : `${foreignBoardIds.length} boards`}` +
            `${strandedWires > 0 ? ` and ${strandedWires} wire${strandedWires === 1 ? '' : 's'}` : ''}` +
            ` did not travel. Save as .vlx to keep the whole project.`,
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Export failed.' });
    }
  };

  // Phase 3 D3.2 — Schematic screenshot. Pro-tier-gated by the backend.
  // Same UX pattern as BOM export: everyone can click; 402 redirects to
  // /pricing. The server-side headless chromium renders the canvas and
  // returns a PNG, which we trigger a download for.
  const handleExportScreenshot = async () => {
    const projectId = currentProject?.id;
    if (!projectId) {
      setMessage({ type: 'error', text: 'Save the project before exporting an image.' });
      return;
    }
    setMessage({ type: 'info', text: 'Rendering screenshot — may take 5-10 seconds…' });
    try {
      // The render happens in a headless browser on the server, which has
      // no localStorage and therefore no idea which theme the user is
      // looking at -- it used to hand back a dark image to someone working
      // in light mode. Pass the RESOLVED theme so the export matches the
      // canvas it was taken from.
      const resp = await fetch(
        `/api/pro/projects/${projectId}/screenshot.png?theme=${getResolvedTheme()}`,
        { credentials: 'include' },
      );
      if (resp.status === 402) {
        // Fire the in-place upgrade modal instead of bouncing to /pricing —
        // keeps the user in the editor with full context. The pro overlay's
        // UpgradeGate listens for this event and opens UpgradePromptModal.
        window.dispatchEvent(new CustomEvent('mcu-maker-pro-upgrade-prompt', {
          detail: { componentName: 'Schematic screenshot export' },
        }));
        return;
      }
      if (resp.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (resp.status === 422) {
        setMessage({ type: 'error', text: 'Add at least one component to export an image.' });
        return;
      }
      if (!resp.ok) {
        setMessage({ type: 'error', text: 'Screenshot export failed.' });
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = /filename="?([^"]+)"?/.exec(cd);
      a.download = m ? m[1] : `mcu-maker-${projectId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Screenshot downloaded.' });
    } catch {
      setMessage({ type: 'error', text: 'Screenshot export failed.' });
    }
  };

  // Phase 3 D3.1 — BOM export. Pro-tier-gated by the backend (402 if not pro).
  // We let everyone click; the 402 response feeds the upgrade prompt below
  // so free/maker users hit the funnel naturally instead of an obviously-
  // locked button (which they'd just dismiss).
  const handleExportBom = async () => {
    const projectId = currentProject?.id;
    if (!projectId) {
      setMessage({ type: 'error', text: 'Save the project before exporting a BOM.' });
      return;
    }
    try {
      const resp = await fetch(`/api/pro/projects/${projectId}/bom.csv`, {
        credentials: 'include',
      });
      if (resp.status === 402) {
        // Fire the in-place upgrade modal instead of bouncing to /pricing —
        // keeps the user in the editor with full context. The pro overlay's
        // UpgradeGate listens for this event and opens UpgradePromptModal.
        window.dispatchEvent(new CustomEvent('mcu-maker-pro-upgrade-prompt', {
          detail: { componentName: 'BOM export' },
        }));
        return;
      }
      if (resp.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (!resp.ok) {
        setMessage({ type: 'error', text: 'BOM export failed.' });
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename comes from Content-Disposition; pick a fallback.
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = /filename="?([^"]+)"?/.exec(cd);
      a.download = m ? m[1] : `bom-${projectId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ type: 'error', text: 'BOM export failed.' });
    }
  };

  const handleFirmwareUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (firmwareInputRef.current) firmwareInputRef.current.value = '';
    if (!file) return;

    setConsoleOpen(true);
    addLog({ timestamp: new Date(), type: 'info', message: `Loading firmware: ${file.name}...` });

    try {
      const boardKind = activeBoard?.boardKind;
      if (!boardKind) {
        setMessage({ type: 'error', text: 'No board selected' });
        return;
      }

      const result = await readFirmwareFile(file, boardKind);

      // Architecture mismatch warning for ELF files
      if (result.elfInfo?.suggestedBoard && result.elfInfo.suggestedBoard !== boardKind) {
        const detected = result.elfInfo.architectureName;
        const current = activeBoard ? boardDisplayName(activeBoard) : boardKind;
        addLog({
          timestamp: new Date(),
          type: 'info',
          message: `Note: Detected ${detected} architecture, but current board is ${current}. Loading anyway.`,
        });
      }

      // A binary built elsewhere never passed through our compiler, so its
      // WiFi SSID was never rewritten for the emulator — and the emulated
      // radio only ever broadcasts EMULATED_WIFI_SSIDS. The firmware boots
      // and runs perfectly and then sits there failing to associate, which
      // reads as "the emulator is broken" (issue #270). Say it once, here,
      // and only when the binary actually looks like it wants WiFi and names
      // none of the networks it could reach.
      const note = await wifiSsidNoteFor(file);
      if (note) addLog({ timestamp: new Date(), type: 'info', message: note });

      if (activeBoardId) {
        compileBoardProgram(activeBoardId, result.program);
        markCompiled();
        addLog({ timestamp: new Date(), type: 'info', message: result.message });
        setMessage({ type: 'success', text: `Firmware loaded: ${file.name}` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to load firmware';
      addLog({ timestamp: new Date(), type: 'error', message: errMsg });
      setMessage({ type: 'error', text: errMsg });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!importInputRef.current) return;
    importInputRef.current.value = '';
    if (!file) return;
    try {
      const result = await importProjectFile(file);
      if (result.kind === 'vlx') {
        // importVlxFile already wrote into the stores.
        setMessage({ type: 'success', text: `Imported ${file.name}` });
        return;
      }
      // .zip path: apply the parsed payload to the stores ourselves, then
      // surface any missing libraries via the existing install modal.
      const { loadFiles } = useEditorStore.getState();
      const { setComponents, setWires, setBoardType, setBoardPosition, stopSimulation } =
        useSimulatorStore.getState();
      stopSimulation();
      // A board kind this build does not know is left alone rather than
      // coerced. The importer no longer answers 'arduino-uno' for everything
      // it fails to recognise (#268), so say what happened instead of swapping
      // the user's board for one the file never mentioned.
      const importWarnings = [...result.warnings];
      // Put the board on the canvas. `setBoardType` re-kinds the ACTIVE board,
      // so on an empty canvas it changed nothing and the project arrived with
      // its circuit and no chip — the reporter's "the board isn't recognized"
      // (#268). Adding one when there is none is the other half of the fix.
      let boardId: string | null = null;
      if (result.boardType && isKnownBoardKind(result.boardType)) {
        const sim = useSimulatorStore.getState();
        const current =
          sim.boards.find((b) => b.id === sim.activeBoardId) ?? sim.boards[0] ?? null;
        if (current) {
          setBoardType(result.boardType);
          boardId = current.id;
        } else {
          boardId = sim.addBoard(
            result.boardType,
            result.boardPosition.x,
            result.boardPosition.y,
          );
          // addBoard promotes the first board to active but does not sync the
          // flat legacy fields; setActiveBoardId is where that happens, and
          // whatever still reads `boardType` would otherwise see the board
          // this import just replaced.
          useSimulatorStore.getState().setActiveBoardId(boardId);
        }
      } else if (result.boardType) {
        // Nothing to swap the board for, so the circuit lands on whatever is
        // already there — and its wires have to be told, or the message would
        // be describing something that did not happen.
        const sim = useSimulatorStore.getState();
        boardId = (sim.boards.find((b) => b.id === sim.activeBoardId) ?? sim.boards[0])?.id ?? null;
        importWarnings.push(
          boardId
            ? `This project is for a "${result.boardType}" board, which this build does not have. The circuit was imported onto the current board.`
            : `This project is for a "${result.boardType}" board, which this build does not have, and there is no board on the canvas to put the circuit on.`,
        );
      }
      setBoardPosition(result.boardPosition);
      setComponents(result.components);
      // The wires name the board by its kind; the board on the canvas may
      // answer to something else.
      setWires(
        boardId && result.boardType
          ? retargetBoardWires(result.wires, result.boardType, boardId)
          : result.wires,
      );
      if (result.files.length > 0) loadFiles(result.files);
      setMessage(
        importWarnings.length > 0
          ? { type: 'error', text: `Imported ${file.name} — ${importWarnings.join(' ')}` }
          : { type: 'success', text: `Imported ${file.name}` },
      );
      if (result.libraries.length > 0) {
        setPendingLibraries(result.libraries);
        setInstallModalOpen(true);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Import failed.' });
    }
  };

    // File-menu commands owned by this toolbar (the handlers close over its
  // state). Registered through a latest-ref so the one-time registration
  // always invokes the current render's closure, never a stale one.
  const makeMenuCommands = () => ({
    import: () => importInputRef.current?.click(),
    export: () => void handleExport(),
    exportVlx: () => handleExportVlx(),
    bom: () => void handleExportBom(),
    screenshot: () => void handleExportScreenshot(),
    firmware: () => firmwareInputRef.current?.click(),
    // Pro actions fire the same window events the old "..." menu items
    // fired; without the overlay they are silent no-ops, which is fine —
    // OSS builds cannot have linked repos or shared projects anyway.
    share: () =>
      window.dispatchEvent(new CustomEvent('mcu-maker-pro-share-prompt', {
        detail: { projectId: currentProject?.id ?? null },
      })),
    githubSync: () =>
      window.dispatchEvent(new CustomEvent('mcu-maker-pro-github-sync-prompt', {
        detail: { projectId: currentProject?.id ?? null },
      })),
    record: () =>
      window.dispatchEvent(new CustomEvent('mcu-maker-pro-replay-record-toggle', {
        detail: { projectId: currentProject?.id ?? null },
      })),
    compile: () => void handleCompile(),
    run: () => void handleRun(),
    stop: () => handleStop(),
    resetBoard: () => handleReset(),
    toggleConsole: () => setConsoleOpen((v) => !v),
  });
  const menuCommandsRef = useRef(makeMenuCommands());
  menuCommandsRef.current = makeMenuCommands();
  useEffect(() => {
    const offs = [
      registerEditorCommand('project.import', () => menuCommandsRef.current.import()),
      registerEditorCommand('project.export', () => menuCommandsRef.current.export()),
      registerEditorCommand('project.exportVlx', () => menuCommandsRef.current.exportVlx()),
      registerEditorCommand('project.exportBom', () => menuCommandsRef.current.bom()),
      registerEditorCommand('project.exportScreenshot', () => menuCommandsRef.current.screenshot()),
      registerEditorCommand('firmware.upload', () => menuCommandsRef.current.firmware()),
      registerEditorCommand('project.share', () => menuCommandsRef.current.share()),
      registerEditorCommand('project.githubSync', () => menuCommandsRef.current.githubSync()),
      registerEditorCommand('sim.record', () => menuCommandsRef.current.record()),
      registerEditorCommand('sim.compile', () => menuCommandsRef.current.compile()),
      registerEditorCommand('sim.run', () => menuCommandsRef.current.run()),
      registerEditorCommand('sim.stop', () => menuCommandsRef.current.stop()),
      registerEditorCommand('sim.resetBoard', () => menuCommandsRef.current.resetBoard()),
      registerEditorCommand('view.toggleConsole', () => menuCommandsRef.current.toggleConsole()),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <>
      <div className="editor-toolbar-wrapper" style={{ position: 'relative' }}>
        <div className="editor-toolbar" ref={toolbarRef}>
          {/* Language selector — only when active board supports an
              alternative to Arduino C++ (MicroPython on Pico/ESP32 boards,
              pure ESP-IDF on the ESP32 family — issue #139). The board
              context pill that used to live here was removed: it duplicated
              the BoardSelector dropdown elsewhere in the toolbar. */}
          {activeBoard &&
            (BOARD_SUPPORTS_MICROPYTHON.has(activeBoard.boardKind) ||
              BOARD_SUPPORTS_ESPIDF.has(activeBoard.boardKind)) && (
            <select
              className="tb-lang-select"
              value={activeBoard.languageMode ?? 'arduino'}
              onChange={(e) => {
                if (activeBoardId)
                  setBoardLanguageMode(activeBoardId, e.target.value as LanguageMode);
              }}
              title={t('editor.toolbar.languageMode')}
              style={{
                background: 'var(--wb-5)',
                color: 'var(--wb-12)',
                border: '1px solid var(--wb-7)',
                borderRadius: 4,
                height: 28,
                alignSelf: 'center',
                padding: '0 6px',
                fontSize: 12,
                cursor: 'pointer',
                outline: 'none',
                marginRight: 4,
              }}
            >
              {/* Arduino only when the kind actually HAS an FQBN: a board
                  with none (the ESP32-C5 kits — no arduino-esp32 core exists)
                  cannot compile in this mode, and offering it just lands the
                  user on "No FQBN for board kind". */}
              {!!BOARD_KIND_FQBN[activeBoard.boardKind] && (
                <option value="arduino">Arduino C++</option>
              )}
              {BOARD_SUPPORTS_MICROPYTHON.has(activeBoard.boardKind) && (
                <option value="micropython">MicroPython</option>
              )}
              {BOARD_SUPPORTS_ESPIDF.has(activeBoard.boardKind) && (
                <option value="espidf">ESP-IDF</option>
              )}
            </select>
          )}

          <div className="toolbar-group">
            {/* Compile */}
            <button
              onClick={handleCompile}
              disabled={compiling || !activeBoard}
              className="tb-btn tb-btn-compile"
              title={
                !activeBoard
                  ? t('editor.toolbar.compile.addBoard')
                  : compiling
                    ? t('editor.toolbar.compile.loading')
                    : activeBoard?.languageMode === 'micropython'
                      ? t('editor.toolbar.compile.loadMicropython')
                      : t('editor.toolbar.compile.compile')
              }
            >
              {compiling ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="spin"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
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
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              )}
            </button>

            <div className="tb-divider" />

            {/* Tinkercad Simulation Control (Start / Stop) */}
            <div className="tb-tinkercad-sim-group">
              <div className="tb-run-split" ref={runMenuRef}>
                <button
                  onClick={() => {
                    if (isSimRunning) {
                      handleStop();
                    } else {
                      if (isMultiBoard) {
                        handleRunAll();
                      } else {
                        handleRun();
                      }
                    }
                  }}
                  disabled={
                    !isSimRunning && (
                      isBoardless
                        ? digitalRunning || verifying
                        : isMultiBoard
                          ? compileAllRunning || verifying
                          : compiling || verifying || !activeBoard
                    )
                  }
                  className={`tb-btn tb-btn-run tb-btn-tinkercad-sim ${
                    isSimRunning ? 'tb-btn-tinkercad-sim--running' : 'tb-btn-tinkercad-sim--idle'
                  }`}
                  title={
                    isSimRunning
                      ? 'Detener simulación'
                      : verifying
                        ? t('editor.toolbar.run.verifying', 'Comprobando circuito...')
                        : compiling || compileAllRunning
                          ? 'Iniciando...'
                          : isMultiBoard
                            ? t('editor.toolbar.runAll')
                            : !activeBoard
                              ? t('editor.toolbar.run.addBoard')
                              : activeBoard?.languageMode === 'micropython'
                                ? t('editor.toolbar.run.runMicropython')
                                : 'Iniciar simulación'
                  }
                >
                  {isSimRunning ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                      </svg>
                      <span className="tb-tinkercad-sim-label">Detener simulación</span>
                    </>
                  ) : verifying || compiling || compileAllRunning ? (
                    <>
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="spin"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span className="tb-tinkercad-sim-label">
                        {verifying ? 'Comprobando...' : 'Iniciando...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <polygon points="6,4 20,12 6,20" />
                      </svg>
                      <span className="tb-tinkercad-sim-label">Iniciar simulación</span>
                    </>
                  )}
                </button>
                {isMultiBoard && (
                  <button
                    className="tb-btn tb-btn-run-caret tb-btn-tinkercad-caret"
                    onClick={() => setRunMenuOpen((o) => !o)}
                    disabled={compileAllRunning || anyBoardRunning || verifying}
                    title={t('editor.toolbar.run.options', 'Opciones de simulación')}
                    aria-haspopup="true"
                    aria-expanded={runMenuOpen}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
                {isMultiBoard && runMenuOpen && (
                  <div className="tb-run-menu" role="menu">
                    <button
                      role="menuitem"
                      className="tb-run-menu-item"
                      onClick={() => {
                        setRunMenuOpen(false);
                        handleRunAll();
                      }}
                    >
                      {t('editor.toolbar.runAll')}
                    </button>
                    <button
                      role="menuitem"
                      className="tb-run-menu-item"
                      disabled={!activeBoard}
                      onClick={() => {
                        setRunMenuOpen(false);
                        handleRun();
                      }}
                    >
                      {t('editor.toolbar.run.runActiveOnly', {
                        name: activeBoard ? boardDisplayName(activeBoard) : '',
                        defaultValue: `Run only ${activeBoard ? boardDisplayName(activeBoard) : ''}`,
                      })}
                    </button>
                  </div>
                )}
              </div>

              {/* Reset — for a booted QEMU-Linux guest this re-uploads the
                  edited files and re-runs the script without rebooting. */}
              <button
                onClick={handleReset}
                disabled={
                  isPiBoardKind(activeBoard?.boardKind ?? '')
                    ? !activeBoard?.piBooted
                    : !compiledHex && !activeBoard?.compiledProgram && !isSimRunning
                }
                className="tb-btn tb-btn-reset tb-btn-tinkercad-reset"
                title={
                  isPiBoardKind(activeBoard?.boardKind ?? '')
                    ? t(
                        'editor.toolbar.rerunScript',
                        'Re-run script with your latest edits (no reboot)',
                      )
                    : t('editor.toolbar.reset', 'Reiniciar simulación')
                }
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>

            {targetCount > 1 && (
              <>
                <div className="tb-divider" />

                {/* Compile All — boards + programmable chips */}
                <button
                  onClick={handleCompileAll}
                  disabled={compileAllRunning}
                  className="tb-btn tb-btn-compile-all"
                  title={t('editor.toolbar.compileAll')}
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
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    <path d="M6 20h4M14 4l4 4" strokeDasharray="2 2" />
                  </svg>
                </button>

                {/* Run All — only when the primary Run isn't already the
                    "run all boards" action (i.e. board + chip or chips-only
                    projects). For 2+ boards the split Run button covers it. */}
                {!isMultiBoard && (
                  <button
                    onClick={() => handleRunAll()}
                    disabled={compileAllRunning || anyBoardRunning || digitalRunning}
                    className="tb-btn tb-btn-run-all"
                    title={t('editor.toolbar.runAll')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <polygon points="3,3 11,12 3,21" />
                      <polygon points="13,3 21,12 13,21" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Center slot — a flexible spacer that keeps the right action group
              pinned to the far right. Rendered unconditionally so the layout
              holds even when no overlay supplies content here. */}
          <div className="toolbar-center-slot">{centerSlot}</div>

          <div className="toolbar-group toolbar-group-right">
            {/* Hidden file input for project import. Accepts both .vlx
                (MCU Maker native) and .zip (Wokwi bundle); the dispatcher in
                utils/importProject.ts picks the right loader by extension. */}
            <input
              ref={importInputRef}
              type="file"
              accept={PROJECT_FILE_ACCEPT}
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            {/* Hidden file input for firmware upload */}
            <input
              ref={firmwareInputRef}
              type="file"
              accept=".hex,.bin,.elf,.ihex"
              style={{ display: 'none' }}
              onChange={handleFirmwareUpload}
            />

            {/* Circuit Tools Portal Slot (Girar, Eliminar, Deshacer, Rehacer, Color, Tipo de cable) */}
            <div className="tb-divider" />
            <div className="tb-circuit-tools-slot" ref={circuitToolsSlotRef} />
            <div className="tb-divider" />

            {/* Output Console toggle */}
            <button
              onClick={() => setConsoleOpen((v) => !v)}
              className={`tb-btn tb-btn-output${consoleOpen ? ' tb-btn-output-active' : ''}`}
              title={t('editor.toolbar.toggleConsole')}
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
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </button>
            {rightSlot}
          </div>
        </div>
      </div>

      {/* Error detail bar */}
      {message?.type === 'error' && message.text.length > 40 && !consoleOpen && (
        <div className="toolbar-error-detail">{message.text}</div>
      )}

      {/* Missing library hint */}
      {missingLibHint && (
        <div className="tb-lib-hint">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{t('editor.toolbar.libHint.message')}</span>
          <button
            className="tb-lib-hint-btn"
            onClick={() => {
              trackOpenLibraryManager();
              setLibManagerOpen(true);
              setMissingLibHint(false);
            }}
          >
            {t('editor.toolbar.libHint.cta')}
          </button>
          <button
            className="tb-lib-hint-close"
            onClick={() => setMissingLibHint(false)}
            title={t('editor.toolbar.libHint.dismiss')}
          >
            &times;
          </button>
        </div>
      )}

      <LibraryManagerModal isOpen={libManagerOpen} onClose={() => setLibManagerOpen(false)} />
      <InstallLibrariesModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        libraries={pendingLibraries}
      />
      {verification && (
        <CircuitVerificationModal
          result={verification}
          onCancel={() => {
            pendingRunRef.current = null;
            setVerification(null);
          }}
          onRunAnyway={() => {
            const resume = pendingRunRef.current;
            pendingRunRef.current = null;
            setVerification(null);
            resume?.();
          }}
        />
      )}
    </>
  );
};

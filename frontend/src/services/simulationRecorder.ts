/**
 * Simulation Screen Recorder Service
 *
 * Captures simulation execution directly in the browser via HTML5
 * MediaStream Recording API and getDisplayMedia, with zero backend dependency
 * and without requiring Pro subscriptions.
 */

let activeRecorder: MediaRecorder | null = null;
let activeStream: MediaStream | null = null;
let recordedChunks: Blob[] = [];

export function isSimulationRecording(): boolean {
  return activeRecorder !== null && activeRecorder.state === 'recording';
}

export function stopSimulationRecording(): void {
  if (activeRecorder && activeRecorder.state !== 'inactive') {
    activeRecorder.stop();
  }
}

export async function toggleSimulationRecording(
  projectName = 'simulacion',
  onStatusChange?: (recording: boolean) => void,
  onNotify?: (msg: { type: 'info' | 'success' | 'error'; text: string }) => void,
): Promise<boolean> {
  if (isSimulationRecording()) {
    stopSimulationRecording();
    return false;
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    onNotify?.({
      type: 'error',
      text: 'Tu navegador no soporta la grabación de pantalla (getDisplayMedia).',
    });
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    });

    activeStream = stream;
    recordedChunks = [];

    // Prioritize high-quality webm/mp4 codecs supported by current browser
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';

    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    activeRecorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = recorder.mimeType?.includes('mp4') ? 'mp4' : 'webm';
        const cleanName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `${cleanName}-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onNotify?.({
          type: 'success',
          text: `Grabación guardada: ${a.download}`,
        });
      }
      activeRecorder = null;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = null;
      }
      onStatusChange?.(false);
    };

    // If the user clicks "Stop sharing" on the native browser banner
    stream.getVideoTracks()[0].onended = () => {
      stopSimulationRecording();
    };

    recorder.start(1000); // 1-second timeslices
    onStatusChange?.(true);
    onNotify?.({
      type: 'info',
      text: 'Grabando simulación... Pulsa "Record simulation" de nuevo para detener y descargar.',
    });
    return true;
  } catch (err: unknown) {
    activeRecorder = null;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      activeStream = null;
    }
    // If the user simply closes/cancels the share picker, do not display error
    if (err instanceof Error && err.name !== 'NotAllowedError') {
      onNotify?.({
        type: 'error',
        text: `Error al iniciar la grabación: ${err.message}`,
      });
    }
    onStatusChange?.(false);
    return false;
  }
}

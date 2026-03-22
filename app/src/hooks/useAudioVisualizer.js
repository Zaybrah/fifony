import { useEffect, useRef, useState, useCallback } from "react";

const BAR_COUNT = 24;

/**
 * Captures mic audio via Web Audio API and returns frequency amplitudes + elapsed time.
 *
 * @param {boolean} active - Whether to capture audio
 * @returns {{ bars: number[], elapsed: number, start: () => void, stop: () => void }}
 */
export function useAudioVisualizer(active) {
  const [bars, setBars] = useState(() => new Array(BAR_COUNT).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    analyserRef.current = null;
    rafRef.current = null;
    timerRef.current = null;
    startTimeRef.current = null;
    setBars(new Array(BAR_COUNT).fill(0));
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (!active) {
      cleanup();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const audioCtx = new AudioContext();
        ctxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Frequency sampling loop
        function tick() {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);
          // Map frequency bins to our bar count, normalize to 0-1
          const binCount = dataArray.length;
          const step = Math.max(1, Math.floor(binCount / BAR_COUNT));
          const newBars = [];
          for (let i = 0; i < BAR_COUNT; i++) {
            const idx = Math.min(i * step, binCount - 1);
            newBars.push(dataArray[idx] / 255);
          }
          setBars(newBars);
          rafRef.current = requestAnimationFrame(tick);
        }
        rafRef.current = requestAnimationFrame(tick);

        // Timer
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          if (startTimeRef.current) {
            setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }
        }, 1000);
      } catch {
        // Mic permission denied or not available — fail silently
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [active, cleanup]);

  return { bars, elapsed };
}

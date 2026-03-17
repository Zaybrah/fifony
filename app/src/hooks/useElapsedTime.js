import { useState, useEffect, useRef } from "react";

/**
 * Returns a live-updating elapsed-time string from a given start ISO timestamp.
 * Updates every second for the first minute, then every 5s.
 * Returns null if startedAt is falsy.
 */
export function useElapsedTime(startedAt) {
  const [elapsed, setElapsed] = useState(() => computeElapsed(startedAt));
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(null);
      return;
    }

    const update = () => setElapsed(computeElapsed(startedAt));
    update();

    // Use 1s interval for first 2 minutes, then 5s
    const startMs = new Date(startedAt).getTime();
    const getInterval = () => (Date.now() - startMs < 120_000 ? 1000 : 5000);

    const tick = () => {
      update();
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, getInterval());
    };

    intervalRef.current = setInterval(tick, getInterval());
    return () => clearInterval(intervalRef.current);
  }, [startedAt]);

  return elapsed;
}

function computeElapsed(startedAt) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return null;
  const diffMs = Math.max(0, Date.now() - start);

  if (diffMs < 1000) return "0s";
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s`;
  if (diffMs < 3_600_000) {
    const m = Math.floor(diffMs / 60_000);
    const s = Math.floor((diffMs % 60_000) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export default useElapsedTime;

import { useAudioVisualizer } from "../hooks/useAudioVisualizer.js";
import { Square } from "lucide-react";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceWaveform({ active, onStop }) {
  const { bars, elapsed } = useAudioVisualizer(active);

  if (!active) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/8 border border-error/20 animate-fade-in">
      {/* Recording dot */}
      <div className="size-2 rounded-full bg-error animate-pulse shrink-0" />

      {/* Timer */}
      <span className="font-mono text-xs text-error tabular-nums w-8 shrink-0">
        {formatTime(elapsed)}
      </span>

      {/* Waveform bars */}
      <div className="flex items-center gap-px flex-1 h-6">
        {bars.map((amplitude, i) => {
          const height = Math.max(8, amplitude * 100);
          return (
            <div
              key={i}
              className="flex-1 rounded-full bg-error/60 transition-[height] duration-75"
              style={{ height: `${height}%`, minWidth: 2, maxWidth: 4 }}
            />
          );
        })}
      </div>

      {/* Stop button */}
      <button
        type="button"
        className="btn btn-xs btn-error btn-soft gap-1 shrink-0"
        onClick={onStop}
      >
        <Square className="size-2.5 fill-current" />
        Stop
      </button>
    </div>
  );
}

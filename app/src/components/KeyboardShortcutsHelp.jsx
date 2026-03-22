import { useEffect, useRef, useMemo } from "react";
import { X, Keyboard } from "lucide-react";
import { useHotkeysContext } from "react-hotkeys-hook";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const GROUP_ORDER = ["palette", "navigation", "global", "drawer", "kanban", "issues"];
const GROUP_LABELS = {
  palette: "Command Palette",
  navigation: "Navigation",
  global: "Global",
  drawer: "Issue Detail",
  kanban: "Kanban Board",
  issues: "Issues List",
};

function formatHotkey(hotkey) {
  return hotkey
    .replace(/mod/gi, isMac ? "\u2318" : "Ctrl")
    .replace(/ctrl/gi, "Ctrl")
    .replace(/alt/gi, "Alt")
    .replace(/shift/gi, "Shift")
    .replace(/enter/gi, "\u21B5")
    .replace(/escape/gi, "Esc")
    .replace(/slash/gi, "/")
    .split("+");
}

export default function KeyboardShortcutsHelp({ open, onClose }) {
  const dialogRef = useRef(null);
  const { hotkeys } = useHotkeysContext();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const groups = useMemo(() => {
    const map = new Map();
    const seen = new Set();
    for (const hk of hotkeys) {
      const desc = hk.description;
      const group = hk.metadata?.group;
      if (!desc || !group) continue;
      const dedup = `${group}:${desc}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(hk);
    }
    const result = [];
    for (const g of GROUP_ORDER) {
      if (map.has(g)) result.push({ group: g, label: GROUP_LABELS[g] || g, shortcuts: map.get(g) });
    }
    return result;
  }, [hotkeys]);

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClose={onClose}
    >
      <div className="modal-box max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Keyboard className="size-5 opacity-60" />
            Keyboard Shortcuts
          </h3>
          <button
            className="btn btn-sm btn-ghost btn-circle"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {groups.map(({ group, label, shortcuts }) => (
            <div key={group}>
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-40 mb-2">{label}</h4>
              <div className="space-y-1">
                {shortcuts.map((s, i) => {
                  const keys = formatHotkey(s.hotkey || "");
                  return (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span className="text-sm opacity-70">{s.description}</span>
                      <div className="flex items-center gap-0.5">
                        {keys.map((k, j) => (
                          <span key={j}>
                            {j > 0 && <span className="text-xs opacity-20 mx-0.5">+</span>}
                            <kbd className="kbd kbd-sm">{k}</kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-action">
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}

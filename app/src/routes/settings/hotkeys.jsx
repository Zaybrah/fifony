import { createFileRoute } from "@tanstack/react-router";
import { useHotkeysContext } from "react-hotkeys-hook";
import { useMemo } from "react";
import { Keyboard, Command, Globe, PanelRight, Columns3, List } from "lucide-react";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const GROUP_ORDER = ["palette", "navigation", "global", "drawer", "kanban", "issues"];
const GROUP_CONFIG = {
  palette:    { label: "Command Palette", icon: Command,    color: "text-primary",   badge: "badge-primary" },
  navigation: { label: "Navigation",      icon: Globe,      color: "text-info",      badge: "badge-info" },
  global:     { label: "Global",          icon: Keyboard,   color: "text-secondary", badge: "badge-secondary" },
  drawer:     { label: "Issue Detail",    icon: PanelRight, color: "text-success",   badge: "badge-success" },
  kanban:     { label: "Kanban Board",    icon: Columns3,   color: "text-warning",   badge: "badge-warning" },
  issues:     { label: "Issues List",     icon: List,       color: "text-error",     badge: "badge-error" },
};

function formatHotkey(hotkey) {
  return (hotkey || "")
    .replace(/mod/gi, isMac ? "\u2318" : "Ctrl")
    .replace(/ctrl/gi, "Ctrl")
    .replace(/alt/gi, "Alt")
    .replace(/shift/gi, "Shift")
    .replace(/enter/gi, "\u21B5 Enter")
    .replace(/escape/gi, "Esc")
    .replace(/slash/gi, "/")
    .split("+");
}

export const Route = createFileRoute("/settings/hotkeys")({
  component: HotkeysSettings,
});

function HotkeysSettings() {
  const { hotkeys } = useHotkeysContext();

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
      if (map.has(g)) result.push({ group: g, ...GROUP_CONFIG[g], shortcuts: map.get(g) });
    }
    return result;
  }, [hotkeys]);

  const totalCount = groups.reduce((sum, g) => sum + g.shortcuts.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Keyboard className="size-5 opacity-60" />
            Keyboard Shortcuts
          </h2>
          <p className="text-sm opacity-50 mt-1">
            {totalCount} shortcuts across {groups.length} contexts.
            Press <kbd className="kbd kbd-xs">Shift</kbd>+<kbd className="kbd kbd-xs">/</kbd> anywhere to see them.
          </p>
        </div>
        <span className="badge badge-ghost font-mono text-xs">
          {isMac ? "macOS" : "Linux / Windows"}
        </span>
      </div>

      <div className="space-y-4">
        {groups.map(({ group, label, icon: Icon, color, badge, shortcuts }) => (
          <div key={group} className="bg-base-200 rounded-box overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-2 border-b border-base-300">
              <Icon className={`size-4 ${color}`} />
              <h3 className="text-sm font-semibold">{label}</h3>
              <span className={`badge badge-xs ${badge}`}>{shortcuts.length}</span>
            </div>
            <div className="divide-y divide-base-300">
              {shortcuts.map((s, i) => {
                const keys = formatHotkey(s.hotkey);
                return (
                  <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-base-100/50 transition-colors">
                    <span className="text-sm">{s.description}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, j) => (
                        <span key={j} className="flex items-center">
                          {j > 0 && <span className="text-xs opacity-20 mx-0.5">+</span>}
                          <kbd className="kbd kbd-sm font-mono">{k.trim()}</kbd>
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

      <div className="bg-base-200 rounded-box p-4 text-xs opacity-50 space-y-1">
        <p>Shortcuts are context-aware. <strong>Drawer</strong> shortcuts only work when an issue detail is open. <strong>Kanban</strong> and <strong>Issues</strong> shortcuts work on their respective pages.</p>
        <p>Modifier key <kbd className="kbd kbd-xs">{isMac ? "\u2318" : "Ctrl"}</kbd> works in input fields too.</p>
      </div>
    </div>
  );
}

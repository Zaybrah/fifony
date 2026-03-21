import React from "react";
import { GitBranch, Folder, ArrowRight, Circle } from "lucide-react";
import { STATES, ISSUE_STATE_MACHINE } from "../../../utils.js";
import { Section } from "../shared.jsx";
import { STATE_ICON, STATE_COLOR, STATE_BG } from "../constants.js";
import { getStateMachineOrder } from "../constants.js";

// ── filterPaths ───────────────────────────────────────────────────────────────

const INTERNAL_PATH_RE = /^(\.fifony|fifony[-_]|WORKFLOW\.local)/;

export function filterPaths(arr) {
  return (Array.isArray(arr) ? arr : []).filter((p) => !INTERNAL_PATH_RE.test(p));
}

// ── RoutingTab ────────────────────────────────────────────────────────────────

export function RoutingTab({ issue }) {
  const paths = filterPaths(issue.paths);

  return (
    <div className="space-y-5">
      {/* State Machine */}
      <Section title="State Machine" icon={GitBranch}>
        <div className="space-y-1">
          {STATES.map((state) => {
            const isCurrent = state === issue.state;
            const Icon = STATE_ICON[state] || Circle;
            const transitions = ISSUE_STATE_MACHINE[state] || [];
            const isPast = getStateMachineOrder(state) < getStateMachineOrder(issue.state);
            return (
              <div key={state} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 border text-sm ${isCurrent ? STATE_BG[state] + " font-semibold" : isPast ? "border-transparent opacity-40" : "border-transparent opacity-60"}`}>
                <Icon className={`size-4 mt-0.5 shrink-0 ${isCurrent ? STATE_COLOR[state] : ""}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span>{state}</span>
                    {isCurrent && <span className="badge badge-xs badge-primary">current</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {transitions.map((t) => (
                      <span key={t} className="inline-flex items-center gap-0.5 text-xs opacity-50">
                        <ArrowRight className="size-2.5" />{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Paths */}
      {paths.length > 0 && (
        <Section title="Paths" icon={Folder} badge={paths.length}>
          <div className="space-y-0.5">
            {paths.map((p) => <div key={p} className="font-mono text-xs truncate">{p}</div>)}
          </div>
        </Section>
      )}
    </div>
  );
}

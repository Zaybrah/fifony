import React, { useState, useEffect } from "react";
import { Cpu, Clock, Zap, Wrench, Bot, Terminal, ChevronDown, ChevronRight, Loader } from "lucide-react";
import { api } from "../../../api.js";
import { Section } from "../shared.jsx";

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function TokenBadge({ usage }) {
  if (!usage?.totalTokens) return null;
  return (
    <span className="badge badge-xs badge-ghost font-mono">
      {usage.totalTokens.toLocaleString()} tok
    </span>
  );
}

function UsageList({ label, icon: Icon, items }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 items-center">
      <Icon className="size-3 opacity-40 shrink-0" />
      <span className="text-[10px] uppercase tracking-wide opacity-40">{label}:</span>
      {items.map((item, i) => (
        <span key={i} className="badge badge-xs badge-outline font-mono">{item}</span>
      ))}
    </div>
  );
}

function TurnCard({ turn }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = turn.success ? "text-success" : "text-error";

  return (
    <div className="border border-base-300 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-base-200/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3 opacity-50" /> : <ChevronRight className="size-3 opacity-50" />}
        <span className={`text-xs font-semibold ${statusColor}`}>
          Turn {turn.turn}
        </span>
        {turn.role && <span className="badge badge-xs badge-primary">{turn.role}</span>}
        {turn.model && <span className="badge badge-xs badge-ghost font-mono">{turn.model}</span>}
        <span className="text-[10px] opacity-40 ml-auto">{turn.directiveStatus}</span>
        <TokenBadge usage={turn.tokenUsage} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-base-300 pt-2">
          {turn.directiveSummary && (
            <p className="text-xs opacity-70">{turn.directiveSummary}</p>
          )}

          <UsageList label="Tools" icon={Wrench} items={turn.toolsUsed} />
          <UsageList label="Skills" icon={Zap} items={turn.skillsUsed} />
          <UsageList label="Agents" icon={Bot} items={turn.agentsUsed} />
          <UsageList label="Commands" icon={Terminal} items={turn.commandsRun} />

          {turn.startedAt && (
            <div className="text-[10px] opacity-40">
              {new Date(turn.startedAt).toLocaleTimeString()} → {new Date(turn.completedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SessionCard({ entry }) {
  const { session, provider, role, cycle } = entry;
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-base-300 rounded-box overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-base-200/30 hover:bg-base-200/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Cpu className="size-3.5 text-primary" />
        <span className="text-sm font-semibold">{provider}</span>
        <span className="badge badge-xs badge-secondary">{role}</span>
        {cycle > 1 && <span className="badge badge-xs badge-warning">cycle {cycle}</span>}
        <span className={`badge badge-xs ${session.status === "done" ? "badge-success" : session.status === "failed" ? "badge-error" : "badge-info"}`}>
          {session.status}
        </span>
        <span className="text-[10px] opacity-40 ml-auto">{session.turns?.length || 0} turn(s)</span>
      </button>

      {expanded && session.turns?.length > 0 && (
        <div className="p-2 space-y-1.5">
          {session.turns.map((turn, i) => (
            <TurnCard key={i} turn={turn} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionsTab({ issueId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/issues/${encodeURIComponent(issueId)}/sessions`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [issueId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center opacity-50">
        <Loader className="size-4 animate-spin" /> Loading sessions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error text-xs py-2">
        Failed to load sessions: {error}
      </div>
    );
  }

  const sessions = data?.sessions || [];
  const pipeline = data?.pipeline;

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 opacity-40 text-sm">
        No execution sessions recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pipeline && (
        <Section title="Pipeline" icon={Cpu}>
          <div className="flex items-center gap-2 text-xs">
            <span className="opacity-50">Attempt:</span>
            <span className="font-mono">{pipeline.attempt}</span>
            <span className="opacity-50 ml-2">Cycle:</span>
            <span className="font-mono">{pipeline.cycle}</span>
            {pipeline.history?.length > 0 && (
              <>
                <span className="opacity-50 ml-2">History:</span>
                <span className="font-mono">{pipeline.history.length} entries</span>
              </>
            )}
          </div>
        </Section>
      )}

      <Section title={`Sessions (${sessions.length})`} icon={Cpu}>
        <div className="space-y-2">
          {sessions.map((entry, i) => (
            <SessionCard key={entry.key || i} entry={entry} />
          ))}
        </div>
      </Section>
    </div>
  );
}

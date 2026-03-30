import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api.js";
import { SETTINGS_QUERY_KEY, upsertSettingPayload } from "../../hooks.js";
import { Sparkles, MessageSquare, Brain, Zap, Search, Activity, RotateCcw, Loader2, Check, CircleCheck, CircleX } from "lucide-react";
import { EFFORT_OPTIONS } from "../../components/OnboardingWizard/constants.js";

const STAGES = [
  { key: "enhance",  role: "enhancer",  label: "Enhance",  icon: Sparkles,      description: "Improve issue title and description",       accent: "warning" },
  { key: "chat",     role: "chatter",   label: "Chat",     icon: MessageSquare, description: "Conversational AI for discussions",          accent: "info" },
  { key: "plan",     role: "planner",   label: "Plan",     icon: Brain,         description: "Scope the issue and create execution plan",  accent: "info" },
  { key: "execute",  role: "executor",  label: "Execute",  icon: Zap,           description: "Implement the plan — write code, run commands", accent: "primary" },
  { key: "review",   role: "reviewer",  label: "Review",   icon: Search,        description: "Validate correctness, scope, and quality",   accent: "secondary" },
  { key: "services", role: "services",  label: "Services", icon: Activity,      description: "AI-powered service log analysis",            accent: "success" },
];

const COLOR_MAP = {
  warning:   "text-warning",
  info:      "text-info",
  primary:   "text-primary",
  secondary: "text-secondary",
  success:   "text-success",
};

function EffortPills({ options, value, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
              active
                ? `${opt.color} border-current bg-base-300`
                : "text-base-content/35 border-base-content/10 hover:border-base-content/30 hover:text-base-content/60"
            }`}
          >
            <Icon className="size-2.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function getEffortOptionsForProvider(provider) {
  if (provider === "gemini") return EFFORT_OPTIONS.filter((o) => o.value !== "extra-high");
  return EFFORT_OPTIONS;
}

export const Route = createFileRoute("/settings/agents")({
  component: PipelineSettings,
});

function PipelineSettings() {
  const qc = useQueryClient();
  const [workflow, setWorkflow] = useState(null);
  const [providers, setProviders] = useState([]);
  const [modelsByProvider, setModelsByProvider] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingStage, setSavingStage] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const saveTimer = useRef(null);

  const availableProviders = useMemo(() => (providers || []).filter((p) => p.available), [providers]);

  // Compute whether all stages share the same provider
  const allSameProvider = useMemo(() => {
    if (!workflow) return false;
    const first = workflow[STAGES[0].key]?.provider;
    return first && STAGES.every((s) => workflow[s.key]?.provider === first);
  }, [workflow]);

  // Bulk effort: only show options supported by all current providers
  const bulkEffortOptions = useMemo(() => {
    if (!workflow) return EFFORT_OPTIONS;
    const supports = STAGES.map((s) => new Set(getEffortOptionsForProvider(workflow[s.key]?.provider).map((o) => o.value)));
    const common = [...supports[0]].filter((v) => supports.every((set) => set.has(v)));
    const ordered = EFFORT_OPTIONS.filter((o) => common.includes(o.value));
    return ordered.length > 0 ? ordered : EFFORT_OPTIONS;
  }, [workflow]);

  const normalizedBulkEffort = useMemo(() => {
    if (!workflow) return "medium";
    const vals = STAGES.map((s) => workflow[s.key]?.effort);
    const same = vals.every((v) => v === vals[0]) ? vals[0] : null;
    const target = same || bulkEffortOptions[0]?.value || "medium";
    return bulkEffortOptions.some((o) => o.value === target) ? target : "medium";
  }, [workflow, bulkEffortOptions]);

  const syncCache = useCallback((nextWorkflow) => {
    qc.setQueryData(SETTINGS_QUERY_KEY, (current) => upsertSettingPayload(current, {
      id: "runtime.workflowConfig",
      scope: "runtime",
      value: nextWorkflow,
      source: "user",
      updatedAt: new Date().toISOString(),
    }));
    qc.setQueryData(["workflow-config"], { ok: true, workflow: nextWorkflow, isDefault: false });
  }, [qc]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/config/workflow?details=1");
      setWorkflow(res.workflow);
      setProviders(res.providers || []);
      setModelsByProvider(res.models || {});
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const autoSave = useCallback((newWorkflow, changedStage) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.post("/config/workflow", { workflow: newWorkflow });
        syncCache(newWorkflow);
        setSavingStage(changedStage);
        setTimeout(() => setSavingStage(null), 1500);
      } catch {}
    }, 600);
  }, [syncCache]);

  const handleStageChange = useCallback((stageKey, newConfig) => {
    setWorkflow((prev) => {
      const next = { ...prev, [stageKey]: newConfig };
      autoSave(next, stageKey);
      return next;
    });
  }, [autoSave]);

  const applyProviderToAll = useCallback((providerName) => {
    if (!providerName) return;
    const model = modelsByProvider[providerName]?.[0]?.id || "";
    setWorkflow((prev) => {
      const next = {};
      for (const s of STAGES) {
        const effort = providerName === "gemini" && prev[s.key]?.effort === "extra-high" ? "high" : (prev[s.key]?.effort || "medium");
        next[s.key] = { provider: providerName, model, effort };
      }
      autoSave(next, "all");
      return next;
    });
  }, [modelsByProvider, autoSave]);

  const applyEffortToAll = useCallback((effort) => {
    if (!effort) return;
    setWorkflow((prev) => {
      const next = {};
      for (const s of STAGES) {
        next[s.key] = { ...prev[s.key], effort };
      }
      autoSave(next, "all");
      return next;
    });
  }, [autoSave]);

  const handleRestoreDefaults = useCallback(async () => {
    setRestoring(true);
    try {
      const res = await api.get("/config/workflow?details=1");
      const freshProviders = res.providers || [];
      const freshModels = res.models || {};
      setProviders(freshProviders);
      setModelsByProvider(freshModels);
      const available = freshProviders.filter((p) => p.available);
      const hasClaude = available.some((p) => p.name === "claude");
      const hasCodex = available.some((p) => p.name === "codex");
      const claudeModel = freshModels.claude?.[0]?.id || "";
      const codexModel = freshModels.codex?.[0]?.id || "";
      const planProvider = hasClaude ? "claude" : "codex";
      const planModel    = hasClaude ? claudeModel : codexModel;
      const execProvider = hasCodex  ? "codex"  : "claude";
      const execModel    = hasCodex  ? codexModel  : claudeModel;
      const defaults = {
        enhance:  { provider: planProvider, model: planModel, effort: "medium" },
        chat:     { provider: planProvider, model: planModel, effort: "medium" },
        plan:     { provider: planProvider, model: planModel, effort: "high" },
        execute:  { provider: execProvider, model: execModel, effort: "medium" },
        review:   { provider: planProvider, model: planModel, effort: "medium" },
        services: { provider: planProvider, model: planModel, effort: "medium" },
      };
      setWorkflow(defaults);
      await api.post("/config/workflow", { workflow: defaults });
      syncCache(defaults);
      setSavingStage("all");
      setTimeout(() => setSavingStage(null), 1500);
    } catch {}
    setRestoring(false);
  }, [syncCache]);

  if (loading || !workflow) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin opacity-30" />
      </div>
    );
  }

  return (
    <div className="space-y-5 stagger-children">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Pipeline</h2>
          <p className="text-xs opacity-50 mt-0.5">Provider, model, and thinking depth per stage. Changes are saved automatically.</p>
        </div>
        <button
          className="btn btn-ghost btn-sm gap-1 shrink-0"
          title="Reset to auto-detected provider defaults"
          onClick={handleRestoreDefaults}
          disabled={restoring}
        >
          {restoring ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
          Restore defaults
        </button>
      </div>

      {/* Quick Apply panel */}
      <div className="bg-base-200 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Apply to all stages</h3>
          <p className="text-xs text-base-content/50 mb-2">Use one CLI and one effort across all 6 stages.</p>
          <div className="flex flex-wrap gap-2">
            {availableProviders.map((prov) => {
              const name = prov.name || prov.id;
              const isActive = allSameProvider && workflow[STAGES[0].key]?.provider === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={`btn btn-xs ${isActive ? "btn-primary" : "btn-soft"}`}
                  onClick={() => applyProviderToAll(name)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-base-content/40 mb-2">Effort (applies to all)</div>
          <EffortPills
            options={bulkEffortOptions}
            value={normalizedBulkEffort}
            onChange={applyEffortToAll}
          />
        </div>
      </div>

      {/* Provider availability strip */}
      <div className="flex flex-wrap gap-2 justify-center">
        {providers.map((prov) => {
          const name = prov.name || prov.id;
          const available = prov.available !== false;
          return (
            <span
              key={name}
              className={`badge gap-1.5 badge-sm ${available ? "badge-success" : "badge-ghost opacity-40"}`}
            >
              {available ? <CircleCheck className="size-3" /> : <CircleX className="size-3" />}
              <span className="font-mono">{name}</span>
              {prov.path && (
                <span className="opacity-50 text-[9px] hidden sm:inline">{prov.path}</span>
              )}
            </span>
          );
        })}
      </div>

      {/* Pipeline cards — 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {STAGES.map((stage) => {
          const Icon = stage.icon;
          const config = workflow[stage.key] || workflow.plan;
          const models = modelsByProvider[config.provider] || [];
          const effortOptions = getEffortOptionsForProvider(config.provider);
          const textColor = COLOR_MAP[stage.accent] || "text-base-content";
          const isSaving = savingStage === stage.key || savingStage === "all";

          return (
            <div key={stage.key} className="bg-base-200 rounded-xl p-4 animate-fade-in">
              <div className="flex flex-col gap-3">

                {/* Role header + provider select */}
                <div className="flex items-center gap-3">
                  <div className={`size-8 rounded-lg flex items-center justify-center bg-base-300 shrink-0 ${textColor}`}>
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{stage.label}</span>
                      {isSaving && (
                        <span className="text-xs text-success flex items-center gap-1 animate-fade-in">
                          <Check className="size-3" /> saved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-base-content/40 leading-tight mt-0.5 truncate">{stage.description}</p>
                  </div>
                  <select
                    className="select select-sm select-bordered w-28 shrink-0"
                    value={config.provider}
                    onChange={(e) => {
                      const newProvider = e.target.value;
                      const newModels = modelsByProvider[newProvider] || [];
                      const newEffort = newProvider === "gemini" && config.effort === "extra-high" ? "high" : config.effort;
                      handleStageChange(stage.key, { ...config, provider: newProvider, model: newModels[0]?.id || "", effort: newEffort });
                    }}
                  >
                    {availableProviders.map((p) => {
                      const name = p.name || p.id;
                      return <option key={name} value={name}>{name}</option>;
                    })}
                  </select>
                </div>

                {/* Effort pills */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-base-content/40 shrink-0 w-10">Effort</span>
                  <EffortPills
                    options={effortOptions}
                    value={config.effort || "medium"}
                    onChange={(v) => handleStageChange(stage.key, { ...config, effort: v })}
                  />
                </div>

                {/* Model select */}
                {models.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-base-content/40 shrink-0 w-10">Model</span>
                    <select
                      className="select select-xs select-bordered flex-1"
                      value={config.model}
                      onChange={(e) => handleStageChange(stage.key, { ...config, model: e.target.value })}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}{m.tier ? ` — ${m.tier}` : ""}</option>
                      ))}
                    </select>
                  </div>
                ) : config.model ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-base-content/40 shrink-0 w-10">Model</span>
                    <span className="text-xs opacity-40">{config.model}</span>
                  </div>
                ) : null}

              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-base-content/35 text-center">
        Pipeline stages: enhance, chat, plan, execute, review, services
      </p>
    </div>
  );
}

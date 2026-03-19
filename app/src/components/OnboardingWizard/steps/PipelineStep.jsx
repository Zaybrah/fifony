import { useEffect } from "react";
import { Rocket, Loader2, CircleCheck, CircleX, ArrowDown } from "lucide-react";
import { PIPELINE_ROLES, getEffortOptionsForRole } from "../constants";

const ROLE_MODEL_KEY = { planner: "plan", executor: "execute", reviewer: "review" };

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

function PipelineStep({
  providers, providersLoading, pipeline, setPipeline,
  efforts, setEfforts, models, setModels, modelsByProvider,
}) {
  const providerList = Array.isArray(providers) ? providers : [];
  const availableProviders = providerList.filter((p) => p.available !== false);

  // Auto-clamp effort when provider changes
  useEffect(() => {
    for (const role of ["planner", "executor", "reviewer"]) {
      const options = getEffortOptionsForRole(role, pipeline);
      const currentValue = efforts[role];
      if (currentValue && !options.some((o) => o.value === currentValue)) {
        setEfforts((prev) => ({ ...prev, [role]: "high" }));
      }
    }
  }, [pipeline, efforts, setEfforts]);

  return (
    <div className="flex flex-col gap-5 w-full max-w-lg">
      {/* Header */}
      <div className="text-center">
        <Rocket className="size-9 text-primary mx-auto mb-2" />
        <h2 className="text-2xl font-bold">Agent Pipeline</h2>
        <p className="text-sm text-base-content/50 mt-1">
          Configure which CLI and reasoning depth runs each stage
        </p>
      </div>

      {providersLoading ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="size-7 text-primary animate-spin" />
          <p className="text-sm text-base-content/50">Detecting available CLIs…</p>
        </div>
      ) : availableProviders.length === 0 ? (
        <div className="alert alert-warning text-sm">
          No providers detected. Install claude, codex, or gemini CLI first.
        </div>
      ) : (
        <>
          {/* Provider availability strip */}
          <div className="flex flex-wrap gap-2 justify-center">
            {providerList.map((prov) => {
              const name = prov.id || prov.name || prov;
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

          {/* Pipeline rows */}
          <div className="flex flex-col">
            {PIPELINE_ROLES.map((r, i) => {
              const Icon = r.icon;
              const selected = pipeline[r.role] || availableProviders[0]?.id || availableProviders[0]?.name || "";
              const modelKey = ROLE_MODEL_KEY[r.role];
              const currentModel = models?.[modelKey] || "";
              const availableModels = modelsByProvider?.[selected] || [];
              const effortOptions = getEffortOptionsForRole(r.role, pipeline);
              const currentEffortValue = efforts?.[r.role] || "high";

              return (
                <div key={r.role}>
                  {i > 0 && (
                    <div className="flex justify-center py-1.5 text-base-content/20">
                      <ArrowDown className="size-4" />
                    </div>
                  )}

                  <div className="bg-base-200 rounded-xl p-4">
                    <div className="flex flex-col gap-3">

                      {/* Role header + provider select */}
                      <div className="flex items-center gap-3">
                        <div className={`size-8 rounded-lg flex items-center justify-center bg-base-300 shrink-0 ${r.color}`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm">{r.label}</span>
                          <p className="text-[11px] text-base-content/40 leading-tight mt-0.5 truncate">{r.description}</p>
                        </div>
                        <select
                          className="select select-sm select-bordered w-28 shrink-0"
                          value={selected}
                          onChange={(e) => {
                            const newProvider = e.target.value;
                            setPipeline((prev) => ({ ...prev, [r.role]: newProvider }));
                            // Reset model when provider changes
                            const firstModel = modelsByProvider?.[newProvider]?.[0]?.id || "";
                            setModels((prev) => ({ ...prev, [modelKey]: firstModel }));
                          }}
                        >
                          {availableProviders.map((p) => {
                            const name = p.id || p.name || p;
                            return <option key={name} value={name}>{name}</option>;
                          })}
                        </select>
                      </div>

                      {/* Effort pills */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-base-content/40 shrink-0 w-10">Effort</span>
                        <EffortPills
                          options={effortOptions}
                          value={currentEffortValue}
                          onChange={(v) => setEfforts((prev) => ({ ...prev, [r.role]: v }))}
                        />
                      </div>

                      {/* Model select */}
                      {availableModels.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-base-content/40 shrink-0 w-10">Model</span>
                          <select
                            className="select select-xs select-bordered flex-1"
                            value={currentModel}
                            onChange={(e) => setModels((prev) => ({ ...prev, [modelKey]: e.target.value }))}
                          >
                            {availableModels.map((m) => (
                              <option key={m.id} value={m.id}>{m.label || m.id}</option>
                            ))}
                          </select>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-base-content/35 text-center">
            Pipeline runs top to bottom: plan → execute → review
          </p>
        </>
      )}
    </div>
  );
}

export default PipelineStep;

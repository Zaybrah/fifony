import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, PlugZap, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { SettingsSection } from "../../components/SettingsSection.jsx";
import { SETTINGS_QUERY_KEY, getSettingValue, getSettingsList, upsertSettingPayload, useSettings } from "../../hooks.js";

const LINEAR_STATUS_QUERY_KEY = ["integrations", "linear", "status"];
const SETTING_ID_SYNC_IMPORT = "integrations.linear.syncOnImportComment";
const SETTING_ID_SYNC_MERGE = "integrations.linear.syncOnMergeComment";

export const Route = createFileRoute("/settings/integrations")({
  component: IntegrationSettings,
});

function IntegrationSettings() {
  const qc = useQueryClient();
  const settingsQuery = useSettings();
  const settings = getSettingsList(settingsQuery.data);
  const statusQuery = useQuery({
    queryKey: LINEAR_STATUS_QUERY_KEY,
    queryFn: () => api.get("/integrations/linear/status"),
    staleTime: 15_000,
  });

  const [tokenInput, setTokenInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("info");
  const [viewer, setViewer] = useState(null);
  const [syncOnImport, setSyncOnImport] = useState(false);
  const [syncOnMerge, setSyncOnMerge] = useState(false);

  useEffect(() => {
    setSyncOnImport(Boolean(getSettingValue(settings, SETTING_ID_SYNC_IMPORT, false)));
    setSyncOnMerge(Boolean(getSettingValue(settings, SETTING_ID_SYNC_MERGE, false)));
  }, [settings]);

  const persistSetting = useCallback(async (settingId, value) => {
    const optimistic = {
      id: settingId,
      scope: "system",
      value,
      source: "user",
      updatedAt: new Date().toISOString(),
    };
    qc.setQueryData(SETTINGS_QUERY_KEY, (current) => upsertSettingPayload(current, optimistic));
    await api.post(`/settings/${encodeURIComponent(settingId)}`, {
      scope: "system",
      value,
      source: "user",
    });
  }, [qc]);

  const tokenPreview = statusQuery.data?.tokenPreview || null;
  const configured = !!statusQuery.data?.configured;

  const syncDescription = useMemo(() => {
    if (!syncOnImport && !syncOnMerge) return "Linear sync is currently disabled.";
    if (syncOnImport && syncOnMerge) return "Fifony will comment on import and on merge. Failures remain non-fatal.";
    if (syncOnImport) return "Fifony will comment when a Linear issue is imported.";
    return "Fifony will comment when a Linear-backed issue is merged.";
  }, [syncOnImport, syncOnMerge]);

  const setFeedbackState = useCallback((message, tone = "info") => {
    setFeedback(message);
    setFeedbackTone(tone);
  }, []);

  const handleSaveToken = useCallback(async () => {
    const token = tokenInput.trim();
    if (!token) {
      setFeedbackState("Enter a Linear API token first.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.put("/integrations/linear/token", { token });
      setTokenInput("");
      setViewer(null);
      setFeedbackState("Linear token saved.", "success");
      await qc.invalidateQueries({ queryKey: LINEAR_STATUS_QUERY_KEY });
    } catch (err) {
      setFeedbackState(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }, [qc, setFeedbackState, tokenInput]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      const payload = tokenInput.trim() ? { token: tokenInput.trim() } : {};
      const result = await api.post("/integrations/linear/test", payload);
      setViewer(result?.viewer ?? null);
      setFeedbackState("Linear connection succeeded.", "success");
    } catch (err) {
      setViewer(null);
      setFeedbackState(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setTesting(false);
    }
  }, [setFeedbackState, tokenInput]);

  const handleClear = useCallback(async () => {
    setClearing(true);
    try {
      await api.delete("/integrations/linear/token");
      setTokenInput("");
      setViewer(null);
      setFeedbackState("Linear token cleared.", "success");
      await qc.invalidateQueries({ queryKey: LINEAR_STATUS_QUERY_KEY });
    } catch (err) {
      setFeedbackState(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setClearing(false);
    }
  }, [qc, setFeedbackState]);

  const toggleImportSync = useCallback(async (nextValue) => {
    setSyncOnImport(nextValue);
    try {
      await persistSetting(SETTING_ID_SYNC_IMPORT, nextValue);
    } catch (err) {
      setSyncOnImport(!nextValue);
      setFeedbackState(err instanceof Error ? err.message : String(err), "error");
    }
  }, [persistSetting, setFeedbackState]);

  const toggleMergeSync = useCallback(async (nextValue) => {
    setSyncOnMerge(nextValue);
    try {
      await persistSetting(SETTING_ID_SYNC_MERGE, nextValue);
    } catch (err) {
      setSyncOnMerge(!nextValue);
      setFeedbackState(err instanceof Error ? err.message : String(err), "error");
    }
  }, [persistSetting, setFeedbackState]);

  return (
    <div className="space-y-5">
      <SettingsSection
        icon={PlugZap}
        title="Linear"
        description="Connect a personal Linear API token and keep imports user-controlled."
      >
        <div className="space-y-3">
          <label className="form-control">
            <span className="label pb-1">
              <span className="label-text text-xs font-medium">API token</span>
            </span>
            <input
              type="password"
              className="input input-bordered"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={configured && tokenPreview ? tokenPreview : "lin_api_..."}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`badge ${configured ? "badge-success" : "badge-ghost"}`}>
              {configured ? "Configured" : "Not configured"}
            </span>
            {tokenPreview && <span className="font-mono opacity-60">{tokenPreview}</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm gap-1.5" onClick={handleSaveToken} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Save token
            </button>
            <button type="button" className="btn btn-outline btn-sm gap-1.5" onClick={handleTest} disabled={testing || (!configured && !tokenInput.trim())}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Test connection
            </button>
            <button type="button" className="btn btn-ghost btn-sm gap-1.5 text-error" onClick={handleClear} disabled={clearing || !configured}>
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear token
            </button>
          </div>

          {feedback && (
            <div className={`alert py-2 text-sm ${feedbackTone === "error" ? "alert-error" : feedbackTone === "success" ? "alert-success" : "alert-info"}`}>
              {feedback}
            </div>
          )}

          {viewer && (
            <div className="rounded-xl border border-base-300 bg-base-100 p-3 text-sm">
              <div className="font-semibold">Connected as</div>
              <div className="mt-1">{viewer.name}</div>
              {viewer.email && <div className="text-xs opacity-65">{viewer.email}</div>}
              {viewer.organization?.name && (
                <div className="mt-2 text-xs opacity-70">Workspace: {viewer.organization.name}</div>
              )}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={CheckCircle2}
        title="Sync comments"
        description={syncDescription}
      >
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 rounded-xl border border-base-300 bg-base-100 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Comment on import</div>
              <div className="text-xs opacity-60">After a Linear issue becomes a Fifony issue, add a short backlink comment.</div>
            </div>
            <input type="checkbox" className="toggle toggle-primary" checked={syncOnImport} onChange={(event) => toggleImportSync(event.target.checked)} />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-base-300 bg-base-100 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Comment on merge</div>
              <div className="text-xs opacity-60">When a Linear-backed Fifony issue is merged, add PR or merge completion info back to Linear.</div>
            </div>
            <input type="checkbox" className="toggle toggle-primary" checked={syncOnMerge} onChange={(event) => toggleMergeSync(event.target.checked)} />
          </label>

          <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2.5 text-xs opacity-65">
            Sync failures are warnings only. They never block create, review, or merge.
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
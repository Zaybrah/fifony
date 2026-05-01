import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { api } from "../api.js";

function buildIssuesPath(filters) {
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set("query", filters.query.trim());
  if (filters.teamId) params.set("teamId", filters.teamId);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.status) params.set("status", filters.status);
  if (filters.label) params.set("label", filters.label);
  params.set("limit", "20");
  const qs = params.toString();
  return `/integrations/linear/issues${qs ? `?${qs}` : ""}`;
}

function badgeTone(priority) {
  switch (priority) {
    case 1:
      return "badge-error";
    case 2:
      return "badge-warning";
    case 3:
      return "badge-info";
    case 4:
      return "badge-ghost";
    default:
      return "badge-ghost";
  }
}

export function LinearIssueImportModal({ open, onClose, onImport, onToast }) {
  const [status, setStatus] = useState({ configured: false, tokenPreview: null });
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [issues, setIssues] = useState([]);
  const [query, setQuery] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [selectingIssueId, setSelectingIssueId] = useState("");
  const [error, setError] = useState("");

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setError("");
    try {
      const nextStatus = await api.get("/integrations/linear/status");
      setStatus({
        configured: !!nextStatus?.configured,
        tokenPreview: nextStatus?.tokenPreview || null,
      });
      if (!nextStatus?.configured) {
        setTeams([]);
        setProjects([]);
        setIssues([]);
        return;
      }
      const [teamsRes, projectsRes] = await Promise.all([
        api.get("/integrations/linear/teams?limit=50"),
        api.get("/integrations/linear/projects?limit=50"),
      ]);
      setTeams(Array.isArray(teamsRes?.teams) ? teamsRes.teams : []);
      setProjects(Array.isArray(projectsRes?.projects) ? projectsRes.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  const searchIssues = useCallback(async () => {
    if (!status.configured) return;
    setLoadingIssues(true);
    setError("");
    try {
      const result = await api.get(buildIssuesPath({
        query,
        teamId: teamId || undefined,
        projectId: projectId || undefined,
        status: statusFilter || undefined,
        label: labelFilter || undefined,
      }));
      setIssues(Array.isArray(result?.issues) ? result.issues : []);
    } catch (err) {
      setIssues([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingIssues(false);
    }
  }, [labelFilter, projectId, query, status.configured, statusFilter, teamId]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTeamId("");
    setProjectId("");
    setStatusFilter("");
    setLabelFilter("");
    setSelectingIssueId("");
    void loadMeta();
  }, [open, loadMeta]);

  useEffect(() => {
    if (!open || !status.configured) return;
    const timer = setTimeout(() => {
      void searchIssues();
    }, 250);
    return () => clearTimeout(timer);
  }, [open, searchIssues, status.configured]);

  const labels = useMemo(() => {
    const names = new Set();
    for (const issue of issues) {
      for (const label of issue.labels || []) {
        if (label?.name) names.add(label.name);
      }
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [issues]);

  const statuses = useMemo(() => {
    const names = new Set();
    for (const issue of issues) {
      if (issue.state?.name) names.add(issue.state.name);
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [issues]);

  const visibleProjects = useMemo(() => projects, [projects]);

  const handleImport = useCallback(async (issueId) => {
    setSelectingIssueId(issueId);
    setError("");
    try {
      const result = await api.get(`/integrations/linear/issues/${encodeURIComponent(issueId)}`);
      if (!result?.draft) throw new Error("Linear import draft was empty.");
      onImport?.(result.draft);
      onToast?.(`Imported ${result.draft.linearIdentifier}`, "success");
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelectingIssueId("");
    }
  }, [onClose, onImport, onToast]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold">Import from Linear</h3>
            <p className="text-xs opacity-55">Search an existing Linear issue and pull it into the current Fifony draft.</p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-base-300 bg-base-200/70 p-3 text-xs">
              <div className="font-semibold">Connection</div>
              {loadingMeta ? (
                <div className="mt-2 flex items-center gap-2 opacity-70">
                  <Loader2 className="size-3.5 animate-spin" /> Loading...
                </div>
              ) : status.configured ? (
                <div className="mt-2 space-y-1">
                  <div className="text-success">Configured</div>
                  {status.tokenPreview && <div className="font-mono opacity-60">{status.tokenPreview}</div>}
                </div>
              ) : (
                <div className="mt-2 space-y-1 text-warning">
                  <div>Linear token not configured.</div>
                  <div className="opacity-70">Open Settings → Integrations to add one.</div>
                </div>
              )}
            </div>

            <label className="form-control">
              <span className="label pb-1"><span className="label-text text-xs font-medium">Search</span></span>
              <label className="input input-bordered input-sm flex items-center gap-2">
                <Search className="size-3.5 opacity-40" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ABC-123 or keyword" className="grow" />
              </label>
            </label>

            <label className="form-control">
              <span className="label pb-1"><span className="label-text text-xs font-medium">Team</span></span>
              <select
                className="select select-bordered select-sm"
                value={teamId}
                onChange={(event) => {
                  setTeamId(event.target.value);
                  setProjectId("");
                }}
                disabled={!status.configured}
              >
                <option value="">All teams</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.key ? `${team.key} · ${team.name}` : team.name}</option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label pb-1"><span className="label-text text-xs font-medium">Project</span></span>
              <select className="select select-bordered select-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!status.configured}>
                <option value="">All projects</option>
                {visibleProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label pb-1"><span className="label-text text-xs font-medium">Status</span></span>
              <select className="select select-bordered select-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} disabled={!status.configured}>
                <option value="">Any status</option>
                {statuses.map((statusName) => (
                  <option key={statusName} value={statusName}>{statusName}</option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label pb-1"><span className="label-text text-xs font-medium">Label</span></span>
              <select className="select select-bordered select-sm" value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)} disabled={!status.configured}>
                <option value="">Any label</option>
                {labels.map((labelName) => (
                  <option key={labelName} value={labelName}>{labelName}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="min-h-[360px] rounded-2xl border border-base-300 bg-base-200/35 p-3">
            {error && (
              <div className="alert alert-error mb-3 text-sm py-2">{error}</div>
            )}

            {!status.configured && !loadingMeta ? (
              <div className="flex h-full items-center justify-center text-center text-sm opacity-60">
                Add a Linear API token before importing issues.
              </div>
            ) : loadingIssues && issues.length === 0 ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm opacity-70">
                <Loader2 className="size-4 animate-spin" /> Loading issues...
              </div>
            ) : issues.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm opacity-60">
                No Linear issues matched the current filters.
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-1 max-h-[62vh]">
                {issues.map((issue) => {
                  const labelsText = (issue.labels || []).map((label) => label.name).slice(0, 4);
                  const isSelecting = selectingIssueId === issue.id;
                  return (
                    <button
                      key={issue.id}
                      type="button"
                      className="w-full rounded-xl border border-base-300 bg-base-100 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => handleImport(issue.id)}
                      disabled={isSelecting}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs opacity-70">
                            <span className="font-mono">{issue.identifier}</span>
                            {issue.state?.name && <span className="badge badge-xs badge-ghost">{issue.state.name}</span>}
                            <span className={`badge badge-xs ${badgeTone(issue.priority)}`}>{issue.priorityLabel}</span>
                          </div>
                          <div className="mt-1 text-sm font-semibold leading-snug">{issue.title}</div>
                          {issue.description && <div className="mt-1 line-clamp-2 text-xs opacity-60">{issue.description}</div>}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] opacity-60">
                            {issue.team?.name && <span>{issue.team.name}</span>}
                            {issue.project?.name && <span>{issue.project.name}</span>}
                            {labelsText.map((label) => <span key={`${issue.id}-${label}`} className="badge badge-xs badge-outline">{label}</span>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {issue.url && (
                            <a
                              href={issue.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-xs btn-ghost"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                          {isSelecting ? <Loader2 className="size-4 animate-spin" /> : <span className="text-xs font-medium text-primary">Import</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LinearIssueImportModal;
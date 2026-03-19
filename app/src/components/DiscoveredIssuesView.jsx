import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useDashboard } from "../context/DashboardContext";
import {
  Search, FileCode, Github, Loader2, CheckSquare, Square,
  Plus, AlertTriangle, ArrowLeft, RefreshCw, Tag, FolderOpen,
} from "lucide-react";

// ── Source tab config ────────────────────────────────────────────────────────

const TABS = [
  { id: "all", label: "TODOs & FIXMEs", icon: FileCode },
  { id: "github", label: "GitHub Issues", icon: Github },
];

const SOURCE_BADGE = {
  todo: { label: "TODO", class: "badge-info" },
  fixme: { label: "FIXME", class: "badge-error" },
  hack: { label: "HACK", class: "badge-warning" },
  github: { label: "GitHub", class: "badge-neutral" },
};

// ── Discovered Issue Card ────────────────────────────────────────────────────

function DiscoveredIssueCard({ item, selected, onToggle, onCreateSingle, creating }) {
  const badge = SOURCE_BADGE[item.source] || SOURCE_BADGE.todo;

  return (
    <div
      className={`card card-compact bg-base-200/50 border transition-all duration-150 ${
        selected ? "border-primary/40 bg-primary/5" : "border-base-300/50 hover:border-base-content/20"
      }`}
    >
      <div className="card-body gap-2">
        <div className="flex items-start gap-3">
          <button
            className="mt-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            onClick={() => onToggle(item)}
          >
            {selected ? (
              <CheckSquare className="size-5 text-primary" />
            ) : (
              <Square className="size-5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`badge badge-xs ${badge.class}`}>{badge.label}</span>
              {item.category && (
                <span className="badge badge-xs badge-ghost">{item.category}</span>
              )}
            </div>

            <p className="text-sm font-medium mt-1 leading-snug">{item.title}</p>

            {item.file && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-base-content/50">
                <FolderOpen className="size-3" />
                <span className="truncate">{item.file}</span>
                {item.line > 0 && <span>:{item.line}</span>}
              </div>
            )}

            {item.suggestedLabels?.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <Tag className="size-3 text-base-content/40" />
                {item.suggestedLabels.slice(0, 4).map((label) => (
                  <span key={label} className="badge badge-xs badge-outline">{label}</span>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-xs btn-ghost btn-square shrink-0"
            onClick={() => onCreateSingle(item)}
            disabled={creating}
            title="Create issue"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DiscoveredIssuesView({ embedded = false, onBack }) {
  const [activeTab, setActiveTab] = useState("all");
  const [todoItems, setTodoItems] = useState([]);
  const [githubItems, setGithubItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const ctx = embedded ? null : useDashboard();

  const items = activeTab === "all" ? todoItems : githubItems;
  const filtered = searchQuery.trim()
    ? items.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.file?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  // Fetch data for active tab
  const fetchTab = useCallback(async (tab) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = tab === "all" ? "/scan/issues" : "/scan/github-issues";
      const data = await api.get(endpoint);
      const issues = data.issues || [];
      if (tab === "all") setTodoItems(issues);
      else setGithubItems(issues);
    } catch (err) {
      setError(err.message || "Failed to scan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const current = activeTab === "all" ? todoItems : githubItems;
    if (current.length === 0) {
      fetchTab(activeTab);
    }
  }, [activeTab]);

  const toggleItem = useCallback((item) => {
    const key = `${item.source}:${item.file}:${item.line}:${item.title}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const itemKey = (item) => `${item.source}:${item.file}:${item.line}:${item.title}`;

  const selectAll = useCallback(() => {
    setSelected(new Set(filtered.map(itemKey)));
  }, [filtered]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  const createIssueFromItem = useCallback(async (item) => {
    const payload = {
      title: item.title,
      description: item.context || item.title,
      labels: item.suggestedLabels || [item.source],
      paths: item.suggestedPaths || (item.file ? [item.file] : []),
    };
    await api.post("/issues/create", payload);
  }, []);

  const handleCreateSingle = useCallback(async (item) => {
    setCreating(true);
    try {
      await createIssueFromItem(item);
      setCreatedCount((c) => c + 1);
      // Remove from selected if it was selected
      const key = itemKey(item);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      // Remove from list
      if (activeTab === "all") {
        setTodoItems((prev) => prev.filter((i) => itemKey(i) !== key));
      } else {
        setGithubItems((prev) => prev.filter((i) => itemKey(i) !== key));
      }
      ctx?.showToast?.("Issue created", "success");
    } catch (err) {
      ctx?.showToast?.(err.message || "Failed to create issue", "error");
    } finally {
      setCreating(false);
    }
  }, [activeTab, ctx, createIssueFromItem]);

  const handleCreateSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setCreating(true);
    let created = 0;
    const selectedItems = filtered.filter((item) => selected.has(itemKey(item)));

    for (const item of selectedItems) {
      try {
        await createIssueFromItem(item);
        created++;
      } catch {
        // continue with remaining
      }
    }

    setCreatedCount((c) => c + created);

    // Remove created items from list
    const createdKeys = new Set(selectedItems.map(itemKey));
    if (activeTab === "all") {
      setTodoItems((prev) => prev.filter((i) => !createdKeys.has(itemKey(i))));
    } else {
      setGithubItems((prev) => prev.filter((i) => !createdKeys.has(itemKey(i))));
    }
    setSelected(new Set());
    setCreating(false);
    ctx?.showToast?.(`${created} issue(s) created`, "success");
  }, [selected, filtered, activeTab, ctx, createIssueFromItem]);

  return (
    <div className={`flex flex-col gap-4 ${embedded ? "" : "p-4 max-w-4xl mx-auto w-full"}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button className="btn btn-ghost btn-sm btn-square" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </button>
        )}
        <div className="flex-1">
          <h2 className={`font-bold ${embedded ? "text-xl" : "text-2xl"}`}>
            {embedded ? "Discover Issues" : "Discover Issues in Codebase"}
          </h2>
          {!embedded && (
            <p className="text-sm text-base-content/60 mt-0.5">
              Scan your code for TODOs, FIXMEs, and import GitHub issues
            </p>
          )}
        </div>
        {createdCount > 0 && (
          <div className="badge badge-success gap-1">
            <Plus className="size-3" /> {createdCount} created
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <div role="tablist" className="tabs tabs-boxed tabs-sm flex-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = tab.id === "all" ? todoItems.length : githubItems.length;
            return (
              <button
                key={tab.id}
                role="tab"
                className={`tab gap-1.5 ${activeTab === tab.id ? "tab-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="size-3.5" />
                {tab.label}
                {count > 0 && <span className="badge badge-xs">{count}</span>}
              </button>
            );
          })}
        </div>
        <button
          className="btn btn-ghost btn-sm btn-square"
          onClick={() => fetchTab(activeTab)}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Search + bulk actions */}
      <div className="flex items-center gap-2">
        <label className="input input-sm input-bordered flex items-center gap-2 flex-1">
          <Search className="size-3.5 opacity-50" />
          <input
            type="text"
            className="grow"
            placeholder="Filter by title, file, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>

        {filtered.length > 0 && (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs" onClick={selectAll}>
              All
            </button>
            <button className="btn btn-ghost btn-xs" onClick={selectNone}>
              None
            </button>
          </div>
        )}

        {selected.size > 0 && (
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={handleCreateSelected}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Create {selected.size} issue{selected.size !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Content */}
      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-base-content/50">
            {activeTab === "all" ? "Scanning codebase for TODOs..." : "Fetching GitHub issues..."}
          </p>
        </div>
      ) : error ? (
        <div className="alert alert-warning">
          <AlertTriangle className="size-4" />
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => fetchTab(activeTab)}>
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 opacity-50">
          {activeTab === "all" ? (
            <FileCode className="size-10" />
          ) : (
            <Github className="size-10" />
          )}
          <p className="text-sm">
            {items.length === 0
              ? activeTab === "all"
                ? "No TODOs or FIXMEs found in your codebase"
                : "No open GitHub issues found"
              : "No items match your search"
            }
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-base-content/40">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""} found
            {selected.size > 0 && ` \u00b7 ${selected.size} selected`}
          </p>
          {filtered.map((item, idx) => (
            <DiscoveredIssueCard
              key={`${item.source}-${item.file}-${item.line}-${idx}`}
              item={item}
              selected={selected.has(itemKey(item))}
              onToggle={toggleItem}
              onCreateSingle={handleCreateSingle}
              creating={creating}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Lightweight version for the onboarding wizard (no DashboardContext dependency)
export function DiscoveredIssuesOnboarding({ onIssuesCreated }) {
  const [todoItems, setTodoItems] = useState([]);
  const [githubItems, setGithubItems] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  const items = activeTab === "all" ? todoItems : githubItems;

  const fetchTab = useCallback(async (tab) => {
    setLoading(true);
    try {
      const endpoint = tab === "all" ? "/scan/issues" : "/scan/github-issues";
      const data = await api.get(endpoint);
      if (tab === "all") setTodoItems(data.issues || []);
      else setGithubItems(data.issues || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTab("all");
  }, []);

  useEffect(() => {
    const current = activeTab === "all" ? todoItems : githubItems;
    if (current.length === 0 && activeTab === "github") fetchTab("github");
  }, [activeTab]);

  const itemKey = (item) => `${item.source}:${item.file}:${item.line}:${item.title}`;

  const toggleItem = useCallback((item) => {
    const key = itemKey(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCreateSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setCreating(true);
    let created = 0;
    const selectedItems = items.filter((item) => selected.has(itemKey(item)));

    for (const item of selectedItems) {
      try {
        await api.post("/issues/create", {
          title: item.title,
          description: item.context || item.title,
          labels: item.suggestedLabels || [item.source],
          paths: item.suggestedPaths || (item.file ? [item.file] : []),
        });
        created++;
      } catch { /* continue */ }
    }

    const createdKeys = new Set(selectedItems.map(itemKey));
    if (activeTab === "all") {
      setTodoItems((prev) => prev.filter((i) => !createdKeys.has(itemKey(i))));
    } else {
      setGithubItems((prev) => prev.filter((i) => !createdKeys.has(itemKey(i))));
    }
    setSelected(new Set());
    setCreating(false);
    setCreatedCount((c) => c + created);
    onIssuesCreated?.(created);
  }, [selected, items, activeTab, onIssuesCreated]);

  return (
    <div className="flex flex-col gap-4 stagger-children">
      <div className="text-center">
        <Search className="size-10 text-primary mx-auto mb-3" />
        <h2 className="text-2xl font-bold">Discover Issues</h2>
        <p className="text-base-content/60 mt-1">
          We found items in your codebase that could become issues
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-boxed tabs-sm justify-center">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = tab.id === "all" ? todoItems.length : githubItems.length;
          return (
            <button
              key={tab.id}
              role="tab"
              className={`tab gap-1.5 ${activeTab === tab.id ? "tab-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="size-3.5" />
              {tab.label}
              {count > 0 && <span className="badge badge-xs">{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-8 gap-2">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-base-content/50">Scanning...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 opacity-50">
          <p className="text-sm">
            {activeTab === "all"
              ? "No TODOs or FIXMEs found"
              : "No open GitHub issues found"}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {items.slice(0, 30).map((item, idx) => {
              const key = itemKey(item);
              const isSelected = selected.has(key);
              const badge = SOURCE_BADGE[item.source] || SOURCE_BADGE.todo;

              return (
                <button
                  key={`${key}-${idx}`}
                  className={`flex items-start gap-3 p-3 rounded-lg text-left transition-all duration-100 ${
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-base-200/50 border border-transparent hover:bg-base-200"
                  }`}
                  onClick={() => toggleItem(item)}
                >
                  {isSelected ? (
                    <CheckSquare className="size-4 text-primary mt-0.5 shrink-0" />
                  ) : (
                    <Square className="size-4 opacity-40 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`badge badge-xs ${badge.class}`}>{badge.label}</span>
                      {item.category && (
                        <span className="badge badge-xs badge-ghost">{item.category}</span>
                      )}
                    </div>
                    <p className="text-sm mt-0.5 truncate">{item.title}</p>
                    {item.file && (
                      <p className="text-xs text-base-content/40 truncate mt-0.5">{item.file}:{item.line}</p>
                    )}
                  </div>
                </button>
              );
            })}
            {items.length > 30 && (
              <p className="text-xs text-center text-base-content/40 py-2">
                Showing 30 of {items.length} items. Open the full view in the dashboard.
              </p>
            )}
          </div>

          {/* Bulk action */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setSelected(new Set(items.slice(0, 30).map(itemKey)))}
              >
                Select all
              </button>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>

            <div className="flex items-center gap-2">
              {createdCount > 0 && (
                <span className="badge badge-success badge-sm gap-1">
                  <Plus className="size-3" /> {createdCount}
                </span>
              )}
              {selected.size > 0 && (
                <button
                  className="btn btn-primary btn-sm gap-1"
                  onClick={handleCreateSelected}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Create {selected.size} issue{selected.size !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-center text-base-content/40">
        This step is optional. You can always discover issues later from the dashboard.
      </p>
    </div>
  );
}

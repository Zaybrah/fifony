import { useState, useEffect } from "react";
import { GitBranch, AlertTriangle, CheckCircle, Loader, ShieldCheck, Loader2 } from "lucide-react";
import { api } from "../../../api";

const PROTECTED_BRANCHES = new Set(["main", "master"]);

function GitignoreBanner() {
  const [status, setStatus] = useState(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api.get("/gitignore/status").then(setStatus).catch(() => setStatus({ exists: false, hasFifony: false }));
  }, []);

  if (status === null || status.hasFifony) return null;

  if (added) {
    return (
      <div className="alert alert-success py-2.5 text-sm animate-fade-in">
        <ShieldCheck className="size-4 shrink-0" />
        <span><code>.fifony/</code> added to <code>.gitignore</code></span>
      </div>
    );
  }

  const handleAdd = async () => {
    setAdding(true);
    try {
      await api.post("/gitignore/add");
      setAdded(true);
    } catch {
      // not critical
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="alert alert-warning py-2.5 text-sm">
      <ShieldCheck className="size-4 shrink-0" />
      <div className="flex-1">
        <span><code>.fifony/</code> is not in <code>.gitignore</code></span>
        <span className="text-base-content/50 block text-xs mt-0.5">Fifony stores local runtime data there — do not commit it.</span>
      </div>
      <button className="btn btn-xs btn-warning" onClick={handleAdd} disabled={adding}>
        {adding ? <Loader2 className="size-3 animate-spin" /> : "Add"}
      </button>
    </div>
  );
}

export default function BranchStep({ currentBranch, onBranchCreated }) {
  const [branchName, setBranchName] = useState("develop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const isProtected = PROTECTED_BRANCHES.has(currentBranch);
  const isValidName = /^[a-zA-Z0-9/_.-]+$/.test(branchName.trim()) && branchName.trim().length > 0;

  async function handleCreate() {
    if (!isValidName || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post("/git/branch", { branchName: branchName.trim() });
      if (!res.ok) throw new Error(res.error || "Failed to create branch.");
      setDone(true);
      onBranchCreated?.(branchName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle className="size-12 text-success" />
        <div>
          <p className="text-lg font-semibold">Branch created successfully</p>
          <p className="text-sm opacity-60 mt-1 font-mono">
            Now on <span className="text-primary">{branchName.trim()}</span> — agents will use it as the base branch
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 stagger-children">
      <div className="text-center">
        <GitBranch className="size-10 text-primary mx-auto mb-3" />
        <h2 className="text-2xl font-bold">Working branch</h2>
        <p className="text-base-content/60 mt-1 text-sm">Agents create worktrees from the current branch. We recommend avoiding direct work on main.</p>
      </div>

      <div className="card bg-base-200">
        <div className="card-body p-5 gap-4">
          {/* Branch atual */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-box border border-base-300 bg-base-100">
            <GitBranch className="size-4 opacity-50 shrink-0" />
            <span className="text-sm opacity-50">Branch atual:</span>
            <span className="font-mono text-sm font-semibold">{currentBranch || "—"}</span>
            {isProtected && (
              <span className="badge badge-warning badge-sm ml-auto shrink-0">protected</span>
            )}
          </div>

          {/* Warning when on protected branch */}
          {isProtected && (
            <div className="alert alert-warning py-3">
              <AlertTriangle className="size-4 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Working directly on <span className="font-mono">{currentBranch}</span></p>
                <p className="opacity-80 mt-0.5">In protected-branch teams, local merges are rejected. Create a working branch or use Push PR mode.</p>
              </div>
            </div>
          )}

          {/* Create a new branch */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Create a new branch now</label>
            <div className="flex gap-2">
              <label className="input input-bordered flex items-center gap-2 flex-1">
                <GitBranch className="size-3.5 opacity-40" />
                <input
                  type="text"
                  className="grow font-mono text-sm"
                  value={branchName}
                  onChange={(e) => { setBranchName(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="develop"
                  disabled={busy}
                />
              </label>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!isValidName || busy}
              >
                {busy ? <Loader className="size-4 animate-spin" /> : "Create"}
              </button>
            </div>
            {error && (
              <p className="text-xs text-error flex items-center gap-1">
                <AlertTriangle className="size-3" /> {error}
              </p>
            )}
            <p className="text-xs opacity-40">Equivalent to: <span className="font-mono">git checkout -b {branchName.trim() || "develop"}</span></p>
          </div>

          <GitignoreBanner />
        </div>
      </div>
    </div>
  );
}

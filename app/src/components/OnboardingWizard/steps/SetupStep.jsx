import { useState, useEffect } from "react";
import {
  FolderRoot, GitBranch, AlertTriangle, CheckCircle, Loader,
  ShieldCheck, Loader2, Sparkles, PencilLine, GitMerge,
} from "lucide-react";
import { api } from "../../../api";
import { buildQueueTitle, normalizeProjectName } from "../../../project-meta.js";

const PROTECTED_BRANCHES = new Set(["main", "master"]);

function GitignoreBanner() {
  const [status, setStatus] = useState(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api.get("/gitignore/status")
      .then(setStatus)
      .catch(() => setStatus({ exists: false, hasFifony: false }));
  }, []);

  if (status === null || status.hasFifony) return null;

  if (added) {
    return (
      <div className="alert alert-success py-2.5 text-sm animate-fade-in">
        <ShieldCheck className="size-4 shrink-0" />
        <span><code>.fifony/</code> adicionado ao <code>.gitignore</code></span>
      </div>
    );
  }

  return (
    <div className="alert alert-warning py-2.5 text-sm">
      <ShieldCheck className="size-4 shrink-0" />
      <div className="flex-1">
        <span><code>.fifony/</code> não está no <code>.gitignore</code></span>
        <span className="text-base-content/50 block text-xs mt-0.5">O fifony guarda estado local lá — não deve ser commitado.</span>
      </div>
      <button
        className="btn btn-xs btn-warning"
        onClick={async () => {
          setAdding(true);
          try { await api.post("/gitignore/add"); setAdded(true); } catch { /* not critical */ }
          finally { setAdding(false); }
        }}
        disabled={adding}
      >
        {adding ? <Loader2 className="size-3 animate-spin" /> : "Adicionar"}
      </button>
    </div>
  );
}

function BranchCard({ currentBranch, onBranchCreated }) {
  // Git status
  const [gitStatus, setGitStatus] = useState(null); // null = loading
  const [initBusy, setInitBusy] = useState(false);
  const [initError, setInitError] = useState(null);
  const [activeBranch, setActiveBranch] = useState(currentBranch);

  useEffect(() => {
    api.get("/git/status")
      .then((data) => {
        setGitStatus(data);
        if (data.branch) setActiveBranch(data.branch);
      })
      .catch(() => setGitStatus({ isGit: true, branch: currentBranch, hasCommits: true }));
  }, []);

  // Branch creation
  const [branchName, setBranchName] = useState("develop");
  const [busy, setBusy] = useState(false);
  const [branchError, setBranchError] = useState(null);
  const [branchDone, setBranchDone] = useState(false);

  const isGit = gitStatus === null || gitStatus.isGit;
  const isProtected = PROTECTED_BRANCHES.has(activeBranch);
  const isValidBranchName = /^[a-zA-Z0-9/_.-]+$/.test(branchName.trim()) && branchName.trim().length > 0;

  async function handleGitInit() {
    setInitBusy(true);
    setInitError(null);
    try {
      const res = await api.post("/git/init", {});
      if (!res.ok) throw new Error(res.error || "Failed to initialize git.");
      setGitStatus({ isGit: true, branch: res.branch, hasCommits: true });
      setActiveBranch(res.branch);
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    } finally {
      setInitBusy(false);
    }
  }

  async function handleCreateBranch() {
    if (!isValidBranchName || busy) return;
    setBusy(true);
    setBranchError(null);
    try {
      const res = await api.post("/git/branch", { branchName: branchName.trim() });
      if (!res.ok) throw new Error(res.error || "Failed to create branch.");
      setBranchDone(true);
      onBranchCreated?.(branchName.trim());
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-base-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <GitBranch className="size-4 text-primary" />
        <div className="text-sm font-semibold">Working branch</div>
      </div>
      <p className="text-xs text-base-content/50 -mt-2">
        Agents create worktrees based on the current branch. We recommend not working directly on main.
      </p>

      {/* Not a git repo */}
      {gitStatus !== null && !gitStatus.isGit && (
        <div className="flex flex-col gap-3">
          <div className="alert alert-warning py-3">
            <GitMerge className="size-4 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Not a git repository</p>
              <p className="opacity-80 mt-0.5">fifony requires git to create agent worktrees. Initialize one here.</p>
            </div>
          </div>
          {initError && (
            <p className="text-xs text-error flex items-center gap-1">
              <AlertTriangle className="size-3" /> {initError}
            </p>
          )}
          <button className="btn btn-primary gap-2 self-start" onClick={handleGitInit} disabled={initBusy}>
            {initBusy ? <Loader2 className="size-4 animate-spin" /> : <GitMerge className="size-4" />}
            Initialize git repository
          </button>
        </div>
      )}

      {/* Git initialized */}
      {isGit && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-box border border-base-300 bg-base-100">
            <GitBranch className="size-4 opacity-50 shrink-0" />
            <span className="text-sm opacity-50">Current branch:</span>
            <span className="font-mono text-sm font-semibold">
              {activeBranch || (gitStatus === null ? "…" : "—")}
            </span>
            {isProtected && (
              <span className="badge badge-warning badge-sm ml-auto shrink-0">protected</span>
            )}
          </div>

          {isProtected && (
            <div className="alert alert-warning py-3">
              <AlertTriangle className="size-4 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Working directly on <span className="font-mono">{activeBranch}</span></p>
                <p className="opacity-80 mt-0.5">In teams with protected branches, local merges are rejected. Create a working branch or use Push PR mode.</p>
              </div>
            </div>
          )}

          {branchDone ? (
            <div className="alert alert-success py-3 text-sm">
              <CheckCircle className="size-4 shrink-0" />
              <div>
                <p className="font-semibold">Branch created successfully</p>
                <p className="opacity-75 font-mono mt-0.5">
                  Now on <span className="text-success-content">{branchName.trim()}</span> — agents will use this as the base branch
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Create a new branch now</label>
              <div className="flex gap-2">
                <label className="input input-bordered flex items-center gap-2 flex-1">
                  <GitBranch className="size-3.5 opacity-40" />
                  <input
                    type="text"
                    className="grow font-mono text-sm"
                    value={branchName}
                    onChange={(e) => { setBranchName(e.target.value); setBranchError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateBranch()}
                    placeholder="develop"
                    disabled={busy}
                  />
                </label>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateBranch}
                  disabled={!isValidBranchName || busy}
                >
                  {busy ? <Loader className="size-4 animate-spin" /> : "Create"}
                </button>
              </div>
              {branchError && (
                <p className="text-xs text-error flex items-center gap-1">
                  <AlertTriangle className="size-3" /> {branchError}
                </p>
              )}
              <p className="text-xs opacity-40">
                Equivalent to: <span className="font-mono">git checkout -b {branchName.trim() || "develop"}</span>
              </p>
            </div>
          )}

          <GitignoreBanner />
        </div>
      )}
    </div>
  );
}

function SetupStep({
  projectName, setProjectName,
  detectedProjectName, projectSource, workspacePath,
  currentBranch, onBranchCreated,
}) {
  const normalizedProjectName = normalizeProjectName(projectName);
  const queueTitle = buildQueueTitle(normalizedProjectName || detectedProjectName);

  const effectiveSource = normalizedProjectName
    ? projectSource === "saved" || projectSource === "detected" ? projectSource : "manual"
    : detectedProjectName ? "detected" : "missing";

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="text-center space-y-3">
        <div className="inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
          <FolderRoot className="size-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Set up your workspace</h2>
          <p className="text-base-content/60 max-w-xl mx-auto text-sm">
            Name your project and configure the working branch
          </p>
        </div>
      </div>

      {/* Project name card */}
      <div className="bg-base-200 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Project name</div>
            <div className="text-xs text-base-content/50">This becomes the default queue title for future runs.</div>
          </div>
          {effectiveSource === "saved" && (
            <span className="badge badge-primary badge-soft gap-1.5"><Sparkles className="size-3" />Saved configuration</span>
          )}
          {effectiveSource === "detected" && (
            <span className="badge badge-secondary badge-soft gap-1.5"><Sparkles className="size-3" />Detected automatically</span>
          )}
          {effectiveSource === "manual" && (
            <span className="badge badge-accent badge-soft gap-1.5"><PencilLine className="size-3" />Edited manually</span>
          )}
          {effectiveSource === "missing" && (
            <span className="badge badge-warning badge-soft gap-1.5"><AlertTriangle className="size-3" />Manual entry required</span>
          )}
        </div>

        <label className="form-control w-full gap-2">
          <span className="label-text text-sm font-medium">Project</span>
          <input
            type="text"
            className="input input-bordered w-full text-base"
            placeholder={detectedProjectName || "Enter your project name"}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={(e) => {
              const nextValue = normalizeProjectName(e.target.value);
              if (nextValue !== projectName) setProjectName(nextValue);
            }}
          />
        </label>

        {workspacePath && (
          <div className="text-xs text-base-content/50 break-all">Workspace: {workspacePath}</div>
        )}

        {!detectedProjectName && !normalizedProjectName && (
          <div className="alert alert-warning text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            <span>We could not detect a project name from the current directory. Enter one to continue.</span>
          </div>
        )}

        <div className="rounded-xl border border-base-300/70 bg-base-100 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-base-content/40">Queue title preview</div>
          <div className="mt-1.5 text-base font-semibold tracking-tight break-words">{queueTitle}</div>
        </div>
      </div>

      <BranchCard currentBranch={currentBranch} onBranchCreated={onBranchCreated} />
    </div>
  );
}

export default SetupStep;

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildRuntimeState, createIssueFromPayload } from "../src/domains/issues.ts";
import { deriveConfig } from "../src/domains/config.ts";

const HAS_NODE_SQLITE = await import("node:sqlite").then(() => true).catch(() => false);

describe("linear issue metadata", () => {
  it("hydrates imported Linear metadata onto created issues", () => {
    const issue = createIssueFromPayload({
      id: "issue-linear-1",
      identifier: "#101",
      title: "Imported issue",
      description: "From Linear",
      linearIssueId: "lin-101",
      linearIdentifier: "ABC-101",
      linearUrl: "https://linear.app/example/issue/ABC-101/imported-issue",
      linearTeamId: "team-1",
      linearProjectId: "project-1",
      linearSyncedAt: "2026-05-01T10:00:00.000Z",
    }, []);

    assert.equal(issue.linearIssueId, "lin-101");
    assert.equal(issue.linearIdentifier, "ABC-101");
    assert.equal(issue.linearUrl, "https://linear.app/example/issue/ABC-101/imported-issue");
    assert.equal(issue.linearTeamId, "team-1");
    assert.equal(issue.linearProjectId, "project-1");
    assert.equal(issue.linearSyncedAt, "2026-05-01T10:00:00.000Z");
  });

  it("keeps legacy issues valid when Linear metadata is absent", () => {
    const state = buildRuntimeState({
      startedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      trackerKind: "filesystem",
      sourceRepoUrl: "/tmp/demo",
      sourceRef: "workspace",
      config: deriveConfig([]),
      milestones: [],
      issues: [{
        id: "legacy-1",
        identifier: "#1",
        title: "Legacy",
        description: "",
        state: "Planning",
        labels: [],
        blockedBy: [],
        assignedToWorker: true,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
        history: [],
        attempts: 0,
        maxAttempts: 3,
        planVersion: 0,
        executeAttempt: 0,
        reviewAttempt: 0,
      }],
      events: [],
      metrics: { total: 0, planning: 0, queued: 0, inProgress: 0, blocked: 0, done: 0, merged: 0, cancelled: 0, activeWorkers: 0 },
      notes: [],
      variables: [],
    }, deriveConfig([]));

    assert.equal(state.issues[0].linearIssueId, undefined);
    assert.equal(state.issues[0].linearUrl, undefined);
  });

  (HAS_NODE_SQLITE ? it : it.skip)("persists Linear metadata through the local store round-trip", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "fifony-linear-store-"));
    const workspaceRoot = join(tempRoot, "workspace");
    const persistenceRoot = join(tempRoot, ".fifony");
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(persistenceRoot, { recursive: true });

    const previousEnv = {
      FIFONY_WORKSPACE_ROOT: process.env.FIFONY_WORKSPACE_ROOT,
      FIFONY_PERSISTENCE: process.env.FIFONY_PERSISTENCE,
      FIFONY_BOOTSTRAP_ROOT: process.env.FIFONY_BOOTSTRAP_ROOT,
    };

    process.env.FIFONY_WORKSPACE_ROOT = workspaceRoot;
    process.env.FIFONY_PERSISTENCE = persistenceRoot;
    process.env.FIFONY_BOOTSTRAP_ROOT = persistenceRoot;

    let closeStateStore = null;

    try {
      const store = await import("../src/persistence/store.ts");

      closeStateStore = store.closeStateStore;
      await store.initStateStore();

      const state = buildRuntimeState(null, deriveConfig([]));
      state.issues = [createIssueFromPayload({
        id: "issue-linear-2",
        identifier: "#102",
        title: "Persist me",
        linearIssueId: "lin-102",
        linearIdentifier: "ABC-102",
        linearUrl: "https://linear.app/example/issue/ABC-102/persist-me",
        linearTeamId: "team-2",
        linearProjectId: "project-2",
        linearSyncedAt: "2026-05-01T11:00:00.000Z",
      }, [])];

      store.markIssueDirty("issue-linear-2");
      await store.persistState(state);
      await store.closeStateStore();

      await store.initStateStore();
      const reloaded = await store.loadPersistedState();
      const issue = reloaded?.issues.find((entry) => entry.id === "issue-linear-2");

      assert.ok(issue);
      assert.equal(issue?.linearIssueId, "lin-102");
      assert.equal(issue?.linearIdentifier, "ABC-102");
      assert.equal(issue?.linearUrl, "https://linear.app/example/issue/ABC-102/persist-me");
      assert.equal(issue?.linearTeamId, "team-2");
      assert.equal(issue?.linearProjectId, "project-2");
      assert.equal(issue?.linearSyncedAt, "2026-05-01T11:00:00.000Z");
    } finally {
      if (closeStateStore) {
        await closeStateStore().catch(() => {});
      }
      if (previousEnv.FIFONY_WORKSPACE_ROOT === undefined) delete process.env.FIFONY_WORKSPACE_ROOT;
      else process.env.FIFONY_WORKSPACE_ROOT = previousEnv.FIFONY_WORKSPACE_ROOT;
      if (previousEnv.FIFONY_PERSISTENCE === undefined) delete process.env.FIFONY_PERSISTENCE;
      else process.env.FIFONY_PERSISTENCE = previousEnv.FIFONY_PERSISTENCE;
      if (previousEnv.FIFONY_BOOTSTRAP_ROOT === undefined) delete process.env.FIFONY_BOOTSTRAP_ROOT;
      else process.env.FIFONY_BOOTSTRAP_ROOT = previousEnv.FIFONY_BOOTSTRAP_ROOT;

      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
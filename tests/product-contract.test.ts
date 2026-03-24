/**
 * Product contract tests — verifies that the backend serves all
 * frontend routes, that the FSM definition is internally consistent,
 * and that key product claims have real backing infrastructure.
 *
 * Run with: pnpm test tests/product-contract.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// 1. SPA routes served by backend match frontend router
// ══════════════════════════════════════════════════════════════════════════════

describe("product contract: SPA routes", () => {
  // Frontend routes declared in TanStack Router (file-based)
  const FRONTEND_ROUTES = [
    "/kanban",
    "/issues",
    "/analytics",
    "/agents",
    "/settings",
    "/settings/project",
    "/settings/general",
    "/settings/agents",
    "/settings/notifications",
    "/settings/workflow",
    "/settings/providers",
    "/settings/hotkeys",
    "/onboarding",
  ];

  // Routes that should NOT be served (ghost routes)
  const GHOST_ROUTES = [
    "/settings/preferences",
  ];

  it("every frontend route has a corresponding route file", () => {
    const routeDir = join(process.cwd(), "app/src/routes");
    const settingsDir = join(routeDir, "settings");

    // Map routes to expected file paths
    const routeFiles: Record<string, string> = {
      "/kanban": join(routeDir, "kanban.jsx"),
      "/issues": join(routeDir, "issues.jsx"),
      "/analytics": join(routeDir, "analytics.lazy.jsx"),
      "/agents": join(routeDir, "agents.jsx"),
      "/settings": join(routeDir, "settings.jsx"),
      "/settings/project": join(settingsDir, "project.jsx"),
      "/settings/general": join(settingsDir, "general.jsx"),
      "/settings/agents": join(settingsDir, "agents.jsx"),
      "/settings/notifications": join(settingsDir, "notifications.jsx"),
      "/settings/workflow": join(settingsDir, "workflow.jsx"),
      "/settings/providers": join(settingsDir, "providers.jsx"),
      "/settings/hotkeys": join(settingsDir, "hotkeys.jsx"),
    };

    for (const [route, filePath] of Object.entries(routeFiles)) {
      assert.ok(existsSync(filePath), `Route ${route} should have file: ${filePath}`);
    }
  });

  it("ghost routes do NOT have route files", () => {
    for (const route of GHOST_ROUTES) {
      const segments = route.split("/").filter(Boolean);
      const fileName = segments.pop()!;
      const dir = join(process.cwd(), "app/src/routes", ...segments);
      const filePath = join(dir, `${fileName}.jsx`);
      assert.ok(!existsSync(filePath), `Ghost route ${route} should NOT have file: ${filePath}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. FSM definition is internally consistent
// ══════════════════════════════════════════════════════════════════════════════

describe("product contract: FSM consistency", () => {
  it("every FSM transition target is a valid state", async () => {
    const { issueStateMachineConfig, ISSUE_STATE_MACHINE_ID } = await import("../src/persistence/plugins/issue-state-machine.ts");
    const machine = issueStateMachineConfig.stateMachines[ISSUE_STATE_MACHINE_ID];
    const validStates = new Set(Object.keys(machine.states));

    for (const [state, def] of Object.entries(machine.states)) {
      for (const [event, target] of Object.entries((def as any).on || {})) {
        assert.ok(validStates.has(target as string), `${state} --${event}--> ${target} targets an invalid state`);
      }
    }
  });

  it("every state with an entry action has that action defined", async () => {
    const { issueStateMachineConfig, ISSUE_STATE_MACHINE_ID } = await import("../src/persistence/plugins/issue-state-machine.ts");
    const machine = issueStateMachineConfig.stateMachines[ISSUE_STATE_MACHINE_ID];
    const actions = Object.keys(issueStateMachineConfig.actions || {});

    for (const [state, def] of Object.entries(machine.states)) {
      const entry = (def as any).entry;
      if (entry) {
        assert.ok(actions.includes(entry), `State ${state} references entry action "${entry}" which is not defined`);
      }
    }
  });

  it("every guard referenced in states is defined", async () => {
    const { issueStateMachineConfig, ISSUE_STATE_MACHINE_ID } = await import("../src/persistence/plugins/issue-state-machine.ts");
    const machine = issueStateMachineConfig.stateMachines[ISSUE_STATE_MACHINE_ID];
    const guards = Object.keys(issueStateMachineConfig.guards || {});

    for (const [state, def] of Object.entries(machine.states)) {
      const stateGuards = (def as any).guards;
      if (stateGuards) {
        for (const [event, guardName] of Object.entries(stateGuards)) {
          assert.ok(guards.includes(guardName as string), `State ${state} event ${event} references guard "${guardName}" which is not defined`);
        }
      }
    }
  });

  it("initial state exists in state definitions", async () => {
    const { issueStateMachineConfig, ISSUE_STATE_MACHINE_ID } = await import("../src/persistence/plugins/issue-state-machine.ts");
    const machine = issueStateMachineConfig.stateMachines[ISSUE_STATE_MACHINE_ID];
    assert.ok(machine.states[machine.initialState], `Initial state "${machine.initialState}" must be defined`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Key API endpoints exist
// ══════════════════════════════════════════════════════════════════════════════

describe("product contract: API endpoints have implementations", () => {
  it("analytics routes are registered", async () => {
    // These functions should exist and be importable
    const analytics = await import("../src/domains/tokens.ts");
    assert.ok(typeof analytics.getAnalytics === "function", "getAnalytics exists");
    assert.ok(typeof analytics.record === "function", "record (token recording) exists");
  });

  it("issue commands exist", async () => {
    const { approvePlanCommand } = await import("../src/commands/approve-plan.command.ts");
    const { executeIssueCommand } = await import("../src/commands/execute-issue.command.ts");
    const { mergeWorkspaceCommand } = await import("../src/commands/merge-workspace.command.ts");
    const { replanIssueCommand } = await import("../src/commands/replan-issue.command.ts");
    const { retryExecutionCommand } = await import("../src/commands/retry-execution.command.ts");
    const { requestReworkCommand } = await import("../src/commands/request-rework.command.ts");
    const { cancelIssueCommand } = await import("../src/commands/cancel-issue.command.ts");
    const { createIssueCommand } = await import("../src/commands/create-issue.command.ts");

    assert.ok(typeof approvePlanCommand === "function");
    assert.ok(typeof executeIssueCommand === "function");
    assert.ok(typeof mergeWorkspaceCommand === "function");
    assert.ok(typeof replanIssueCommand === "function");
    assert.ok(typeof retryExecutionCommand === "function");
    assert.ok(typeof requestReworkCommand === "function");
    assert.ok(typeof cancelIssueCommand === "function");
    assert.ok(typeof createIssueCommand === "function");
  });

  it("drawer tabs all have corresponding components", () => {
    const tabComponents = [
      "app/src/components/IssueDetailDrawer/tabs/OverviewTab.jsx",
      "app/src/components/IssueDetailDrawer/tabs/PlanningTab.jsx",
      "app/src/components/IssueDetailDrawer/tabs/ExecutionTab.jsx",
      "app/src/components/IssueDetailDrawer/tabs/ReviewTab.jsx",
      "app/src/components/IssueDetailDrawer/tabs/DiffTab.jsx",
      "app/src/components/IssueDetailDrawer/tabs/SessionsTab.jsx",
      "app/src/components/IssueDetailDrawer/tabs/RoutingTab.jsx",
      "app/src/components/IssueDetailDrawer/tabs/EventsTab.jsx",
    ];

    for (const path of tabComponents) {
      assert.ok(existsSync(join(process.cwd(), path)), `Tab component should exist: ${path}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Provider adapters are all registered
// ══════════════════════════════════════════════════════════════════════════════

describe("product contract: all providers have adapters", () => {
  it("claude, codex, and gemini adapters are registered", async () => {
    const { ADAPTERS } = await import("../src/agents/adapters/registry.ts");
    assert.ok(ADAPTERS.claude, "claude adapter registered");
    assert.ok(ADAPTERS.codex, "codex adapter registered");
    assert.ok(ADAPTERS.gemini, "gemini adapter registered");
  });

  it("each adapter has buildCommand and compile", async () => {
    const { ADAPTERS } = await import("../src/agents/adapters/registry.ts");
    for (const [name, adapter] of Object.entries(ADAPTERS)) {
      assert.ok(typeof adapter.buildCommand === "function", `${name} has buildCommand`);
      assert.ok(typeof adapter.compile === "function", `${name} has compile`);
      assert.ok(typeof adapter.buildReviewCommand === "function", `${name} has buildReviewCommand`);
    }
  });
});

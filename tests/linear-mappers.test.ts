import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLinearImportDraft, buildLinearIssueFilter, mapLinearIssue } from "../src/integrations/linear/mappers.ts";

describe("linear issue mapping", () => {
  it("maps a Linear issue response into the normalized summary shape", () => {
    const issue = mapLinearIssue({
      id: "lin-issue-1",
      identifier: "ABC-123",
      title: "Import me",
      description: "Linear markdown body",
      priority: 2,
      url: "https://linear.app/example/issue/ABC-123/import-me",
      updatedAt: "2026-05-01T10:00:00.000Z",
      team: { id: "team-1", key: "ABC", name: "Core" },
      project: { id: "project-1", name: "Roadmap", state: "started", icon: "rocket" },
      state: { id: "state-1", name: "In Progress", type: "started", color: "#333333" },
      labels: {
        nodes: [
          { id: "label-1", name: "Bug", color: "#ff0000" },
          { id: "label-2", name: "Frontend", color: "#00ff00" },
        ],
      },
    });

    assert.deepEqual(issue, {
      id: "lin-issue-1",
      identifier: "ABC-123",
      title: "Import me",
      description: "Linear markdown body",
      priority: 2,
      priorityLabel: "High",
      url: "https://linear.app/example/issue/ABC-123/import-me",
      updatedAt: "2026-05-01T10:00:00.000Z",
      team: { id: "team-1", key: "ABC", name: "Core" },
      project: { id: "project-1", name: "Roadmap", state: "started", icon: "rocket" },
      state: { id: "state-1", name: "In Progress", type: "started", color: "#333333" },
      labels: [
        { id: "label-1", name: "Bug", color: "#ff0000" },
        { id: "label-2", name: "Frontend", color: "#00ff00" },
      ],
    });
  });

  it("builds the create-draft payload from a normalized issue", () => {
    const issue = mapLinearIssue({
      id: "lin-issue-2",
      identifier: "ABC-124",
      title: "Imported draft",
      description: "",
      priority: 1,
      url: "https://linear.app/example/issue/ABC-124/imported-draft",
      team: { id: "team-1", key: "ABC", name: "Core" },
      project: { id: "project-2", name: "UX", state: "planned", icon: null },
      state: { id: "state-1", name: "Todo", type: "unstarted", color: null },
      labels: { nodes: [{ id: "label-1", name: "Bug", color: null }] },
    });

    assert.ok(issue);
    const draft = buildLinearImportDraft(issue);

    assert.deepEqual(draft, {
      title: "Imported draft",
      description: "",
      labels: ["Bug"],
      priority: 1,
      priorityLabel: "Urgent",
      linearIssueId: "lin-issue-2",
      linearIdentifier: "ABC-124",
      linearUrl: "https://linear.app/example/issue/ABC-124/imported-draft",
      linearTeamId: "team-1",
      linearProjectId: "project-2",
    });
  });
});

describe("linear issue filters", () => {
  it("builds a combined filter for text, team, project, label, and status", () => {
    assert.deepEqual(buildLinearIssueFilter({
      query: "login",
      teamId: "team-1",
      projectId: "project-1",
      label: "Bug",
      status: "In Progress",
    }), {
      team: { id: { eq: "team-1" } },
      project: { id: { eq: "project-1" } },
      labels: { name: { eqIgnoreCase: "Bug" } },
      state: { name: { eqIgnoreCase: "In Progress" } },
      or: [
        { identifier: { eqIgnoreCase: "login" } },
        { title: { containsIgnoreCase: "login" } },
        { description: { containsIgnoreCase: "login" } },
      ],
    });
  });
});
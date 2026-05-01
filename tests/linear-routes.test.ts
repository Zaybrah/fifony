import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerLinearRoutes } from "../src/routes/linear.ts";
import { buildRuntimeState } from "../src/domains/issues.ts";
import { deriveConfig } from "../src/domains/config.ts";
import { setLinearToken } from "../src/domains/linear.ts";

function createCollector() {
  const routes = {};
  return {
    routes,
    get(path, handler) { routes[`GET ${path}`] = handler; },
    post(path, handler) { routes[`POST ${path}`] = handler; },
    put(path, handler) { routes[`PUT ${path}`] = handler; },
    patch() {},
    delete(path, handler) { routes[`DELETE ${path}`] = handler; },
  };
}

function createContext({ params = {}, query = {}, body } = {}) {
  return {
    req: {
      param(name) {
        return params[name];
      },
      query(name) {
        return query[name];
      },
      async json() {
        return body ?? {};
      },
    },
    json(payload, status = 200) {
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    },
    body(payload, status = 200, headers = {}) {
      return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status, headers });
    },
  };
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("linear routes", () => {
  it("reports unconfigured status when no token exists", async () => {
    const state = buildRuntimeState(null, deriveConfig([]));
    const collector = createCollector();
    registerLinearRoutes(collector, state);

    const response = await collector.routes["GET /api/integrations/linear/status"](createContext());
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true, configured: false, tokenPreview: null });
  });

  it("rejects test requests when Linear is not configured", async () => {
    const state = buildRuntimeState(null, deriveConfig([]));
    const collector = createCollector();
    registerLinearRoutes(collector, state);

    const response = await collector.routes["POST /api/integrations/linear/test"](createContext());
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.match(payload.error, /not configured/i);
  });

  it("returns normalized issues and passes filters through to the Linear query", async () => {
    const state = buildRuntimeState(null, deriveConfig([]));
    setLinearToken(state, "lin_api_test_token");
    const collector = createCollector();
    registerLinearRoutes(collector, state);

    let requestBody = null;
    global.fetch = async (_url, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({
        data: {
          issues: {
            nodes: [{
              id: "lin-1",
              identifier: "ABC-123",
              title: "Login fails",
              description: "Imported from Linear",
              priority: 2,
              url: "https://linear.app/example/issue/ABC-123/login-fails",
              updatedAt: "2026-05-01T12:00:00.000Z",
              team: { id: "team-1", key: "ABC", name: "Core" },
              project: { id: "project-1", name: "Core App", state: "started", icon: null },
              state: { id: "state-1", name: "In Progress", type: "started", color: null },
              labels: { nodes: [{ id: "label-1", name: "Bug", color: null }] },
            }],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const response = await collector.routes["GET /api/integrations/linear/issues"](createContext({
      query: {
        query: "login",
        teamId: "team-1",
        projectId: "project-1",
        status: "In Progress",
        label: "Bug",
      },
    }));
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.issues.length, 1);
    assert.equal(payload.issues[0].identifier, "ABC-123");
    assert.equal(requestBody.variables.filter.team.id.eq, "team-1");
    assert.equal(requestBody.variables.filter.project.id.eq, "project-1");
    assert.equal(requestBody.variables.filter.labels.name.eqIgnoreCase, "Bug");
    assert.equal(requestBody.variables.filter.state.name.eqIgnoreCase, "In Progress");
    assert.equal(requestBody.variables.filter.or[1].title.containsIgnoreCase, "login");
  });

  it("returns a normalized import draft for a selected issue", async () => {
    const state = buildRuntimeState(null, deriveConfig([]));
    setLinearToken(state, "lin_api_test_token");
    const collector = createCollector();
    registerLinearRoutes(collector, state);

    global.fetch = async () => new Response(JSON.stringify({
      data: {
        issue: {
          id: "lin-2",
          identifier: "ABC-124",
          title: "Draft me",
          description: "Bring this into Fifony",
          priority: 1,
          url: "https://linear.app/example/issue/ABC-124/draft-me",
          team: { id: "team-1", key: "ABC", name: "Core" },
          project: { id: "project-2", name: "Workspace", state: "planned", icon: null },
          state: { id: "state-1", name: "Backlog", type: "unstarted", color: null },
          labels: { nodes: [{ id: "label-1", name: "Bug", color: null }] },
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });

    const response = await collector.routes["GET /api/integrations/linear/issues/:id"](createContext({ params: { id: "ABC-124" } }));
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.issue.identifier, "ABC-124");
    assert.deepEqual(payload.draft, {
      title: "Draft me",
      description: "Bring this into Fifony",
      labels: ["Bug"],
      priority: 1,
      priorityLabel: "Urgent",
      linearIssueId: "lin-2",
      linearIdentifier: "ABC-124",
      linearUrl: "https://linear.app/example/issue/ABC-124/draft-me",
      linearTeamId: "team-1",
      linearProjectId: "project-2",
    });
  });
});
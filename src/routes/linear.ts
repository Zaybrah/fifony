import type { RuntimeState } from "../types.ts";
import type { RouteRegistrar } from "./http.ts";
import { clearLinearToken, getLinearToken, maskLinearToken, setLinearToken } from "../domains/linear.ts";
import { upsertVariableInVaulter, deleteVariableFromVaulter } from "../persistence/vaulter.ts";
import { LinearClient, LinearClientError } from "../integrations/linear/client.ts";
import { LINEAR_TOKEN_ID } from "../domains/linear.ts";

function getErrorPayload(error: unknown): { status: number; body: { ok: false; error: string; code?: string; retryAt?: number } } {
  if (error instanceof LinearClientError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.message,
        code: error.code,
        retryAt: error.retryAt,
      },
    };
  }
  return {
    status: 500,
    body: {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    },
  };
}

function getSavedLinearTokenOrThrow(state: RuntimeState): string {
  const token = getLinearToken(state);
  if (!token) {
    throw new LinearClientError("Linear is not configured. Add an API token first.", {
      status: 400,
      code: "LINEAR_NOT_CONFIGURED",
    });
  }
  return token;
}

function getLinearClient(state: RuntimeState, tokenOverride?: string): LinearClient {
  const token = tokenOverride?.trim() || getSavedLinearTokenOrThrow(state);
  return new LinearClient(token);
}

export function registerLinearRoutes(app: RouteRegistrar, state: RuntimeState): void {
  app.get("/api/integrations/linear/status", async (c) => {
    const token = getLinearToken(state);
    return c.json({
      ok: true,
      configured: Boolean(token),
      tokenPreview: maskLinearToken(token),
    });
  });

  app.put("/api/integrations/linear/token", async (c) => {
    try {
      const payload = await c.req.json() as { token?: unknown };
      const token = typeof payload.token === "string" ? payload.token.trim() : "";
      if (!token) {
        return c.json({ ok: false, error: "Linear API token is required." }, 400);
      }
      const entry = setLinearToken(state, token);
      await upsertVariableInVaulter(entry);
      return c.json({ ok: true, configured: true, tokenPreview: maskLinearToken(token) });
    } catch (error) {
      const result = getErrorPayload(error);
      return c.json(result.body, result.status);
    }
  });

  app.delete("/api/integrations/linear/token", async (c) => {
    try {
      clearLinearToken(state);
      await deleteVariableFromVaulter(LINEAR_TOKEN_ID);
      return c.json({ ok: true, configured: false, tokenPreview: null });
    } catch (error) {
      const result = getErrorPayload(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/api/integrations/linear/test", async (c) => {
    try {
      const payload = await c.req.json().catch(() => ({})) as { token?: unknown };
      const tokenOverride = typeof payload.token === "string" ? payload.token.trim() : undefined;
      const client = getLinearClient(state, tokenOverride);
      const viewer = await client.fetchViewer();
      return c.json({ ok: true, configured: true, viewer });
    } catch (error) {
      const result = getErrorPayload(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/api/integrations/linear/teams", async (c) => {
    try {
      const limit = Number.parseInt(c.req.query("limit") || "50", 10);
      const client = getLinearClient(state);
      const teams = await client.listTeams(Number.isFinite(limit) ? limit : 50);
      return c.json({ ok: true, teams });
    } catch (error) {
      const result = getErrorPayload(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/api/integrations/linear/projects", async (c) => {
    try {
      const limit = Number.parseInt(c.req.query("limit") || "50", 10);
      const teamId = c.req.query("teamId") || undefined;
      const client = getLinearClient(state);
      const projects = await client.listProjects(teamId, Number.isFinite(limit) ? limit : 50);
      return c.json({ ok: true, projects });
    } catch (error) {
      const result = getErrorPayload(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/api/integrations/linear/issues", async (c) => {
    try {
      const limit = Number.parseInt(c.req.query("limit") || "20", 10);
      const client = getLinearClient(state);
      const issues = await client.listIssues({
        query: c.req.query("query") || undefined,
        teamId: c.req.query("teamId") || undefined,
        projectId: c.req.query("projectId") || undefined,
        label: c.req.query("label") || undefined,
        status: c.req.query("status") || undefined,
        limit: Number.isFinite(limit) ? limit : 20,
      });
      return c.json({ ok: true, issues });
    } catch (error) {
      const result = getErrorPayload(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/api/integrations/linear/issues/:id", async (c) => {
    try {
      const id = c.req.param("id");
      if (!id) {
        return c.json({ ok: false, error: "Linear issue id is required." }, 400);
      }
      const client = getLinearClient(state);
      const { issue, draft } = await client.buildImportDraft(id);
      return c.json({ ok: true, issue, draft });
    } catch (error) {
      const result = getErrorPayload(error);
      return c.json(result.body, result.status);
    }
  });
}
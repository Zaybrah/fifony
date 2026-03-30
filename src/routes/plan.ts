import type { RuntimeState } from "../types.ts";
import { logger } from "../concerns/logger.ts";
import { toStringValue } from "../concerns/helpers.ts";
import type { RouteRegistrar } from "./http.ts";
import { addEvent } from "../domains/issues.ts";
import { mutateIssueState } from "../routes/helpers.ts";
import {
  generatePlan,
  generatePlanInBackground,
  refinePlanInBackground,
  loadPlanningSession,
  savePlanningInput,
  clearPlanningSession,
} from "../agents/planning/issue-planner.ts";
import { enhanceIssueField } from "../agents/planning/issue-enhancer.ts";
import { chatWithIssue } from "../agents/planning/issue-chat.ts";

export function registerPlanRoutes(
  app: RouteRegistrar,
  state: RuntimeState,
): void {
  app.get("/api/planning/session", async (c) => {
    const session = await loadPlanningSession();
    return c.json({ ok: true, session });
  });

  app.post("/api/planning/save", async (c) => {
    try {
      const payload = await c.req.json() as Record<string, unknown>;
      const title = toStringValue(payload.title);
      const description = toStringValue(payload.description);
      const session = await savePlanningInput(title, description);
      return c.json({ ok: true, session });
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post("/api/planning/generate", async (c) => {
    try {
      const payload = await c.req.json() as Record<string, unknown>;
      const title = toStringValue(payload.title);
      const description = toStringValue(payload.description);
      if (!title) return c.json({ ok: false, error: "Title is required." }, 400);
      logger.info({ title: title.slice(0, 80) }, "[API] POST /api/planning/generate");
      const result = await generatePlan(title, description, state.config, null);
      return c.json({ ok: true, plan: result.plan, usage: result.usage });
    } catch (error) {
      logger.error({ err: error }, `Plan generation failed: ${String(error)}`);
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post("/api/planning/clear", async (c) => {
    await clearPlanningSession();
    return c.json({ ok: true });
  });

  // Legacy alias
  app.post("/api/issues/plan", async (c) => {
    try {
      const payload = await c.req.json() as Record<string, unknown>;
      const title = toStringValue(payload.title);
      const description = toStringValue(payload.description);
      if (!title) return c.json({ ok: false, error: "Title is required." }, 400);
      const result = await generatePlan(title, description, state.config, null);
      return c.json({ ok: true, plan: result.plan, usage: result.usage });
    } catch (error) {
      logger.error({ err: error }, `Plan generation failed: ${String(error)}`);
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post("/api/issues/:id/plan", async (c) => {
    return mutateIssueState(state, c, async (issue) => {
      if (issue.state !== "Planning") {
        throw new Error(`Cannot plan issue in state ${issue.state}. Must be in Planning.`);
      }
      if (issue.planningStatus === "planning") {
        throw new Error("Planning already running in worker slot.");
      }
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const fast = body.fast === true;

      // Fire-and-forget — plan runs in background, updates via WS
      generatePlanInBackground(state, issue, { fast });

      addEvent(state, issue.id, "progress", `${fast ? "Fast plan" : "Plan"} generation started for ${issue.identifier}.`);
    });
  });

  app.post("/api/issues/:id/plan/refine", async (c) => {
    return mutateIssueState(state, c, async (issue) => {
      if (issue.state !== "Planning") {
        throw new Error(`Cannot refine plan for issue in state ${issue.state}. Must be in Planning.`);
      }
      if (!issue.plan) {
        throw new Error("Issue has no plan to refine. Generate a plan first.");
      }
      if (issue.planningStatus === "planning") {
        throw new Error("A plan operation is already in progress for this issue.");
      }
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
      if (!feedback) {
        throw new Error("Feedback message is required.");
      }

      // Fire-and-forget — refinement runs in background, updates via WS
      refinePlanInBackground(state, issue, feedback);

      addEvent(state, issue.id, "progress", `Plan refinement started for ${issue.identifier}.`);
    });
  });

  app.post("/api/issues/enhance", async (c) => {
    try {
      const payload = await c.req.json() as Record<string, unknown>;
      const field = payload.field === "description" ? "description" : payload.field === "title" ? "title" : null;
      if (!field) {
        return c.json({ ok: false, error: 'Invalid field. Expected "title" or "description".' }, 400);
      }

      const title = toStringValue(payload.title);
      const description = toStringValue(payload.description);
      const provider = toStringValue(payload.provider, state.config.agentProvider);
      const issueType = toStringValue(payload.issueType);
      const images = Array.isArray(payload.images) ? payload.images.filter((p: unknown): p is string => typeof p === "string") : undefined;

      const result = await enhanceIssueField(
        { field, title, description, issueType, images, provider },
        state.config,
        null,
      );

      return c.json({ ok: true, field: result.field, value: result.value, provider: result.provider });
    } catch (error) {
      logger.error({ err: error }, `Issue enhance failed: ${String(error)}`);
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/api/issues/:id/chat", async (c) => {
    const issueId = c.req.param("id");
    const issue = state.issues.find((i) => i.id === issueId || i.identifier === issueId);
    if (!issue) {
      return c.json({ ok: false, error: "Issue not found." }, 404);
    }

    try {
      const body = await c.req.json() as Record<string, unknown>;
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) {
        return c.json({ ok: false, error: "Message is required." }, 400);
      }

      const history = Array.isArray(body.history)
        ? body.history.filter(
            (m: unknown): m is { role: "user" | "assistant"; content: string } =>
              typeof m === "object" && m !== null &&
              (((m as Record<string, unknown>).role === "user") || ((m as Record<string, unknown>).role === "assistant")) &&
              typeof (m as Record<string, unknown>).content === "string",
          )
        : undefined;

      const result = await chatWithIssue(
        {
          issueId: issue.id,
          title: issue.title,
          description: issue.description ?? "",
          plan: issue.plan ?? null,
          message,
          history,
        },
        state.config,
      );

      return c.json({ ok: true, response: result.response, provider: result.provider });
    } catch (error) {
      logger.error({ err: error, issueId }, `Issue chat failed: ${String(error)}`);
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });
}

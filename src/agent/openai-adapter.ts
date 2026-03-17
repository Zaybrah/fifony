/**
 * Lightweight OpenAI API adapter for reasoning-only operations.
 *
 * Used when the provider is "codex" but we need structured output (JSON schema)
 * that the Codex CLI doesn't support (no --json-schema, --output-format json, or --print).
 *
 * Calls the OpenAI chat completions API directly via native fetch (Node 23+).
 * No SDK dependency required.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logger } from "./logger.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export type OpenAICallOptions = {
  prompt: string;
  model?: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  reasoningEffort?: string;
  timeoutMs?: number;
};

export type OpenAICallResult = {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
};

// ── Default model discovery ──────────────────────────────────────────────────

/** Read the first available model from Codex CLI's local cache. */
function getDefaultCodexModel(): string {
  const cachePath = join(homedir(), ".codex", "models_cache.json");
  try {
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, "utf8");
      const cache = JSON.parse(raw) as {
        models?: Array<{ slug: string; visibility?: string; priority?: number }>;
      };
      if (Array.isArray(cache.models) && cache.models.length > 0) {
        // Pick the first "list" model sorted by priority (same logic as providers.ts)
        const sorted = [...cache.models]
          .sort((a, b) => {
            const visA = a.visibility === "list" ? 0 : 1;
            const visB = b.visibility === "list" ? 0 : 1;
            if (visA !== visB) return visA - visB;
            return (a.priority ?? 99) - (b.priority ?? 99);
          });
        if (sorted[0]?.slug) return sorted[0].slug;
      }
    }
  } catch {
    // Cache unreadable
  }
  return "o3-mini"; // Safe fallback — widely available reasoning model
}

// ── API call ─────────────────────────────────────────────────────────────────

export async function callOpenAI(options: OpenAICallOptions): Promise<OpenAICallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Required for OpenAI API calls when using Codex provider for reasoning operations.");
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = options.model || getDefaultCodexModel();
  const timeoutMs = options.timeoutMs ?? 1_800_000; // 30 minutes default

  logger.info(
    { model, hasSchema: !!options.jsonSchema, effort: options.reasoningEffort, promptLength: options.prompt.length },
    "[OpenAI Adapter] Starting API call",
  );

  const messages: Array<{ role: string; content: string }> = [
    { role: "user", content: options.prompt },
  ];

  // Build request body
  const body: Record<string, unknown> = {
    model,
    messages,
  };

  // Structured output via json_schema response format
  if (options.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: options.jsonSchema.name,
        schema: options.jsonSchema.schema,
        strict: true,
      },
    };
  }

  // Reasoning effort for o-series models
  if (options.reasoningEffort) {
    const effort = options.reasoningEffort.toLowerCase();
    if (effort === "low" || effort === "medium" || effort === "high") {
      body.reasoning_effort = effort;
    }
  }

  const startMs = Date.now();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(could not read error body)");
    const durationMs = Date.now() - startMs;
    logger.error(
      { status: response.status, durationMs, errorBody: errorBody.slice(0, 500) },
      "[OpenAI Adapter] API call failed",
    );
    throw new Error(`OpenAI API error ${response.status}: ${errorBody.slice(0, 500)}`);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    model?: string;
  };

  const durationMs = Date.now() - startMs;
  const content = data.choices?.[0]?.message?.content ?? "";
  const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";
  const usedModel = data.model ?? model;

  const usage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };

  logger.info(
    {
      model: usedModel,
      finishReason,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      contentLength: content.length,
      durationMs,
    },
    "[OpenAI Adapter] API call completed",
  );

  return { content, usage, model: usedModel };
}

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  AgentProviderDefinition,
  AgentProviderRole,
  DetectedProvider,
  EffortConfig,
  IssueEntry,
  JsonRecord,
  PipelineStageConfig,
  ReasoningEffort,
  RuntimeState,
  WorkflowConfig,
} from "../types.ts";
import { TARGET_ROOT } from "../concerns/constants.ts";
import {
  toStringValue,
  toStringArray,
  toNumberValue,
  getNestedRecord,
  getNestedString,
} from "../concerns/helpers.ts";
import { logger } from "../concerns/logger.ts";
import {
  resolveTaskCapabilities,
  mergeCapabilityProviders,
  type CapabilityResolverOptions,
} from "../routing/capability-resolver.ts";

export function resolveAgentProfile(name: string): { profilePath: string; instructions: string } {
  const normalized = name.trim();
  if (!normalized) return { profilePath: "", instructions: "" };

  const candidates = [
    join(TARGET_ROOT, ".codex", "agents", `${normalized}.md`),
    join(TARGET_ROOT, ".codex", "agents", normalized, "AGENT.md"),
    join(TARGET_ROOT, "agents", `${normalized}.md`),
    join(TARGET_ROOT, "agents", normalized, "AGENT.md"),
    join(homedir(), ".codex", "agents", `${normalized}.md`),
    join(homedir(), ".codex", "agents", normalized, "AGENT.md"),
    join(homedir(), ".claude", "agents", `${normalized}.md`),
    join(homedir(), ".claude", "agents", normalized, "AGENT.md"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return {
      profilePath: candidate,
      instructions: readFileSync(candidate, "utf8").trim(),
    };
  }

  return { profilePath: "", instructions: "" };
}

export function normalizeAgentProvider(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "claude" || normalized === "codex" || normalized === "gemini") return normalized;
  if (!normalized) return "codex";
  return normalized;
}

export function normalizeAgentRole(value: string): AgentProviderRole {
  const normalized = value.trim().toLowerCase();
  if (normalized === "planner" || normalized === "executor" || normalized === "reviewer") {
    return normalized;
  }
  return "executor";
}

export function resolveAgentCommand(
  provider: string,
  explicitCommand: string,
  codexCommand: string,
  claudeCommand: string,
  reasoningEffort?: string,
): string {
  if (explicitCommand.trim()) return explicitCommand.trim();
  if (provider === "claude" && claudeCommand.trim()) return claudeCommand.trim();
  if (provider === "codex" && codexCommand.trim()) return codexCommand.trim();
  return getProviderDefaultCommand(provider, reasoningEffort);
}

/** Resolve the effective reasoning effort for a given role, considering issue override and global defaults. */
export function resolveEffort(
  role: string,
  issueEffort?: EffortConfig,
  globalEffort?: EffortConfig,
): ReasoningEffort | undefined {
  // Issue-level per-role override takes highest priority
  const roleKey = role as keyof EffortConfig;
  if (issueEffort?.[roleKey]) return issueEffort[roleKey];
  // Issue-level default
  if (issueEffort?.default) return issueEffort.default;
  // Global per-role
  if (globalEffort?.[roleKey]) return globalEffort[roleKey];
  // Global default
  return globalEffort?.default;
}

import { ADAPTERS } from "./adapters/registry.ts";
import { CLAUDE_RESULT_SCHEMA } from "./adapters/commands.ts";

export function getProviderDefaultCommand(provider: string, reasoningEffort?: string, model?: string): string {
  const adapter = ADAPTERS[provider];
  if (!adapter) return "";
  // Claude needs a JSON schema in its default command; pass effort for all providers
  const jsonSchema = provider === "claude" ? CLAUDE_RESULT_SCHEMA : undefined;
  return adapter.buildCommand({ model, effort: reasoningEffort, jsonSchema });
}

let cachedProviders: DetectedProvider[] | null = null;
let providersCachedAt = 0;
const PROVIDER_CACHE_TTL = 60_000;

export function detectAvailableProviders(): DetectedProvider[] {
  if (cachedProviders && Date.now() - providersCachedAt < PROVIDER_CACHE_TTL) {
    return cachedProviders;
  }

  const providers: DetectedProvider[] = [];

  for (const name of ["claude", "codex", "gemini"]) {
    try {
      const path = execFileSync("which", [name], { encoding: "utf8", timeout: 5000 }).trim();
      providers.push({ name, available: true, path });
    } catch {
      providers.push({ name, available: false, path: "" });
    }
  }

  cachedProviders = providers;
  providersCachedAt = Date.now();
  return providers;
}

export function invalidateProviderCache(): void {
  cachedProviders = null;
  providersCachedAt = 0;
}

// ── Model discovery (delegated to model-discovery.ts) ────────────────────────

export type { DiscoveredModel } from "./model-discovery.ts";
export { discoverModels } from "./model-discovery.ts";

export function readCodexConfig(): { model?: string; reasoningEffort?: string } {
  try {
    const configPath = join(homedir(), ".codex", "config.toml");
    if (!existsSync(configPath)) return {};
    const raw = readFileSync(configPath, "utf8");
    const model = raw.match(/^model\s*=\s*"([^"]+)"/m)?.[1];
    const reasoningEffort = raw.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/m)?.[1];
    return { model, reasoningEffort };
  } catch {
    return {};
  }
}

export function readGeminiConfig(): { model?: string; previewFeatures?: boolean } {
  try {
    const settingsPath = join(homedir(), ".gemini", "settings.json");
    if (!existsSync(settingsPath)) return {};
    const raw = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw) as {
      model?: string;
      general?: { previewFeatures?: boolean };
    };
    return {
      model: typeof settings.model === "string" ? settings.model : undefined,
      previewFeatures: settings.general?.previewFeatures === true,
    };
  } catch {
    return {};
  }
}

export function resolveDefaultProvider(detected: DetectedProvider[]): string {
  const available = detected.filter((p) => p.available);
  if (available.length === 0) return "";
  if (available.some((p) => p.name === "codex")) return "codex";
  return available[0].name;
}

export function resolveWorkflowAgentProviders(
  config: JsonRecord,
  fallbackProvider: string,
  fallbackProfile: string,
  explicitCommand: string,
): AgentProviderDefinition[] {
  const agentConfig = getNestedRecord(config, "agent");
  const codexConfig = getNestedRecord(config, "codex");
  const claudeConfig = getNestedRecord(config, "claude");
  const providersRaw = (agentConfig.providers ?? []) as unknown;
  const providers: AgentProviderDefinition[] = [];

  if (Array.isArray(providersRaw)) {
    for (const entry of providersRaw) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as JsonRecord;
      const provider = normalizeAgentProvider(
        toStringValue(record.provider) || toStringValue(record.name) || fallbackProvider,
      );
      const role = normalizeAgentRole(toStringValue(record.role, "executor"));
      const profile = toStringValue(record.profile, role === "executor" ? fallbackProfile : "");
      const resolvedProfile = resolveAgentProfile(profile);
      const command = resolveAgentCommand(
        provider,
        toStringValue(record.command),
        getNestedString(codexConfig, "command"),
        getNestedString(claudeConfig, "command"),
      );

      providers.push({
        provider,
        role,
        command,
        profile,
        profilePath: resolvedProfile.profilePath,
        profileInstructions: resolvedProfile.instructions,
      });
    }
  }

  if (providers.length > 0) return providers;

  const resolvedProfile = resolveAgentProfile(fallbackProfile);
  return [
    {
      provider: fallbackProvider,
      role: "executor",
      command: resolveAgentCommand(
        fallbackProvider,
        explicitCommand,
        getNestedString(codexConfig, "command"),
        getNestedString(claudeConfig, "command"),
      ),
      profile: fallbackProfile,
      profilePath: resolvedProfile.profilePath,
      profileInstructions: resolvedProfile.instructions,
    },
  ];
}

export function getBaseAgentProviders(
  state: RuntimeState,
): AgentProviderDefinition[] {
  return [
    {
      provider: state.config.agentProvider,
      role: "executor",
      command: state.config.agentCommand,
      profile: "",
      profilePath: "",
      profileInstructions: "",
    },
  ];
}

export function getCapabilityRoutingOptions(): CapabilityResolverOptions {
  // Provider/model/effort overrides from user settings are applied via
  // applyWorkflowConfigToProviders after capability classification.
  return { enabled: true, overrides: [] };
}

export function getCapabilityPriorityMap(): Record<string, number> {
  return {
    security: 0,
    bugfix: 1,
    backend: 2,
    devops: 3,
    "frontend-ui": 4,
    architecture: 5,
    documentation: 6,
    default: 7,
    "workflow-disabled": 8,
  };
}

export function getIssueCapabilityPriority(
  issue: IssueEntry,
  _workflowDefinition: null,
): number {
  const category = issue.capabilityCategory?.trim() || "default";
  const priorities = getCapabilityPriorityMap();
  return priorities[category] ?? 100;
}

export function applyCapabilityMetadata(
  issue: IssueEntry,
  resolution: ReturnType<typeof resolveTaskCapabilities>,
): void {
  issue.capabilityCategory = resolution.category;
  issue.capabilityOverlays = [...resolution.overlays];
  issue.capabilityRationale = [...resolution.rationale];

  const baseLabels = (issue.labels ?? []).filter((label) => !label.startsWith("capability:") && !label.startsWith("overlay:"));
  const derivedLabels = [
    resolution.category ? `capability:${resolution.category}` : "",
    ...resolution.overlays.map((overlay) => `overlay:${overlay}`),
  ].filter(Boolean);

  issue.labels = [...new Set([...baseLabels, ...derivedLabels])];
}

/** Map AgentProviderRole to WorkflowConfig stage key */
function roleToStageKey(role: AgentProviderRole): keyof WorkflowConfig {
  switch (role) {
    case "planner": return "plan";
    case "executor": return "execute";
    case "reviewer": return "review";
  }
}

/**
 * Apply user's WorkflowConfig (from Settings → Workflow) to provider definitions.
 * Overrides provider, model, and effort for each role when a WorkflowConfig is present.
 */
export function applyWorkflowConfigToProviders(
  providers: AgentProviderDefinition[],
  workflowConfig: WorkflowConfig | null,
): AgentProviderDefinition[] {
  if (!workflowConfig) return providers;

  return providers.map((provider) => {
    const stageKey = roleToStageKey(provider.role);
    const stageConfig: PipelineStageConfig | undefined = workflowConfig[stageKey];
    if (!stageConfig) return provider;

    const newProvider = stageConfig.provider || provider.provider;
    const newModel = stageConfig.model || undefined;
    const newEffort = stageConfig.effort || provider.reasoningEffort;

    // Rebuild command with the configured provider, model, and effort
    const command = getProviderDefaultCommand(newProvider, newEffort, newModel);

    return {
      ...provider,
      provider: newProvider,
      model: newModel,
      command: command || provider.command,
      reasoningEffort: newEffort,
    };
  });
}

export function getEffectiveAgentProviders(
  state: RuntimeState,
  issue: IssueEntry,
  _workflowDefinition: null,
  workflowConfig?: WorkflowConfig | null,
): AgentProviderDefinition[] {
  const baseProviders = getBaseAgentProviders(state);
  const resolution = resolveTaskCapabilities(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      labels: issue.labels,
      paths: issue.paths,
    },
    getCapabilityRoutingOptions(),
  );
  applyCapabilityMetadata(issue, resolution);

  const merged = mergeCapabilityProviders(baseProviders, resolution).map((provider) => {
    const resolvedProfile = resolveAgentProfile(provider.profile ?? "");
    const suggestion = resolution.providers.find(
      (entry) => entry.provider === provider.provider && entry.role === provider.role,
    );

    const effort = resolveEffort(provider.role, issue.effort, state.config.defaultEffort);

    // Keep existing command (effort is metadata, not a CLI flag)
    const command = provider.command;

    return {
      ...provider,
      command,
      profilePath: resolvedProfile.profilePath,
      profileInstructions: resolvedProfile.instructions,
      selectionReason: suggestion?.reason ?? resolution.rationale.join(" "),
      overlays: resolution.overlays,
      capabilityCategory: resolution.category,
      reasoningEffort: effort,
    };
  });

  // Apply user's WorkflowConfig overrides (Settings → Workflow)
  return applyWorkflowConfigToProviders(merged, workflowConfig ?? null);
}

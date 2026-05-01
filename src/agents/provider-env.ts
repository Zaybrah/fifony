import type { VariableEntry } from "../types.ts";

const EXACT_PROVIDER_ENV_KEYS = new Set([
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "CEREBRAS_API_KEY",
  "DEEPSEEK_API_KEY",
  "FIREWORKS_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLOUD_PROJECT",
  "GROQ_API_KEY",
  "HF_TOKEN",
  "KIMI_API_KEY",
  "MINIMAX_API_KEY",
  "MINIMAX_CN_API_KEY",
  "MISTRAL_API_KEY",
  "OPENAI_API_KEY",
  "OPENCODE_API_KEY",
  "OPENROUTER_API_KEY",
  "PI_CACHE_RETENTION",
  "PI_CODING_AGENT_DIR",
  "PI_CODING_AGENT_SESSION_DIR",
  "PI_OFFLINE",
  "PI_PACKAGE_DIR",
  "PI_SKIP_VERSION_CHECK",
  "PI_TELEMETRY",
  "XAI_API_KEY",
  "ZAI_API_KEY",
]);

const PROVIDER_ENV_PREFIXES = [
  "AWS_",
  "AZURE_OPENAI_",
  "CLOUDFLARE_",
  "GOOGLE_",
  "PI_",
] as const;

export function isProviderEnvKey(key: string): boolean {
  if (!key) return false;
  if (EXACT_PROVIDER_ENV_KEYS.has(key)) return true;
  return PROVIDER_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function resolveProviderSecretEnvFromVariables(variables?: VariableEntry[]): Record<string, string> {
  if (!variables?.length) return {};

  return Object.fromEntries(
    variables
      .filter((entry) => entry.scope === "global" && isProviderEnvKey(entry.key) && entry.value)
      .map((entry) => [entry.key, entry.value]),
  );
}
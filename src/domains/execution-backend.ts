import type { ExecutionBackendKind, RuntimeConfig } from "../types.ts";

export const EXECUTION_BACKENDS: readonly ExecutionBackendKind[] = [
  "host",
  "ai-jail",
  "docker",
  "sandcastle",
];

export function normalizeExecutionBackend(value: unknown): ExecutionBackendKind | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EXECUTION_BACKENDS.includes(normalized as ExecutionBackendKind)
    ? normalized as ExecutionBackendKind
    : null;
}

/**
 * Resolve the canonical execution backend from the new explicit setting plus
 * the legacy booleans that already exist in persisted settings.
 */
export function resolveExecutionBackend(config: Pick<RuntimeConfig, "executionBackend" | "dockerExecution" | "sandboxExecution">): ExecutionBackendKind {
  if (config.executionBackend === "sandcastle") return "sandcastle";
  if (config.executionBackend === "docker") return "docker";
  if (config.executionBackend === "ai-jail") return "ai-jail";
  if (config.dockerExecution) return "docker";
  if (config.sandboxExecution) return "ai-jail";
  return "host";
}

/**
 * Apply a backend selection while preserving backward compatibility with the
 * existing dockerExecution/sandboxExecution runtime flags.
 */
export function applyExecutionBackendSelection<T extends Pick<RuntimeConfig, "executionBackend" | "dockerExecution" | "sandboxExecution">>(
  config: T,
  backend: ExecutionBackendKind,
): T {
  config.executionBackend = backend;
  config.dockerExecution = backend === "docker";
  config.sandboxExecution = backend === "ai-jail";
  return config;
}

export function describeExecutionBackend(config: Pick<RuntimeConfig, "executionBackend" | "dockerExecution" | "sandboxExecution">): string {
  const backend = resolveExecutionBackend(config);
  if (backend === "host") return "host process in the issue execution workspace";
  if (backend === "ai-jail") return "ai-jail local sandbox around the issue execution workspace";
  if (backend === "docker") return "Docker container mounted over the issue execution workspace";
  return "Sandcastle-managed sandbox provider";
}

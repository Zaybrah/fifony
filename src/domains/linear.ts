import type { IssueEntry, RuntimeState, VariableEntry } from "../types.ts";

export const LINEAR_TOKEN_KEY = "LINEAR_API_TOKEN";
export const LINEAR_TOKEN_SCOPE = "global";
export const LINEAR_TOKEN_ID = `${LINEAR_TOKEN_SCOPE}:${LINEAR_TOKEN_KEY}`;

function nowIso(): string {
  return new Date().toISOString();
}

export function getLinearTokenEntry(state: RuntimeState): VariableEntry | null {
  return (state.variables ?? []).find((entry) => entry.id === LINEAR_TOKEN_ID) ?? null;
}

export function getLinearToken(state: RuntimeState): string | null {
  const token = getLinearTokenEntry(state)?.value?.trim();
  return token ? token : null;
}

export function setLinearToken(state: RuntimeState, token: string): VariableEntry {
  const entry: VariableEntry = {
    id: LINEAR_TOKEN_ID,
    key: LINEAR_TOKEN_KEY,
    value: token,
    scope: LINEAR_TOKEN_SCOPE,
    updatedAt: nowIso(),
  };
  const variables = state.variables ?? [];
  const index = variables.findIndex((item) => item.id === entry.id);
  if (index >= 0) variables[index] = entry;
  else variables.push(entry);
  state.variables = variables;
  return entry;
}

export function clearLinearToken(state: RuntimeState): void {
  state.variables = (state.variables ?? []).filter((entry) => entry.id !== LINEAR_TOKEN_ID);
}

export async function loadPersistedLinearToken(): Promise<string | null> {
  const { loadAllFromVaulter } = await import("../persistence/vaulter.ts");
  const variables = await loadAllFromVaulter();
  const token = variables.find((entry) => entry.id === LINEAR_TOKEN_ID)?.value?.trim();
  return token ? token : null;
}

export function maskLinearToken(token: string | null | undefined): string | null {
  const trimmed = token?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(4, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

export function formatLinearImportComment(issue: IssueEntry): string {
  return `Imported into Fifony as ${issue.identifier}: ${issue.title}`;
}

export function formatLinearMergeComment(issue: IssueEntry): string {
  const lines = [`Fifony issue ${issue.identifier} was merged.`];
  if (issue.prUrl) {
    lines.push(`PR: ${issue.prUrl}`);
  } else if (issue.mergedReason) {
    lines.push(issue.mergedReason);
  }
  return lines.join("\n");
}
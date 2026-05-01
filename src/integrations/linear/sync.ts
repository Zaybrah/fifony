import { toBooleanValue } from "../../concerns/helpers.ts";
import type { IssueEntry, RuntimeSettingRecord, RuntimeState } from "../../types.ts";
import { formatLinearImportComment, formatLinearMergeComment, getLinearToken, loadPersistedLinearToken } from "../../domains/linear.ts";
import { LinearClient, LinearClientError } from "./client.ts";
import { loadRuntimeSettings } from "../../persistence/settings.ts";

export const SETTING_ID_LINEAR_SYNC_ON_IMPORT = "integrations.linear.syncOnImportComment";
export const SETTING_ID_LINEAR_SYNC_ON_MERGE = "integrations.linear.syncOnMergeComment";

function getBooleanSetting(settings: RuntimeSettingRecord[], settingId: string, fallback = false): boolean {
  const entry = settings.find((setting) => setting.id === settingId);
  return toBooleanValue(entry?.value, fallback);
}

async function shouldSync(settingId: string): Promise<boolean> {
  return getBooleanSetting(await loadRuntimeSettings(), settingId, false);
}

async function resolveToken(state?: RuntimeState): Promise<string> {
  const fromState = state ? getLinearToken(state) : null;
  if (fromState) return fromState;
  const persisted = await loadPersistedLinearToken();
  if (persisted) return persisted;
  throw new LinearClientError("Linear sync is enabled but no API token is configured.", {
    status: 400,
    code: "LINEAR_NOT_CONFIGURED",
  });
}

export async function maybeSyncLinearImportComment(issue: IssueEntry, state: RuntimeState): Promise<boolean> {
  if (!issue.linearIssueId) return false;
  if (!(await shouldSync(SETTING_ID_LINEAR_SYNC_ON_IMPORT))) return false;
  const client = new LinearClient(await resolveToken(state));
  await client.commentOnIssue(issue.linearIssueId, formatLinearImportComment(issue));
  issue.linearSyncedAt = new Date().toISOString();
  return true;
}

export async function maybeSyncLinearMergeComment(issue: IssueEntry, state?: RuntimeState): Promise<boolean> {
  if (!issue.linearIssueId) return false;
  if (!(await shouldSync(SETTING_ID_LINEAR_SYNC_ON_MERGE))) return false;
  const client = new LinearClient(await resolveToken(state));
  await client.commentOnIssue(issue.linearIssueId, formatLinearMergeComment(issue));
  issue.linearSyncedAt = new Date().toISOString();
  return true;
}
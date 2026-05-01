import { DatabaseSync } from "node:sqlite";
import type { RuntimeSettingRecord, RuntimeSettingScope, RuntimeSettingSource } from "../types.ts";

type PersistedSettingsObjectRow = {
  key: string;
  metadata: string;
  last_modified: string;
};

const SETTINGS_DATA_PREFIXES = [
  "resource=settings\\data\\id=",
  "resource=settings/data/id=",
] as const;

const VALID_SETTING_SCOPES = new Set<RuntimeSettingScope>(["runtime", "providers", "ui", "system"]);
const VALID_SETTING_SOURCES = new Set<RuntimeSettingSource>(["user", "detected", "workflow", "system"]);

function extractSettingIdFromObjectKey(key: string): string | null {
  for (const prefix of SETTINGS_DATA_PREFIXES) {
    if (key.startsWith(prefix)) {
      const id = key.slice(prefix.length).trim();
      return id ? id : null;
    }
  }
  return null;
}

function parseSettingValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  if (
    trimmed === "true"
    || trimmed === "false"
    || trimmed === "null"
    || /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)
    || ((trimmed.startsWith("{") || trimmed.startsWith("["))
      && (trimmed.endsWith("}") || trimmed.endsWith("]")))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }

  return raw;
}

export function decodePersistedSettingObjectRows(rows: PersistedSettingsObjectRow[]): RuntimeSettingRecord[] {
  const byId = new Map<string, RuntimeSettingRecord>();

  for (const row of rows) {
    const id = extractSettingIdFromObjectKey(row.key);
    if (!id) continue;

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      continue;
    }

    const scope = typeof metadata["1"] === "string" ? metadata["1"] : "";
    const source = typeof metadata["3"] === "string" ? metadata["3"] : "user";
    if (!VALID_SETTING_SCOPES.has(scope as RuntimeSettingScope)) continue;
    if (!VALID_SETTING_SOURCES.has(source as RuntimeSettingSource)) continue;

    byId.set(id, {
      id,
      scope: scope as RuntimeSettingScope,
      value: parseSettingValue(metadata["2"]),
      source: source as RuntimeSettingSource,
      updatedAt: row.last_modified,
    });
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function loadPersistedSettingsFromObjectsTable(databasePath: string): RuntimeSettingRecord[] {
  const db = new DatabaseSync(databasePath, { readonly: true });

  try {
    const rows = db.prepare(
      `SELECT key, metadata, last_modified
       FROM objects
       WHERE bucket = ?
         AND (key LIKE ? OR key LIKE ?)
       ORDER BY last_modified ASC`,
    ).all(
      "s3db",
      "resource=settings\\data\\id=%",
      "resource=settings/data/id=%",
    ) as PersistedSettingsObjectRow[];

    return decodePersistedSettingObjectRows(rows);
  } finally {
    db.close();
  }
}
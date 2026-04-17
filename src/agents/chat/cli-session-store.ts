/**
 * Persistent CLI session ids per chat key.
 *
 * Stored as flat JSON files at `.fifony/chat-sessions/cli-{key}.json`.
 * Keys are arbitrary stable strings — `global-chat`, `issue-{id}`, etc.
 *
 * The actual conversation transcript is owned by the CLI itself (claude
 * stores in ~/.claude/sessions/, codex in ~/.codex/sessions/). We only
 * persist the pointer so the next chat turn can resume.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_ROOT } from "../../concerns/constants.ts";
import { now } from "../../concerns/helpers.ts";

const CHAT_DIR = join(STATE_ROOT, "chat-sessions");

export interface CliSessionRecord {
  key: string;
  provider: string;
  sessionId: string;
  updatedAt: string;
}

function ensureDir(): void {
  mkdirSync(CHAT_DIR, { recursive: true });
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function recordPath(key: string): string {
  return join(CHAT_DIR, `cli-${safeKey(key)}.json`);
}

export function loadCliSession(key: string): CliSessionRecord | null {
  const path = recordPath(key);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CliSessionRecord>;
    if (!parsed || typeof parsed.sessionId !== "string" || typeof parsed.provider !== "string") return null;
    return {
      key,
      provider: parsed.provider,
      sessionId: parsed.sessionId,
      updatedAt: parsed.updatedAt || now(),
    };
  } catch {
    return null;
  }
}

export function saveCliSession(record: Omit<CliSessionRecord, "updatedAt">): void {
  ensureDir();
  const persisted: CliSessionRecord = { ...record, updatedAt: now() };
  writeFileSync(recordPath(record.key), JSON.stringify(persisted, null, 2), "utf8");
}

export function clearCliSession(key: string): void {
  try { rmSync(recordPath(key), { force: true }); } catch { /* ignore */ }
}

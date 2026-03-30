import type { ChatSessionMeta, ChatTurn } from "../../types.ts";
import { getAgentSessionResource } from "../../persistence/store.ts";
import { now } from "../../concerns/helpers.ts";
import { logger } from "../../concerns/logger.ts";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { STATE_ROOT } from "../../concerns/constants.ts";

const CHAT_PREFIX = "chat-";
const CHAT_DIR = join(STATE_ROOT, "chat-sessions");

function ensureChatDir(): void {
  mkdirSync(CHAT_DIR, { recursive: true });
}

function sessionPath(id: string): string {
  return join(CHAT_DIR, `${id}.json`);
}

function newSessionId(): string {
  return `${CHAT_PREFIX}${randomUUID()}`;
}

export async function createChatSession(
  provider: string,
  name?: string,
): Promise<ChatSessionMeta> {
  ensureChatDir();
  const id = newSessionId();
  const ts = now();
  const session: ChatSessionMeta = {
    id,
    name: name || `Chat ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    status: "active",
    provider,
    turns: [],
    createdAt: ts,
    updatedAt: ts,
  };

  writeFileSync(sessionPath(id), JSON.stringify(session), "utf8");
  logger.debug({ id, name: session.name }, "[Chat] Session created");
  return session;
}

export async function loadChatSession(id: string): Promise<ChatSessionMeta | null> {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const session = JSON.parse(raw) as ChatSessionMeta;
    session.id = id;
    return session;
  } catch {
    return null;
  }
}

export async function persistChatSession(session: ChatSessionMeta): Promise<void> {
  ensureChatDir();
  session.updatedAt = now();
  writeFileSync(sessionPath(session.id), JSON.stringify(session), "utf8");
}

export async function listChatSessions(): Promise<ChatSessionMeta[]> {
  ensureChatDir();
  try {
    const files = readdirSync(CHAT_DIR).filter((f) => f.startsWith(CHAT_PREFIX) && f.endsWith(".json"));
    const sessions: ChatSessionMeta[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(CHAT_DIR, file), "utf8");
        const session = JSON.parse(raw) as ChatSessionMeta;
        if (session.status === "archived") continue;
        session.id = file.replace(".json", "");
        sessions.push(session);
      } catch { /* skip corrupt files */ }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    logger.warn({ err }, "[Chat] Failed to list sessions");
    return [];
  }
}

export async function deleteChatSession(id: string): Promise<boolean> {
  const path = sessionPath(id);
  try {
    rmSync(path, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function appendTurn(session: ChatSessionMeta, turn: Omit<ChatTurn, "timestamp">): void {
  session.turns.push({
    ...turn,
    timestamp: now(),
  });
}

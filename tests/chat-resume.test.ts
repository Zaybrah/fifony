import { test } from "node:test";
import assert from "node:assert/strict";

import { buildClaudeCommand } from "../src/agents/adapters/claude.ts";
import { buildCodexCommand } from "../src/agents/adapters/codex.ts";
import { buildGeminiCommand } from "../src/agents/adapters/gemini.ts";
import { extractSessionId } from "../src/agents/chat/session-id.ts";

// ── Claude ─────────────────────────────────────────────────────────────────

test("claude: --session-id is added when sessionId option provided", () => {
  const cmd = buildClaudeCommand({ sessionId: "11111111-2222-3333-4444-555555555555" });
  assert.match(cmd, /--session-id 11111111-2222-3333-4444-555555555555/);
  assert.doesNotMatch(cmd, /--no-session-persistence/);
});

test("claude: --resume is added when resumeSessionId option provided", () => {
  const cmd = buildClaudeCommand({ resumeSessionId: "abcdefab-1234-5678-9abc-def012345678" });
  assert.match(cmd, /--resume abcdefab-1234-5678-9abc-def012345678/);
  assert.doesNotMatch(cmd, /--no-session-persistence/);
});

test("claude: defaults to --no-session-persistence when no session opts", () => {
  const cmd = buildClaudeCommand({});
  assert.match(cmd, /--no-session-persistence/);
  assert.doesNotMatch(cmd, /--session-id|--resume/);
});

test("claude: --resume takes precedence over --session-id when both passed", () => {
  const cmd = buildClaudeCommand({
    resumeSessionId: "rrrrrrrr-1111-2222-3333-444444444444",
    sessionId: "ssssssss-1111-2222-3333-444444444444",
  });
  assert.match(cmd, /--resume rrrrrrrr-/);
  assert.doesNotMatch(cmd, /--session-id ssssssss-/);
});

test("claude: model is passed when provided", () => {
  const cmd = buildClaudeCommand({ model: "claude-haiku-4-5" });
  assert.match(cmd, /--model claude-haiku-4-5/);
});

test("claude: effort 'minimal' is propagated", () => {
  const cmd = buildClaudeCommand({ effort: "minimal" });
  assert.match(cmd, /--effort minimal/);
});

// ── Codex ──────────────────────────────────────────────────────────────────

test("codex: resume uses 'resume <id> -' subcommand layout when resumeSessionId set", () => {
  const cmd = buildCodexCommand({ resumeSessionId: "deadbeef-1234-5678-9abc-def012345678" });
  assert.match(cmd, /codex exec/);
  assert.match(cmd, /resume deadbeef-1234-5678-9abc-def012345678 -/);
  // stdin redirection still present
  assert.match(cmd, /< "\$FIFONY_PROMPT_FILE"/);
});

test("codex: no resume positional when resumeSessionId is absent", () => {
  const cmd = buildCodexCommand({});
  assert.doesNotMatch(cmd, /\bresume\b/);
});

test("codex: model and effort propagate alongside resume", () => {
  const cmd = buildCodexCommand({
    resumeSessionId: "deadbeef-1234-5678-9abc-def012345678",
    model: "gpt-5-mini",
    effort: "minimal",
  });
  assert.match(cmd, /--model gpt-5-mini/);
  assert.match(cmd, /reasoning_effort="minimal"/);
});

// ── Gemini ─────────────────────────────────────────────────────────────────

test("gemini: --resume is added when resumeSessionId option provided", () => {
  const cmd = buildGeminiCommand({ resumeSessionId: "latest" });
  assert.match(cmd, /--resume latest/);
});

test("gemini: no --resume when not requested", () => {
  const cmd = buildGeminiCommand({});
  assert.doesNotMatch(cmd, /--resume/);
});

// ── Session id extraction ──────────────────────────────────────────────────

test("extractSessionId: claude JSON output", () => {
  const raw = JSON.stringify({ session_id: "11111111-2222-3333-4444-555555555555", result: "hi" });
  assert.equal(extractSessionId("claude", raw), "11111111-2222-3333-4444-555555555555");
});

test("extractSessionId: claude inline match works on partial JSON", () => {
  const raw = `pre noise\n"session_id":"abcdefab-1234-5678-9abc-def012345678" trailing`;
  assert.equal(extractSessionId("claude", raw), "abcdefab-1234-5678-9abc-def012345678");
});

test("extractSessionId: codex 'session id:' line (case-insensitive)", () => {
  const raw = `model: gpt-5-mini\nsession id: abcdefab-1111-2222-3333-444444444444\nuser\nhi\n`;
  assert.equal(extractSessionId("codex", raw), "abcdefab-1111-2222-3333-444444444444");
});

test("extractSessionId: returns null on output with no id", () => {
  assert.equal(extractSessionId("codex", "just plain text, nothing to see"), null);
});

test("extractSessionId: empty input returns null", () => {
  assert.equal(extractSessionId("claude", ""), null);
});

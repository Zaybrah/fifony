/**
 * Per-provider session-id extraction from raw CLI output.
 *
 * Each provider exposes the session id differently:
 *   - claude `--output-format json` → { "session_id": "<uuid>", "result": "..." }
 *   - codex prints `session id: <uuid>` on stdout (or `Session ID: ...`)
 *   - gemini may print a session line; not guaranteed across versions.
 *
 * Returning null is fine — the caller falls back to no-resume on the next turn.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractSessionId(provider: string, raw: string): string | null {
  if (!raw) return null;

  if (provider === "claude") {
    // Try JSON-wrapped output first
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed && typeof parsed === "object" && typeof parsed.session_id === "string") {
        return parsed.session_id;
      }
    } catch { /* fallthrough */ }
    const inline = raw.match(/"session_id"\s*:\s*"([^"]+)"/);
    if (inline) return inline[1];
  }

  if (provider === "codex") {
    const labelled = raw.match(/session\s*id\s*:\s*([0-9a-f-]{8,})/i);
    if (labelled) {
      const candidate = labelled[1];
      if (UUID_RE.test(candidate)) return candidate.match(UUID_RE)![0];
      return candidate;
    }
  }

  if (provider === "gemini") {
    const labelled = raw.match(/session\s*id\s*:\s*([0-9a-f-]{8,})/i);
    if (labelled) return labelled[1];
  }

  // Generic fallback: first UUID anywhere — only if the substring "session" is also present
  if (/session/i.test(raw)) {
    const m = raw.match(UUID_RE);
    if (m) return m[0];
  }

  return null;
}

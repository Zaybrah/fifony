/**
 * Exfiltration guard — scans outbound text (commit messages, diffs, PR bodies,
 * log chunks streamed to the UI) for leaked secrets before they leave the
 * machine boundary.
 *
 * Two layers:
 *   1. Pattern matchers — known credential formats (Anthropic, OpenAI, AWS, …).
 *   2. Env-value matcher — any process.env value whose name contains
 *      KEY/TOKEN/SECRET/PASSWORD and is non-trivially long, including
 *      base64-encoded and URL-encoded variants.
 *
 * No external dependencies. Pure functions, safe to call from any layer.
 */

const REDACTED = "[REDACTED]";

export interface SecretMatch {
  pattern: string;
  preview: string;
}

export interface ScanResult {
  clean: string;
  leaked: SecretMatch[];
}

interface NamedPattern {
  name: string;
  regex: RegExp;
}

const PATTERNS: NamedPattern[] = [
  { name: "anthropic-api-key", regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { name: "openai-api-key", regex: /sk-proj-[a-zA-Z0-9_-]{20,}/g },
  { name: "openai-legacy-key", regex: /\bsk-[a-zA-Z0-9]{32,}\b/g },
  { name: "github-token", regex: /\bgh[posu]_[A-Za-z0-9]{20,}\b/g },
  { name: "slack-token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "stripe-live-key", regex: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: "stripe-test-key", regex: /\bsk_test_[A-Za-z0-9]{20,}\b/g },
  { name: "telegram-bot-token", regex: /\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b/g },
  { name: "sendgrid-key", regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
  { name: "twilio-key", regex: /\bSK[0-9a-fA-F]{32}\b/g },
  { name: "mailgun-key", regex: /\bkey-[A-Za-z0-9]{32}\b/g },
  { name: "private-key-block", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

const ENV_NAME_HINT = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|API)/i;
const MIN_ENV_VALUE_LENGTH = 12;

/**
 * Names of env vars that fifony controls and which leak into normal commits
 * (paths, branch names, etc.). Skip them — they are not secrets.
 */
const ENV_NAME_DENYLIST = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "TERM",
  "PWD",
  "OLDPWD",
  "LANG",
  "LC_ALL",
]);

function snapshotEnvSecrets(): Array<{ name: string; value: string; encoded: string[] }> {
  const out: Array<{ name: string; value: string; encoded: string[] }> = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < MIN_ENV_VALUE_LENGTH) continue;
    if (ENV_NAME_DENYLIST.has(name)) continue;
    if (!ENV_NAME_HINT.test(name)) continue;
    const encoded = [
      Buffer.from(value, "utf8").toString("base64"),
      encodeURIComponent(value),
    ].filter((v) => v && v !== value && v.length >= MIN_ENV_VALUE_LENGTH);
    out.push({ name, value, encoded });
  }
  return out;
}

function previewOf(match: string): string {
  if (match.length <= 12) return `${match.slice(0, 4)}…`;
  return `${match.slice(0, 6)}…${match.slice(-2)}`;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scan text. Returns the cleaned (redacted) version and a list of distinct
 * matches. Distinct = same pattern + same preview deduplicated.
 */
export function scanForSecrets(text: string): ScanResult {
  if (!text) return { clean: text, leaked: [] };

  let clean = text;
  const found = new Map<string, SecretMatch>();

  const record = (pattern: string, raw: string) => {
    const preview = previewOf(raw);
    const key = `${pattern}:${preview}`;
    if (!found.has(key)) found.set(key, { pattern, preview });
  };

  for (const { name, regex } of PATTERNS) {
    clean = clean.replace(regex, (m) => {
      record(name, m);
      return REDACTED;
    });
  }

  for (const env of snapshotEnvSecrets()) {
    const literalRegex = new RegExp(escapeForRegex(env.value), "g");
    clean = clean.replace(literalRegex, () => {
      record(`env:${env.name}`, env.value);
      return REDACTED;
    });
    for (const variant of env.encoded) {
      const variantRegex = new RegExp(escapeForRegex(variant), "g");
      clean = clean.replace(variantRegex, () => {
        record(`env:${env.name}:encoded`, variant);
        return REDACTED;
      });
    }
  }

  return { clean, leaked: [...found.values()] };
}

/** Convenience: redact in place, discard match list. */
export function redactSecrets(text: string): string {
  return scanForSecrets(text).clean;
}

export class SecretLeakError extends Error {
  readonly leaked: SecretMatch[];
  readonly context: string;
  constructor(context: string, leaked: SecretMatch[]) {
    const summary = leaked.map((l) => `${l.pattern}=${l.preview}`).join(", ");
    super(`Exfil guard blocked ${context}: ${summary}`);
    this.name = "SecretLeakError";
    this.leaked = leaked;
    this.context = context;
  }
}

/**
 * Throw if the text contains secrets. Use at hard boundaries where a leak
 * would be irreversible (git commit, git push, PR body, external API call).
 */
export function assertNoSecrets(text: string, context: string): void {
  const { leaked } = scanForSecrets(text);
  if (leaked.length > 0) throw new SecretLeakError(context, leaked);
}

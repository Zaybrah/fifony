import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logger } from "./logger.ts";

// ── Types ────────────────────────────────────────────────────────────────────

interface ModelInfo {
  slug: string;
  displayName: string;
  description: string;
}

interface UsagePeriod {
  tokensUsed: number;
  sessions: number;
  since: string;
}

interface ProviderUsage {
  name: string;
  available: boolean;
  models: ModelInfo[];
  currentModel: string;
  usage: {
    today: UsagePeriod;
    thisWeek: UsagePeriod;
    allTime: UsagePeriod;
  };
  resetInfo: string;
}

interface ProvidersUsageResult {
  providers: ProviderUsage[];
  collectedAt: string;
}

// ── Claude usage (from JSONL session files) ──────────────────────────────────

function collectClaudeUsage(): ProviderUsage | null {
  const home = homedir();
  const claudeDir = join(home, ".claude");
  if (!existsSync(claudeDir)) return null;

  // Check if Claude CLI is available
  let available = false;
  try {
    execSync("which claude", { encoding: "utf8", timeout: 3000 });
    available = true;
  } catch {}

  // Aggregate token usage from all project session files
  const projectsDir = join(claudeDir, "projects");
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalSessions = 0;
  let todayInputTokens = 0;
  let todayOutputTokens = 0;
  let todaySessions = 0;
  let weekInputTokens = 0;
  let weekOutputTokens = 0;
  let weekSessions = 0;

  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  // Week starts on Monday
  const weekStart = new Date();
  const dayOfWeek = weekStart.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekMs = weekStart.getTime();

  if (existsSync(projectsDir)) {
    try {
      const projectDirs = readdirSync(projectsDir, { withFileTypes: true });
      for (const dir of projectDirs) {
        if (!dir.isDirectory()) continue;
        const projectPath = join(projectsDir, dir.name);

        let sessionFiles: string[];
        try {
          sessionFiles = readdirSync(projectPath)
            .filter((f) => f.endsWith(".jsonl"));
        } catch {
          continue;
        }

        for (const file of sessionFiles) {
          const filePath = join(projectPath, file);
          let content: string;
          try {
            content = readFileSync(filePath, "utf8");
          } catch {
            continue;
          }

          let sessionCounted = false;
          let sessionTodayCounted = false;
          let sessionWeekCounted = false;

          for (const line of content.split("\n")) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              if (entry.type !== "assistant" || !entry.message?.usage) continue;

              const usage = entry.message.usage;
              const inputTokens = (usage.input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.cache_read_input_tokens || 0);
              const outputTokens = usage.output_tokens || 0;

              totalInputTokens += inputTokens;
              totalOutputTokens += outputTokens;
              if (!sessionCounted) {
                totalSessions++;
                sessionCounted = true;
              }

              const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;

              if (timestamp >= todayMs) {
                todayInputTokens += inputTokens;
                todayOutputTokens += outputTokens;
                if (!sessionTodayCounted) {
                  todaySessions++;
                  sessionTodayCounted = true;
                }
              }

              if (timestamp >= weekMs) {
                weekInputTokens += inputTokens;
                weekOutputTokens += outputTokens;
                if (!sessionWeekCounted) {
                  weekSessions++;
                  sessionWeekCounted = true;
                }
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      logger.debug(`Failed to read Claude session files: ${String(err)}`);
    }
  }

  // Claude models (known models for Claude Code)
  const models: ModelInfo[] = [
    { slug: "claude-opus-4-6", displayName: "Claude Opus 4.6", description: "Most capable model for complex tasks" },
    { slug: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", description: "Balanced performance and speed" },
    { slug: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", description: "Fast and efficient model" },
  ];

  // Detect subscription type from settings
  let resetInfo = "Weekly reset (every Monday 00:00 UTC)";
  const settingsPath = join(claudeDir, "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      if (settings.plan === "max" || settings.plan === "max5x") {
        resetInfo = `Plan: ${settings.plan.toUpperCase()} — Daily token limit resets at 00:00 UTC`;
      }
    } catch {}
  }

  return {
    name: "claude",
    available,
    models,
    currentModel: "claude-opus-4-6",
    usage: {
      today: { tokensUsed: todayInputTokens + todayOutputTokens, sessions: todaySessions, since: todayStart.toISOString() },
      thisWeek: { tokensUsed: weekInputTokens + weekOutputTokens, sessions: weekSessions, since: weekStart.toISOString() },
      allTime: { tokensUsed: totalInputTokens + totalOutputTokens, sessions: totalSessions, since: "" },
    },
    resetInfo,
  };
}

// ── Codex usage (from SQLite state DB) ───────────────────────────────────────

function collectCodexUsage(): ProviderUsage | null {
  const home = homedir();
  const codexDir = join(home, ".codex");
  if (!existsSync(codexDir)) return null;

  let available = false;
  try {
    execSync("which codex", { encoding: "utf8", timeout: 3000 });
    available = true;
  } catch {}

  // Read models from cache
  const models: ModelInfo[] = [];
  const modelsCachePath = join(codexDir, "models_cache.json");
  let currentModel = "";

  if (existsSync(modelsCachePath)) {
    try {
      const cache = JSON.parse(readFileSync(modelsCachePath, "utf8"));
      for (const m of cache.models || []) {
        models.push({
          slug: m.slug,
          displayName: m.display_name || m.slug,
          description: (m.description || "").slice(0, 80),
        });
      }
    } catch {}
  }

  // Read current model from config
  const configPath = join(codexDir, "config.toml");
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, "utf8");
      const modelMatch = configContent.match(/^model\s*=\s*"([^"]+)"/m);
      if (modelMatch) currentModel = modelMatch[1];
    } catch {}
  }

  // Query SQLite for usage data
  const dbPath = join(codexDir, "state_5.sqlite");
  if (!existsSync(dbPath)) {
    // Try older state files
    const files = readdirSync(codexDir).filter((f) => f.startsWith("state_") && f.endsWith(".sqlite"));
    if (files.length === 0) {
      return {
        name: "codex",
        available,
        models,
        currentModel,
        usage: {
          today: { tokensUsed: 0, sessions: 0, since: new Date().toISOString() },
          thisWeek: { tokensUsed: 0, sessions: 0, since: new Date().toISOString() },
          allTime: { tokensUsed: 0, sessions: 0, since: "" },
        },
        resetInfo: "Weekly rate limit resets every Monday",
      };
    }
  }

  let allTimeTokens = 0;
  let allTimeSessions = 0;
  let todayTokens = 0;
  let todaySessions = 0;
  let weekTokens = 0;
  let weekSessions = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayUnix = Math.floor(todayStart.getTime() / 1000);

  const weekStart = new Date();
  const dayOfWeek = weekStart.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekUnix = Math.floor(weekStart.getTime() / 1000);

  try {
    const query = `
      SELECT
        SUM(tokens_used) as total_tokens,
        COUNT(*) as total_sessions,
        SUM(CASE WHEN created_at >= ${todayUnix} THEN tokens_used ELSE 0 END) as today_tokens,
        SUM(CASE WHEN created_at >= ${todayUnix} THEN 1 ELSE 0 END) as today_sessions,
        SUM(CASE WHEN created_at >= ${weekUnix} THEN tokens_used ELSE 0 END) as week_tokens,
        SUM(CASE WHEN created_at >= ${weekUnix} THEN 1 ELSE 0 END) as week_sessions
      FROM threads;
    `;
    const result = execSync(`sqlite3 "${dbPath}" "${query}"`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();

    if (result) {
      const parts = result.split("|");
      allTimeTokens = parseInt(parts[0], 10) || 0;
      allTimeSessions = parseInt(parts[1], 10) || 0;
      todayTokens = parseInt(parts[2], 10) || 0;
      todaySessions = parseInt(parts[3], 10) || 0;
      weekTokens = parseInt(parts[4], 10) || 0;
      weekSessions = parseInt(parts[5], 10) || 0;
    }
  } catch (err) {
    logger.debug(`Failed to query Codex SQLite: ${String(err)}`);
  }

  return {
    name: "codex",
    available,
    models,
    currentModel,
    usage: {
      today: { tokensUsed: todayTokens, sessions: todaySessions, since: todayStart.toISOString() },
      thisWeek: { tokensUsed: weekTokens, sessions: weekSessions, since: weekStart.toISOString() },
      allTime: { tokensUsed: allTimeTokens, sessions: allTimeSessions, since: "" },
    },
    resetInfo: "Weekly rate limit resets every Monday",
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function collectProvidersUsage(): ProvidersUsageResult {
  const providers: ProviderUsage[] = [];

  const claude = collectClaudeUsage();
  if (claude) providers.push(claude);

  const codex = collectCodexUsage();
  if (codex) providers.push(codex);

  return {
    providers,
    collectedAt: new Date().toISOString(),
  };
}

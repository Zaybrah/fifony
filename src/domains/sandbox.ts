import { existsSync, chmodSync, mkdirSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { logger } from "../concerns/logger.ts";

const AI_JAIL_DIR = join(homedir(), ".fifony", "bin");
const AI_JAIL_BIN = join(AI_JAIL_DIR, "ai-jail");

/** Returns the expected path of the ai-jail binary. */
export function getAiJailPath(): string {
  return AI_JAIL_BIN;
}

/** Checks whether the ai-jail binary exists and is executable. */
export function isAiJailInstalled(): boolean {
  if (!existsSync(AI_JAIL_BIN)) return false;
  try {
    execSync(`"${AI_JAIL_BIN}" --version`, { stdio: "pipe", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Runs `ai-jail --version` and returns the version string, or null on failure. */
export function getAiJailVersion(): string | null {
  try {
    const out = execSync(`"${AI_JAIL_BIN}" --version`, { stdio: "pipe", timeout: 5_000 });
    return out.toString().trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the platform suffix used in ai-jail release filenames.
 *   linux x64  → linux-x86_64
 *   darwin arm64 → macos-aarch64
 *   darwin x64  → macos-x86_64
 */
function resolvePlatformSuffix(): string {
  const os = platform();
  const cpu = arch();

  if (os === "linux" && cpu === "x64") return "linux-x86_64";
  if (os === "darwin" && cpu === "arm64") return "macos-aarch64";
  if (os === "darwin" && cpu === "x64") return "macos-x86_64";

  throw new Error(`Unsupported platform for ai-jail: ${os}-${cpu}`);
}

/**
 * Downloads the ai-jail binary from GitHub releases for the current OS/arch.
 * Extracts the tarball to ~/.fifony/bin/ai-jail and makes it executable.
 */
export async function downloadAiJail(): Promise<void> {
  const suffix = resolvePlatformSuffix();
  const url = `https://github.com/akitaonrails/ai-jail/releases/latest/download/ai-jail-${suffix}.tar.gz`;

  logger.info({ url, dest: AI_JAIL_BIN }, "[Sandbox] Downloading ai-jail");

  mkdirSync(AI_JAIL_DIR, { recursive: true });

  try {
    execSync(
      `curl -fsSL "${url}" | tar xz -C "${AI_JAIL_DIR}"`,
      { stdio: "pipe", timeout: 120_000 },
    );
  } catch (err) {
    throw new Error(`Failed to download ai-jail from ${url}: ${(err as Error).message}`);
  }

  if (!existsSync(AI_JAIL_BIN)) {
    throw new Error(`ai-jail binary not found at ${AI_JAIL_BIN} after extraction`);
  }

  chmodSync(AI_JAIL_BIN, 0o755);

  const version = getAiJailVersion();
  logger.info({ version }, "[Sandbox] ai-jail installed successfully");
}

/**
 * Ensures ai-jail is available — downloads it if missing.
 * Returns the absolute path to the binary.
 */
export async function ensureAiJail(): Promise<string> {
  if (isAiJailInstalled()) return AI_JAIL_BIN;
  await downloadAiJail();
  return AI_JAIL_BIN;
}

/**
 * Wraps a shell command to run inside ai-jail with the worktree as the only read-write mount.
 *
 * @param command      The original shell command to execute.
 * @param worktreePath The worktree directory to mount as read-write.
 * @param extraRwPaths Additional paths to allow read-write access (e.g. temp dirs).
 * @returns The wrapped command string.
 */
export function buildSandboxCommand(
  command: string,
  worktreePath: string,
  extraRwPaths?: string[],
): string {
  const rwMaps = [worktreePath, ...(extraRwPaths ?? [])];
  const rwFlags = rwMaps.map((p) => `--rw-map ${p}`).join(" ");
  const escapedCommand = command.replace(/'/g, "'\\''");
  return `"${AI_JAIL_BIN}" ${rwFlags} -- sh -c '${escapedCommand}'`;
}

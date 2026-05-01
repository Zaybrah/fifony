import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:process";

const execFileAsync = promisify(execFile);

function normalizeExecutablePath(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function resolveLocatorCommand(): string {
  return platform === "win32" ? "where" : "which";
}

export function findExecutableSync(name: string, timeout = 3000): string | null {
  try {
    const stdout = execFileSync(resolveLocatorCommand(), [name], { encoding: "utf8", timeout });
    const resolved = normalizeExecutablePath(stdout);
    return resolved || null;
  } catch {
    return null;
  }
}

export async function findExecutable(name: string, timeout = 3000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(resolveLocatorCommand(), [name], { encoding: "utf8", timeout });
    const resolved = normalizeExecutablePath(stdout);
    return resolved || null;
  } catch {
    return null;
  }
}

export async function executableExists(name: string, timeout = 3000): Promise<boolean> {
  return Boolean(await findExecutable(name, timeout));
}
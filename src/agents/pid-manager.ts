import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { IssueEntry } from "../types.ts";

export type AgentPidInfo = {
  pid: number;
  issueId: string;
  startedAt: string;
  command: string;
};

export type DaemonExitRecord = {
  success: boolean;
  code: number | null;
  outputPath: string;
  completedAt: string;
};

/** Read PID file from workspace, returns null if missing/invalid. */
export function readAgentPid(workspacePath: string): AgentPidInfo | null {
  const pidFile = join(workspacePath, "agent.pid");
  if (!existsSync(pidFile)) return null;
  try {
    const data = JSON.parse(readFileSync(pidFile, "utf8")) as AgentPidInfo;
    if (!data?.pid || typeof data.pid !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

/** Read daemon PID from workspace, returns null if missing/invalid. */
export function readDaemonPid(workspacePath: string): number | null {
  const daemonPidFile = join(workspacePath, "daemon.pid");
  if (!existsSync(daemonPidFile)) return null;
  try {
    const pid = parseInt(readFileSync(daemonPidFile, "utf8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** Read the daemon exit record written by the daemon on clean exit. */
export function readDaemonExit(workspacePath: string): DaemonExitRecord | null {
  const exitFile = join(workspacePath, "daemon.exit.json");
  if (!existsSync(exitFile)) return null;
  try {
    return JSON.parse(readFileSync(exitFile, "utf8")) as DaemonExitRecord;
  } catch {
    return null;
  }
}

/** Check if a process is still running by PID. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = check existence
    return true;
  } catch {
    return false;
  }
}

/** Check if the PTY daemon is alive for a given workspace. */
export function isDaemonAlive(workspacePath: string): boolean {
  const pid = readDaemonPid(workspacePath);
  if (!pid) return false;
  return isProcessAlive(pid);
}

/** Check if a Unix socket file exists for a workspace (daemon is serving). */
export function isDaemonSocketReady(workspacePath: string): boolean {
  return existsSync(join(workspacePath, "agent.sock"));
}

/** Check if an issue's agent is still running from a previous session. */
export function isAgentStillRunning(issue: IssueEntry): { alive: boolean; pid: AgentPidInfo | null } {
  const wp = issue.workspacePath;
  if (!wp || !existsSync(wp)) return { alive: false, pid: null };

  // Check daemon first — if daemon is alive, the agent may still be running
  // even if agent.pid was already cleaned up by the daemon
  if (isDaemonAlive(wp)) {
    const pidInfo = readAgentPid(wp);
    return { alive: true, pid: pidInfo };
  }

  const pidInfo = readAgentPid(wp);
  if (!pidInfo) return { alive: false, pid: null };
  return { alive: isProcessAlive(pidInfo.pid), pid: pidInfo };
}

/** Clean stale PID file if the process is dead. */
export function cleanStalePidFile(workspacePath: string): void {
  const pidInfo = readAgentPid(workspacePath);
  if (!pidInfo) return;
  if (!isProcessAlive(pidInfo.pid)) {
    try { rmSync(join(workspacePath, "agent.pid"), { force: true }); } catch {}
  }
}

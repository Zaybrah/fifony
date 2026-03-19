import { execFileSync } from "node:child_process";
import {
  Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative as relativePath, resolve } from "node:path";

type ArtifactKind = "agent" | "skill";

type RepositoryReferenceInput = {
  id: string;
  name: string;
  url: string;
  description: string;
  fallbackUrls?: string[];
};

export type ReferenceImportKind = "all" | "agents" | "skills";

export type ReferenceRepositoryStatus = {
  id: string;
  name: string;
  url: string;
  path: string;
  present: boolean;
  synced: boolean;
  error?: string;
  remote?: string;
  branch?: string;
  artifactCounts?: {
    agents: number;
    skills: number;
  };
};

export type ReferenceSyncResult = {
  id: string;
  path: string;
  action: "cloned" | "updated" | "failed";
  message: string;
};

type ReferenceArtifact = {
  kind: ArtifactKind;
  sourcePath: string;
  targetName: string;
};

type ReferenceArtifactCollector = (repoPath: string) => ReferenceArtifact[];

export type ReferenceImportSummary = {
  repositoryId: string;
  localPath: string;
  requestedKind: ReferenceImportKind;
  dryRun: boolean;
  importedAgents: string[];
  importedSkills: string[];
  skippedAgents: string[];
  skippedSkills: string[];
  errors: Array<{ kind: ArtifactKind; targetName: string; error: string }>;
};

const DEFAULT_REFERENCE_REPOSITORIES: RepositoryReferenceInput[] = [
  {
    id: "ring",
    name: "LerianStudio/ring",
    url: "https://github.com/LerianStudio/ring.git",
    description: "Massive reference library for agents, skills, commands, and engineering standards.",
    fallbackUrls: ["git@github.com:LerianStudio/ring.git"],
  },
  {
    id: "agency-agents",
    name: "msitarzewski/agency-agents",
    url: "https://github.com/msitarzewski/agency-agents.git",
    description: "Reference agent set focused on frontend, backend, QA, and review roles.",
  },
  {
    id: "impeccable",
    name: "pbakaus/impeccable",
    url: "https://github.com/pbakaus/impeccable.git",
    description: "Frontend polish and impeccable-style quality workflows.",
  },
];

const REPOSITORY_ROOT = resolve(homedir(), ".fifony", "repositories");
const MAX_SCAN_DEPTH = 8;
const SKIP_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "tmp",
  "temp",
]);
const AGENCY_AGENTS_EXCLUDED_DIRS = new Set([
  "examples",
  "strategy",
]);

const REFERENCE_REPOSITORY_PARSERS: Record<string, ReferenceArtifactCollector> = {
  ring: collectStandardArtifacts,
  "agency-agents": collectAgencyArtifacts,
  impeccable: collectImpeccableArtifacts,
};

function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 120_000,
  }).toString().trim();
}

function slugify(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
  return safe || "reference-item";
}

function uniqueSuffix(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let i = 0;
  while (true) {
    const candidate = `${base}-${++i}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function collectDirectoryEntries(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readRepositoryLine(path: string): string | undefined {
  try {
    return runGit(["-C", path, "remote", "get-url", "origin"]);
  } catch {
    return undefined;
  }
}

function readCurrentBranch(path: string): string | undefined {
  try {
    return runGit(["-C", path, "rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return undefined;
  }
}

function isMarkdownFile(value: string, expectedName: string): boolean {
  const lower = value.toLowerCase();
  return lower.endsWith(".md") && lower !== expectedName;
}

function isReferenceFrontMatterFile(filePath: string): boolean {
  let source: string;
  try {
    source = readFileSync(filePath, "utf8");
  } catch {
    return false;
  }

  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return false;
  }

  const header = match[1];
  return /^name:\s*.+/im.test(header) && /^description:\s*.+/im.test(header);
}

function buildRelativeArtifactName(repoPath: string, sourcePath: string): string {
  const relative = sourcePath.startsWith(repoPath) ? relativePath(repoPath, sourcePath) : sourcePath;
  const parent = dirname(relative);
  const parentSlug = parent === "." ? "" : parent.split(/[/\\]/).map((segment) => slugify(segment)).filter(Boolean).join("__");
  const baseName = slugify(basename(relative, ".md"));
  return parentSlug ? `${parentSlug}__${baseName}` : baseName;
}

function collectAgentArtifacts(
  agentsDir: string,
  usedNames: Set<string>,
  out: ReferenceArtifact[],
): void {
  const parent = slugify(basename(dirname(agentsDir)));
  const entries = collectDirectoryEntries(agentsDir);

  for (const entry of entries) {
    const itemPath = join(agentsDir, entry.name);

    if (entry.isDirectory()) {
      const nestedAgentSpec = join(itemPath, "AGENT.md");
      if (existsSync(nestedAgentSpec)) {
        const name = uniqueSuffix(`${parent}__${slugify(entry.name)}`, usedNames);
        out.push({ kind: "agent", sourcePath: nestedAgentSpec, targetName: name });
      }
      continue;
    }

    if (!isMarkdownFile(entry.name, "readme.md")) {
      continue;
    }

    const baseName = basename(entry.name, ".md");
    if (baseName.trim().length === 0 || baseName.toLowerCase() === "changelog") {
      continue;
    }

    const name = uniqueSuffix(`${parent}__${slugify(baseName)}`, usedNames);
    out.push({ kind: "agent", sourcePath: itemPath, targetName: name });
  }
}

function collectSkillArtifacts(
  skillsDir: string,
  usedNames: Set<string>,
  out: ReferenceArtifact[],
): void {
  const parent = slugify(basename(dirname(skillsDir)));
  const entries = collectDirectoryEntries(skillsDir);

  for (const entry of entries) {
    const itemPath = join(skillsDir, entry.name);
    if (entry.isDirectory()) {
      const skillFile = join(itemPath, "SKILL.md");
      if (existsSync(skillFile)) {
        const name = uniqueSuffix(`${parent}__${slugify(entry.name)}`, usedNames);
        out.push({ kind: "skill", sourcePath: skillFile, targetName: name });
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
      const name = uniqueSuffix(`${parent}__skill`, usedNames);
      out.push({ kind: "skill", sourcePath: itemPath, targetName: name });
    }
  }
}

function collectStandardArtifacts(repoPath: string): ReferenceArtifact[] {
  const agentsUsed = new Set<string>();
  const skillsUsed = new Set<string>();
  const artifacts: ReferenceArtifact[] = [];
  const queue: Array<{ path: string; depth: number }> = [{ path: repoPath, depth: 0 }];

  while (queue.length > 0) {
    const state = queue.shift();
    if (!state) break;

    if (state.depth > MAX_SCAN_DEPTH) {
      continue;
    }

    const entries = collectDirectoryEntries(state.path);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const childPath = join(state.path, entry.name);
      if (entry.name === "agents") {
        collectAgentArtifacts(childPath, agentsUsed, artifacts);
      }

      if (entry.name === "skills") {
        collectSkillArtifacts(childPath, skillsUsed, artifacts);
      }

      queue.push({ path: childPath, depth: state.depth + 1 });
    }
  }

  return artifacts;
}

function collectAgencyArtifacts(repoPath: string): ReferenceArtifact[] {
  const agentsUsed = new Set<string>();
  const artifacts: ReferenceArtifact[] = [];
  const queue: Array<{ path: string; depth: number }> = [{ path: repoPath, depth: 0 }];

  while (queue.length > 0) {
    const state = queue.shift();
    if (!state) break;

    if (state.depth > MAX_SCAN_DEPTH) {
      continue;
    }

    const entries = collectDirectoryEntries(state.path);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || AGENCY_AGENTS_EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        queue.push({ path: join(state.path, entry.name), depth: state.depth + 1 });
        continue;
      }

      if (!isMarkdownFile(entry.name, "readme.md") || !isReferenceFrontMatterFile(join(state.path, entry.name))) {
        continue;
      }

      const itemPath = join(state.path, entry.name);
      const targetName = uniqueSuffix(buildRelativeArtifactName(repoPath, itemPath), agentsUsed);
      artifacts.push({
        kind: "agent",
        sourcePath: itemPath,
        targetName,
      });
    }
  }

  return artifacts;
}

function collectImpeccableArtifacts(repoPath: string): ReferenceArtifact[] {
  const skillsUsed = new Set<string>();
  const artifacts: ReferenceArtifact[] = [];
  const sourceSkills = join(repoPath, "source", "skills");
  if (existsSync(sourceSkills)) {
    collectSkillArtifacts(sourceSkills, skillsUsed, artifacts);
    return artifacts;
  }

  const claudeSkills = join(repoPath, ".claude", "skills");
  if (existsSync(claudeSkills)) {
    collectSkillArtifacts(claudeSkills, skillsUsed, artifacts);
  }

  return artifacts;
}

export function collectArtifacts(repoPath: string, repositoryId?: string): ReferenceArtifact[] {
  const parser = repositoryId && REFERENCE_REPOSITORY_PARSERS[repositoryId]
    ? REFERENCE_REPOSITORY_PARSERS[repositoryId]
    : collectStandardArtifacts;
  return parser(repoPath);
}

function countArtifactKinds(artifacts: ReferenceArtifact[]): { agents: number; skills: number } {
  let agents = 0;
  let skills = 0;
  for (const artifact of artifacts) {
    if (artifact.kind === "agent") {
      agents += 1;
    } else {
      skills += 1;
    }
  }
  return { agents, skills };
}

export function getReferenceRepositoriesRoot(): string {
  return REPOSITORY_ROOT;
}

export function listReferenceRepositories(): ReferenceRepositoryStatus[] {
  return DEFAULT_REFERENCE_REPOSITORIES.map((repo) => {
    const path = join(REPOSITORY_ROOT, repo.id);
    const status: ReferenceRepositoryStatus = {
      id: repo.id,
      name: repo.name,
      url: repo.url,
      path,
      present: existsSync(path),
      synced: false,
    };

    if (!status.present) {
      return status;
    }

    if (!existsSync(join(path, ".git"))) {
      status.error = "Path exists but is not a git repo";
      return status;
    }

    status.remote = readRepositoryLine(path);
    status.branch = readCurrentBranch(path);
    status.synced = typeof status.remote === "string";
    if (status.synced) {
      const artifacts = collectArtifacts(path, repo.id);
      status.artifactCounts = countArtifactKinds(artifacts);
    }
    return status;
  });
}

export function resolveReferenceRepository(query: string): RepositoryReferenceInput | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;
  const normalizedWithoutGit = normalized.endsWith(".git") ? normalized.slice(0, -4) : normalized;

  return DEFAULT_REFERENCE_REPOSITORIES.find((repo) =>
    repo.id.toLowerCase() === normalizedWithoutGit
    || repo.name.toLowerCase() === normalizedWithoutGit
    || repo.url.toLowerCase() === normalized
    || repo.url.toLowerCase() === normalizedWithoutGit
    || repo.url.toLowerCase().endsWith(`/${normalizedWithoutGit}.git`)
    || repo.url.toLowerCase().endsWith(`/${normalizedWithoutGit}`),
  );
}

export function syncReferenceRepositories(
  repositoryId?: string,
): ReferenceSyncResult[] {
  const root = REPOSITORY_ROOT;
  mkdirSync(root, { recursive: true });
  const repos = repositoryId
    ? [resolveReferenceRepository(repositoryId)]
    : DEFAULT_REFERENCE_REPOSITORIES;
  const selected = repos.filter((repo): repo is RepositoryReferenceInput => Boolean(repo));
  if (repositoryId && selected.length === 0) {
    throw new Error(`Unknown reference repository: ${repositoryId}`);
  }

  const results: ReferenceSyncResult[] = [];

  for (const repo of selected) {
    const target = join(root, repo.id);
    const candidates = [repo.url, ...(repo.fallbackUrls ?? [])];

    if (!existsSync(target)) {
      let cloneError: string | undefined;
      for (const candidate of candidates) {
        try {
          runGit(["clone", "--depth", "1", candidate, target]);
          results.push({
            id: repo.id,
            path: target,
            action: "cloned",
            message: `Cloned ${candidate}`,
          });
          cloneError = undefined;
          break;
        } catch (error) {
          cloneError = error instanceof Error ? error.message : String(error);
        }
      }

      if (cloneError) {
        results.push({
          id: repo.id,
          path: target,
          action: "failed",
          message: cloneError,
        });
      }
      continue;
    }

    if (!existsSync(join(target, ".git"))) {
      results.push({
        id: repo.id,
        path: target,
        action: "failed",
        message: "Path exists but is not a git repository",
      });
      continue;
    }

    try {
      runGit(["-C", target, "fetch", "--all", "--prune"]);
      runGit(["-C", target, "pull", "--ff-only"]);
      results.push({
        id: repo.id,
        path: target,
        action: "updated",
        message: "Updated from remote",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: repo.id,
        path: target,
        action: "failed",
        message,
      });
    }
  }

  return results;
}

export function importReferenceArtifacts(
  repositoryId: string,
  workspaceRoot: string,
  options: {
    kind: ReferenceImportKind;
    overwrite: boolean;
    dryRun: boolean;
    importToGlobal: boolean;
  },
): ReferenceImportSummary {
  const repository = resolveReferenceRepository(repositoryId);
  if (!repository) {
    throw new Error(`Unknown reference repository: ${repositoryId}`);
  }

  const localPath = join(REPOSITORY_ROOT, repository.id);
  if (!existsSync(localPath)) {
    throw new Error(`Repository not synced yet: ${repository.id}. Run 'fifony onboarding sync --repository ${repository.id}' first.`);
  }

  const basePath = resolve(workspaceRoot);
  const targetBase = options.importToGlobal
    ? join(homedir(), ".codex")
    : join(basePath, ".codex");

  const agentsDir = join(targetBase, "agents");
  const skillsDir = join(targetBase, "skills");

  const artifacts = collectArtifacts(localPath, repository.id);
  const filtered = options.kind === "all"
    ? artifacts
    : artifacts.filter((artifact) => artifact.kind === options.kind.slice(0, -1));

  const summary: ReferenceImportSummary = {
    repositoryId: repository.id,
    localPath,
    requestedKind: options.kind,
    dryRun: options.dryRun,
    importedAgents: [],
    importedSkills: [],
    skippedAgents: [],
    skippedSkills: [],
    errors: [],
  };

  if (filtered.length === 0) {
    return summary;
  }

  if (!options.dryRun) {
    mkdirSync(targetBase, { recursive: true });
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(skillsDir, { recursive: true });
  }

  for (const artifact of filtered) {
    try {
      const source = readFileSync(artifact.sourcePath, "utf8");
      if (artifact.kind === "agent") {
        const target = join(agentsDir, `${artifact.targetName}.md`);
        if (!options.overwrite && existsSync(target)) {
          summary.skippedAgents.push(artifact.targetName);
          continue;
        }
        if (options.dryRun) {
          summary.importedAgents.push(artifact.targetName);
          continue;
        }
        writeFileSync(target, source, "utf8");
        summary.importedAgents.push(artifact.targetName);
      } else {
        const targetDir = join(skillsDir, artifact.targetName);
        const target = join(targetDir, "SKILL.md");
        if (!options.overwrite && existsSync(target)) {
          summary.skippedSkills.push(artifact.targetName);
          continue;
        }
        if (options.dryRun) {
          summary.importedSkills.push(artifact.targetName);
          continue;
        }
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(target, source, "utf8");
        summary.importedSkills.push(artifact.targetName);
      }
    } catch (error) {
      summary.errors.push({
        kind: artifact.kind,
        targetName: artifact.targetName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { IssueEntry, AgentProviderDefinition, RuntimeConfig, IssuePlan, ProviderCapabilities } from "../../types.ts";
import type { CompiledExecution } from "./types.ts";
import type { ProviderAdapter, ProviderCommandOptions } from "./registry.ts";
import { renderPrompt } from "../prompting.ts";
import { buildFullPlanPrompt, resolveEffortForProvider, extractValidationCommands, buildImagePromptSection } from "./shared.ts";
import { extractPlanDirs } from "./commands.ts";

const PI_CAPABILITIES: ProviderCapabilities = {
  readOnlyExecution: "tool-allowlist",
  structuredOutput: {
    mode: "prompt-contract",
    requiresToolDisable: false,
  },
  imageInput: "prompt-inline",
  usageReporting: "none",
  nativeSubagents: "runtime-only",
};

const PI_READ_ONLY_TOOLS = "read,grep,find,ls";

const PI_RESULT_CONTRACT = `
Return a JSON object with this exact schema when finished:
{
  "status": "done" | "continue" | "blocked" | "failed",
  "summary": "one paragraph summary of what was done",
  "root_cause": ["list of root causes found"],
  "changes_made": ["list of files/changes"],
  "validation": { "commands_run": ["..."], "result": "pass" | "partial" | "fail" },
  "open_questions": ["..."],
  "followups": ["..."],
  "nextPrompt": "guidance for next turn if status is continue",
  "tools_used": ["list of tools you used, e.g. read, grep, find, ls, bash, edit, write"],
  "skills_used": ["list of slash commands you invoked, e.g. /commit, /review-pr"],
  "agents_used": ["list of subagents you spawned, e.g. code-reviewer, build-error-resolver"],
  "commands_run": ["list of shell commands you executed, e.g. npm test, git status"]
}
`.trim();

function mapPiThinkingLevel(effort?: string): string | undefined {
  if (!effort) return undefined;
  if (effort === "extra-high") return "xhigh";
  return effort;
}

export function buildPiCommand(options: ProviderCommandOptions): string {
  const parts = ["pi", "-p \"\"", "--no-session", "--no-context-files"];

  if (options.model) {
    parts.push(`--model ${options.model}`);
  }

  const thinking = mapPiThinkingLevel(options.effort);
  if (thinking) {
    parts.push(`--thinking ${thinking}`);
  }

  if (options.noToolAccess) {
    parts.push("--no-tools");
  } else if (options.readOnly) {
    parts.push(`--tools ${PI_READ_ONLY_TOOLS}`);
  }

  parts.push('< "$FIFONY_PROMPT_FILE"');
  return parts.join(" ");
}

async function compile(
  issue: IssueEntry,
  provider: AgentProviderDefinition,
  plan: IssuePlan,
  config: RuntimeConfig,
  workspacePath: string,
  skillContext: string,
  capabilitiesManifest?: string,
): Promise<CompiledExecution> {
  const effort = resolveEffortForProvider(plan, provider.role, config.defaultEffort) || provider.reasoningEffort;

  let prompt = await renderPrompt("compile-execution-codex", {
    isPlanner: provider.role === "planner",
    isReviewer: provider.role === "reviewer",
    profileInstructions: provider.profileInstructions || "",
    skillContext,
    capabilitiesManifest: capabilitiesManifest || "",
    issueIdentifier: issue.identifier,
    title: issue.title,
    description: issue.description || "(none)",
    workspacePath,
    planPrompt: buildFullPlanPrompt(plan),
    phases: (plan.phases ?? []).map((phase) => ({
      phaseName: phase.phaseName,
      goal: phase.goal,
      outputs: phase.outputs ?? [],
    })),
    suggestedAgents: plan.suggestedAgents ?? [],
    hasNativeSubagents: PI_CAPABILITIES.nativeSubagents === "native",
    suggestedPaths: plan.suggestedPaths ?? [],
    suggestedSkills: plan.suggestedSkills ?? [],
    validationItems: (plan.validation ?? []).map((value) => ({ value })),
    outputContract: PI_RESULT_CONTRACT,
    outputStyleVerbose: config.agentOutputStyle === "verbose",
  });

  if (issue.images?.length) {
    const imageSection = buildImagePromptSection(issue.images);
    if (imageSection) prompt = `${prompt}\n\n${imageSection}`;
  }

  const relativeDirs = extractPlanDirs(plan);
  const codePath = existsSync(join(workspacePath, "worktree")) ? join(workspacePath, "worktree") : workspacePath;
  const absoluteDirs = relativeDirs.map((dir) => join(codePath, dir));

  const isReadOnlyRole = provider.role === "planner" || provider.role === "reviewer";
  const command = buildPiCommand({
    model: provider.model,
    effort,
    addDirs: absoluteDirs,
    readOnly: isReadOnlyRole,
  });

  const env: Record<string, string> = {
    FIFONY_PLAN_COMPLEXITY: plan.estimatedComplexity,
    FIFONY_PLAN_STEPS: String(plan.steps.length),
    FIFONY_PLAN_PHASES: String(plan.phases?.length || 0),
    FIFONY_EXECUTION_PAYLOAD_FILE: "execution-payload.json",
    PI_SKIP_VERSION_CHECK: "1",
  };
  if (plan.suggestedPaths?.length) env.FIFONY_PLAN_PATHS = plan.suggestedPaths.join(",");

  const { pre, post } = extractValidationCommands(plan);

  return {
    prompt,
    command,
    env,
    preHooks: pre,
    postHooks: post,
    outputSchema: "",
    payload: null,
    meta: {
      adapter: "pi",
      reasoningEffort: effort || "default",
      model: provider.model || "default",
      providerCapabilities: PI_CAPABILITIES,
      skillsActivated: plan.suggestedSkills || [],
      subagentsRequested: plan.suggestedAgents || [],
      phasesCount: plan.phases?.length || 0,
    },
  };
}

export const piAdapter: ProviderAdapter = {
  capabilities: PI_CAPABILITIES,
  buildCommand: buildPiCommand,
  buildReviewCommand: (reviewer) => buildPiCommand({
    model: reviewer.model,
    effort: reviewer.reasoningEffort,
    readOnly: true,
  }),
  compile,
};
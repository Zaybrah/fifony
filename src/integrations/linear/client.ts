import { logger } from "../../concerns/logger.ts";
import {
  buildLinearImportDraft,
  buildLinearIssueFilter,
  mapLinearComment,
  mapLinearIssue,
  mapLinearProject,
  mapLinearTeam,
  mapLinearViewer,
} from "./mappers.ts";
import type {
  LinearCommentResult,
  LinearImportDraft,
  LinearIssueFilters,
  LinearIssueSummary,
  LinearProjectSummary,
  LinearTeamSummary,
  LinearViewer,
} from "./types.ts";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

type GraphqlError = {
  message?: string;
  path?: string[];
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: GraphqlError[];
};

export class LinearClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAt?: number;

  constructor(message: string, options?: { status?: number; code?: string; retryAt?: number }) {
    super(message);
    this.name = "LinearClientError";
    this.status = options?.status ?? 500;
    this.code = options?.code;
    this.retryAt = options?.retryAt;
  }
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getRetryAt(headers: Headers): number | undefined {
  const reset = headers.get("x-ratelimit-requests-reset") || headers.get("x-ratelimit-complexity-reset");
  if (!reset) return undefined;
  const parsed = Number.parseInt(reset, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeGraphqlError(error: GraphqlError | undefined, status: number, headers: Headers): LinearClientError {
  const code = error?.extensions?.code;
  const message = error?.message?.trim() || "Linear request failed.";
  if (code === "RATELIMITED") {
    return new LinearClientError("Linear rate limit reached. Try again later.", {
      status: 429,
      code,
      retryAt: getRetryAt(headers),
    });
  }
  if (status === 401 || status === 403 || code === "AUTHENTICATION_ERROR") {
    return new LinearClientError("Linear authentication failed. Check the API token.", {
      status: 401,
      code,
    });
  }
  return new LinearClientError(message, { status: status >= 400 ? status : 502, code, retryAt: getRetryAt(headers) });
}

async function executeLinearQuery<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: token.trim(),
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  const payload = parseJson<GraphqlResponse<T>>(text);

  if (!response.ok) {
    throw normalizeGraphqlError(payload?.errors?.[0], response.status, response.headers);
  }
  if (payload?.errors?.length) {
    throw normalizeGraphqlError(payload.errors[0], response.status, response.headers);
  }
  if (!payload?.data) {
    throw new LinearClientError("Linear returned an empty response.", { status: 502, code: "BAD_RESPONSE" });
  }
  return payload.data;
}

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  url
  updatedAt
  team { id name key }
  project { id name state icon }
  state { id name type color }
  labels { nodes { id name color } }
`;

export class LinearClient {
  constructor(private readonly token: string) {}

  async fetchViewer(): Promise<LinearViewer> {
    const data = await executeLinearQuery<{ viewer?: unknown }>(
      this.token,
      `query LinearViewer { viewer { id name email organization { id name urlKey } } }`,
    );
    const viewer = mapLinearViewer(data.viewer);
    if (!viewer) {
      throw new LinearClientError("Linear viewer payload was incomplete.", { status: 502, code: "BAD_RESPONSE" });
    }
    return viewer;
  }

  async listTeams(limit = 50): Promise<LinearTeamSummary[]> {
    const data = await executeLinearQuery<{ teams?: { nodes?: unknown[] } }>(
      this.token,
      `query LinearTeams($first: Int!) { teams(first: $first, orderBy: updatedAt) { nodes { id name key } } }`,
      { first: limit },
    );
    return Array.isArray(data.teams?.nodes)
      ? data.teams.nodes.map((node) => mapLinearTeam(node)).filter((node): node is LinearTeamSummary => Boolean(node))
      : [];
  }

  async listProjects(teamId?: string, limit = 50): Promise<LinearProjectSummary[]> {
    const filter = teamId ? { teams: { id: { eq: teamId } } } : undefined;
    const data = await executeLinearQuery<{ projects?: { nodes?: unknown[] } }>(
      this.token,
      `query LinearProjects($first: Int!, $filter: ProjectFilter) { projects(first: $first, orderBy: updatedAt, filter: $filter) { nodes { id name state icon } } }`,
      { first: limit, filter },
    );
    return Array.isArray(data.projects?.nodes)
      ? data.projects.nodes.map((node) => mapLinearProject(node)).filter((node): node is LinearProjectSummary => Boolean(node))
      : [];
  }

  async listIssues(filters: LinearIssueFilters): Promise<LinearIssueSummary[]> {
    const first = Math.max(1, Math.min(filters.limit ?? 20, 50));
    const filter = buildLinearIssueFilter(filters);
    const data = await executeLinearQuery<{ issues?: { nodes?: unknown[] } }>(
      this.token,
      `query LinearIssues($first: Int!, $filter: IssueFilter, $includeArchived: Boolean) {
        issues(first: $first, orderBy: updatedAt, filter: $filter, includeArchived: $includeArchived) {
          nodes { ${ISSUE_FIELDS} }
        }
      }`,
      {
        first,
        filter,
        includeArchived: filters.includeArchived === true,
      },
    );
    return Array.isArray(data.issues?.nodes)
      ? data.issues.nodes.map((node) => mapLinearIssue(node)).filter((node): node is LinearIssueSummary => Boolean(node))
      : [];
  }

  async getIssue(id: string): Promise<LinearIssueSummary> {
    const data = await executeLinearQuery<{ issue?: unknown }>(
      this.token,
      `query LinearIssue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      { id },
    );
    const issue = mapLinearIssue(data.issue);
    if (!issue) {
      throw new LinearClientError("Linear issue not found.", { status: 404, code: "NOT_FOUND" });
    }
    return issue;
  }

  async buildImportDraft(id: string): Promise<{ issue: LinearIssueSummary; draft: LinearImportDraft }> {
    const issue = await this.getIssue(id);
    return {
      issue,
      draft: buildLinearImportDraft(issue),
    };
  }

  async commentOnIssue(issueId: string, body: string): Promise<LinearCommentResult> {
    const data = await executeLinearQuery<{ commentCreate?: { success?: boolean; comment?: unknown } }>(
      this.token,
      `mutation LinearCommentCreate($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment { id body createdAt }
        }
      }`,
      { issueId, body },
    );
    if (!data.commentCreate?.success) {
      throw new LinearClientError("Linear comment creation failed.", { status: 502, code: "COMMENT_CREATE_FAILED" });
    }
    const comment = mapLinearComment(data.commentCreate.comment);
    if (!comment) {
      throw new LinearClientError("Linear comment payload was incomplete.", { status: 502, code: "BAD_RESPONSE" });
    }
    return comment;
  }
}

export function logLinearWarning(error: unknown, message: string, meta?: Record<string, unknown>): void {
  logger.warn({ err: error, ...meta }, message);
}
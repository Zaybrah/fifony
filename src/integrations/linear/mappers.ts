import type {
  LinearCommentResult,
  LinearImportDraft,
  LinearIssueFilters,
  LinearIssueLabel,
  LinearIssueState,
  LinearIssueSummary,
  LinearProjectSummary,
  LinearTeamSummary,
  LinearViewer,
} from "./types.ts";

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNumberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function linearPriorityToLabel(priority: number): string {
  switch (priority) {
    case 1:
      return "Urgent";
    case 2:
      return "High";
    case 3:
      return "Normal";
    case 4:
      return "Low";
    default:
      return "None";
  }
}

export function mapLinearViewer(raw: unknown): LinearViewer | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toStringValue(record.id);
  const name = toStringValue(record.name);
  if (!id || !name) return null;
  const org = record.organization && typeof record.organization === "object"
    ? record.organization as Record<string, unknown>
    : null;
  return {
    id,
    name,
    email: toNullableString(record.email),
    organization: org
      ? {
          id: toOptionalString(org.id),
          name: toOptionalString(org.name),
          urlKey: toNullableString(org.urlKey),
        }
      : null,
  };
}

export function mapLinearTeam(raw: unknown): LinearTeamSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toStringValue(record.id);
  const name = toStringValue(record.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    key: toNullableString(record.key),
  };
}

export function mapLinearProject(raw: unknown): LinearProjectSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toStringValue(record.id);
  const name = toStringValue(record.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    state: toNullableString(record.state),
    icon: toNullableString(record.icon),
  };
}

export function mapLinearIssueLabel(raw: unknown): LinearIssueLabel | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toStringValue(record.id);
  const name = toStringValue(record.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    color: toNullableString(record.color),
  };
}

export function mapLinearIssueState(raw: unknown): LinearIssueState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toStringValue(record.id);
  const name = toStringValue(record.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    type: toNullableString(record.type),
    color: toNullableString(record.color),
  };
}

export function mapLinearIssue(raw: unknown): LinearIssueSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toStringValue(record.id);
  const identifier = toStringValue(record.identifier);
  const title = toStringValue(record.title);
  if (!id || !identifier || !title) return null;
  const labelNodes = record.labels && typeof record.labels === "object"
    ? (record.labels as Record<string, unknown>).nodes
    : [];
  const labels = Array.isArray(labelNodes)
    ? labelNodes.map((node) => mapLinearIssueLabel(node)).filter((node): node is LinearIssueLabel => Boolean(node))
    : [];
  const priority = toNumberValue(record.priority, 0);
  return {
    id,
    identifier,
    title,
    description: toStringValue(record.description),
    priority,
    priorityLabel: linearPriorityToLabel(priority),
    url: toStringValue(record.url),
    team: mapLinearTeam(record.team),
    project: mapLinearProject(record.project),
    labels,
    state: mapLinearIssueState(record.state),
    updatedAt: toNullableString(record.updatedAt),
  };
}

export function mapLinearComment(raw: unknown): LinearCommentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = toStringValue(record.id);
  if (!id) return null;
  return {
    id,
    body: toStringValue(record.body),
    createdAt: toNullableString(record.createdAt),
  };
}

export function buildLinearImportDraft(issue: LinearIssueSummary): LinearImportDraft {
  return {
    title: issue.title,
    description: issue.description,
    labels: issue.labels.map((label) => label.name),
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    linearIssueId: issue.id,
    linearIdentifier: issue.identifier,
    linearUrl: issue.url,
    linearTeamId: issue.team?.id,
    linearProjectId: issue.project?.id,
  };
}

export function buildLinearIssueFilter(filters: LinearIssueFilters): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};
  if (filters.teamId) {
    filter.team = { id: { eq: filters.teamId } };
  }
  if (filters.projectId) {
    filter.project = { id: { eq: filters.projectId } };
  }
  if (filters.label) {
    filter.labels = { name: { eqIgnoreCase: filters.label } };
  }
  if (filters.status) {
    filter.state = { name: { eqIgnoreCase: filters.status } };
  }
  const query = filters.query?.trim();
  if (query) {
    filter.or = [
      { identifier: { eqIgnoreCase: query } },
      { title: { containsIgnoreCase: query } },
      { description: { containsIgnoreCase: query } },
    ];
  }
  return Object.keys(filter).length ? filter : undefined;
}
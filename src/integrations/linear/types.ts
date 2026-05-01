export type LinearViewer = {
  id: string;
  name: string;
  email?: string | null;
  organization?: {
    id?: string;
    name?: string;
    urlKey?: string | null;
  } | null;
};

export type LinearTeamSummary = {
  id: string;
  key?: string | null;
  name: string;
};

export type LinearProjectSummary = {
  id: string;
  name: string;
  state?: string | null;
  icon?: string | null;
};

export type LinearIssueLabel = {
  id: string;
  name: string;
  color?: string | null;
};

export type LinearIssueState = {
  id: string;
  name: string;
  type?: string | null;
  color?: string | null;
};

export type LinearIssueSummary = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  priority: number;
  priorityLabel: string;
  url: string;
  team: LinearTeamSummary | null;
  project: LinearProjectSummary | null;
  labels: LinearIssueLabel[];
  state: LinearIssueState | null;
  updatedAt?: string | null;
};

export type LinearIssueFilters = {
  query?: string;
  teamId?: string;
  projectId?: string;
  label?: string;
  status?: string;
  limit?: number;
  includeArchived?: boolean;
};

export type LinearImportDraft = {
  title: string;
  description: string;
  labels: string[];
  priority: number;
  priorityLabel: string;
  linearIssueId: string;
  linearIdentifier: string;
  linearUrl: string;
  linearTeamId?: string;
  linearProjectId?: string;
};

export type LinearCommentResult = {
  id: string;
  body: string;
  createdAt?: string | null;
};
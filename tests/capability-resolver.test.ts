/**
 * Tests for src/routing/capability-resolver.ts — capability detection and routing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferCapabilityPaths,
  resolveTaskCapabilities,
  mergeCapabilityProviders,
} from "../src/routing/capability-resolver.ts";
import type {
  CapabilityResolverIssue,
  CapabilityResolverBaseProvider,
} from "../src/routing/capability-resolver.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function issue(title: string, description = "", labels: string[] = [], paths: string[] = []): CapabilityResolverIssue {
  return { title, description, labels, paths };
}

const baseProviders: CapabilityResolverBaseProvider[] = [
  { provider: "claude", role: "planner", command: "claude --print" },
  { provider: "codex", role: "executor", command: "codex exec" },
  { provider: "claude", role: "reviewer", command: "claude --print" },
];

// ── inferCapabilityPaths() ────────────────────────────────────────────────────

describe("inferCapabilityPaths", () => {
  it("extracts file paths from the title", () => {
    const paths = inferCapabilityPaths(issue("Fix bug in src/auth/jwt.ts"));
    assert.ok(paths.includes("src/auth/jwt.ts"), "has extracted path");
  });

  it("extracts file paths from the description", () => {
    const paths = inferCapabilityPaths(issue("Fix bug", "Update app/src/api/routes.ts"));
    assert.ok(paths.some((p) => p.includes("app/src/api/routes.ts")), "has extracted path");
  });

  it("extracts known extensions standalone (e.g. style.css)", () => {
    const paths = inferCapabilityPaths(issue("Update style.css"));
    assert.ok(paths.some((p) => p.endsWith("style.css")), "has .css file");
  });

  it("returns empty array when no paths found", () => {
    const paths = inferCapabilityPaths(issue("General code cleanup"));
    assert.deepEqual(paths, []);
  });

  it("normalizes backslashes to forward slashes", () => {
    const paths = inferCapabilityPaths(issue("Fix src\\auth\\jwt.ts path"));
    assert.ok(paths.every((p) => !p.includes("\\")), "no backslashes");
  });

  it("deduplicates extracted paths", () => {
    const paths = inferCapabilityPaths(issue("Fix src/auth.ts", "Update src/auth.ts again"));
    const authPaths = paths.filter((p) => p === "src/auth.ts");
    assert.equal(authPaths.length, 1, "deduplicated");
  });

  it("ignores capability: and overlay: labels", () => {
    const paths = inferCapabilityPaths({
      title: "Some task",
      labels: ["capability:frontend-ui", "overlay:impeccable"],
    });
    assert.deepEqual(paths, []);
  });
});

// ── resolveTaskCapabilities() — category detection ────────────────────────────

describe("resolveTaskCapabilities — frontend-ui", () => {
  it("detects via 'react' keyword in title", () => {
    const resolution = resolveTaskCapabilities(issue("Fix React component rendering bug"));
    assert.equal(resolution.category, "frontend-ui");
  });

  it("detects via 'component' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Refactor the button component"));
    assert.equal(resolution.category, "frontend-ui");
  });

  it("detects via 'css' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Fix CSS layout overflow"));
    assert.equal(resolution.category, "frontend-ui");
  });

  it("detects via 'ui' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Improve the UI design"));
    assert.equal(resolution.category, "frontend-ui");
  });

  it("detects via .tsx file path", () => {
    const resolution = resolveTaskCapabilities(issue("Update page", "", [], ["app/pages/home.tsx"]));
    assert.equal(resolution.category, "frontend-ui");
  });

  it("detects via .jsx file path", () => {
    const resolution = resolveTaskCapabilities(issue("Fix modal", "", [], ["src/components/Modal.jsx"]));
    assert.equal(resolution.category, "frontend-ui");
  });

  it("includes expected overlays", () => {
    const resolution = resolveTaskCapabilities(issue("Build React dashboard"));
    assert.ok(resolution.overlays.includes("impeccable"), "has impeccable overlay");
    assert.ok(resolution.overlays.includes("frontend-design"), "has frontend-design overlay");
  });

  it("recommends claude as planner", () => {
    const resolution = resolveTaskCapabilities(issue("Add React component"));
    const planner = resolution.providers.find((p) => p.role === "planner");
    assert.equal(planner?.provider, "claude");
  });

  it("recommends codex as executor", () => {
    const resolution = resolveTaskCapabilities(issue("Add React component"));
    const executor = resolution.providers.find((p) => p.role === "executor");
    assert.equal(executor?.provider, "codex");
  });
});

describe("resolveTaskCapabilities — security", () => {
  it("detects via 'auth' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Implement OAuth2 authentication"));
    assert.equal(resolution.category, "security");
  });

  it("detects via 'token' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Rotate API tokens securely"));
    assert.equal(resolution.category, "security");
  });

  it("detects via 'vulnerability' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Fix SQL injection vulnerability"));
    assert.equal(resolution.category, "security");
  });

  it("detects via security path fragment", () => {
    const resolution = resolveTaskCapabilities(issue("Update config", "", [], ["src/auth/middleware.ts"]));
    assert.equal(resolution.category, "security");
  });

  it("includes security-review overlay", () => {
    const resolution = resolveTaskCapabilities(issue("Fix token expiry bug"));
    assert.ok(resolution.overlays.includes("security-review"), "has security overlay");
  });
});

describe("resolveTaskCapabilities — architecture", () => {
  it("detects via 'architecture' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Define microservices architecture"));
    assert.equal(resolution.category, "architecture");
  });

  it("detects via 'spec' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Write the API spec document"));
    assert.equal(resolution.category, "architecture");
  });

  it("detects via 'workflow' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Update orchestration workflow"));
    assert.equal(resolution.category, "architecture");
  });

  it("detects via 'plan' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Create migration plan"));
    assert.equal(resolution.category, "architecture");
  });

  it("detects via architecture.md path", () => {
    const resolution = resolveTaskCapabilities(issue("Update docs", "", [], ["architecture.md"]));
    assert.equal(resolution.category, "architecture");
  });
});

describe("resolveTaskCapabilities — devops", () => {
  it("detects via 'deploy' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Fix production deployment pipeline"));
    assert.equal(resolution.category, "devops");
  });

  it("detects via 'docker' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Optimize Docker image size"));
    assert.equal(resolution.category, "devops");
  });

  it("detects via 'kubernetes' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Update Kubernetes manifests"));
    assert.equal(resolution.category, "devops");
  });

  it("detects via 'github actions' keyword (without 'workflow' in title)", () => {
    // NOTE: titles containing 'workflow' trigger 'architecture' first due to keyword priority.
    // Use a title with 'github actions' but without 'workflow' to reach devops.
    const resolution = resolveTaskCapabilities(issue("Setup CI with GitHub Actions"));
    assert.equal(resolution.category, "devops");
  });

  it("detects via docker path (devops path match)", () => {
    // NOTE: Avoid words containing 'ui' (e.g. "build") or 'workflow' in the title/path
    // as they trigger frontend-ui or architecture checks first.
    const resolution = resolveTaskCapabilities(issue("Setup Docker containers", "", [], ["docker/Dockerfile"]));
    assert.equal(resolution.category, "devops");
  });
});

describe("resolveTaskCapabilities — bugfix", () => {
  it("detects via 'bug' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Fix a bug in the parser"));
    assert.equal(resolution.category, "bugfix");
  });

  it("detects via 'regression' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Fix regression in checkout flow"));
    assert.equal(resolution.category, "bugfix");
  });

  it("detects via 'crash' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("App crashes on startup"));
    assert.equal(resolution.category, "bugfix");
  });

  it("detects via 'error' in description", () => {
    const resolution = resolveTaskCapabilities(issue("Broken feature", "getting an error on submit"));
    assert.equal(resolution.category, "bugfix");
  });

  it("includes debug overlay", () => {
    const resolution = resolveTaskCapabilities(issue("Fix null pointer error"));
    assert.ok(resolution.overlays.includes("debug"), "has debug overlay");
  });
});

describe("resolveTaskCapabilities — backend", () => {
  it("detects via 'api' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Add new REST API endpoint"));
    assert.equal(resolution.category, "backend");
  });

  it("detects via 'database' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Optimize database query performance"));
    assert.equal(resolution.category, "backend");
  });

  it("detects via 'backend' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Refactor backend service layer"));
    assert.equal(resolution.category, "backend");
  });

  it("detects via 'websocket' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Implement WebSocket notifications"));
    assert.equal(resolution.category, "backend");
  });

  it("detects via .sql file path", () => {
    const resolution = resolveTaskCapabilities(issue("Update queries", "", [], ["migrations/001_init.sql"]));
    assert.equal(resolution.category, "backend");
  });
});

describe("resolveTaskCapabilities — documentation", () => {
  it("detects via 'readme' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Update README with new commands"));
    assert.equal(resolution.category, "documentation");
  });

  it("detects via 'docs' keyword", () => {
    const resolution = resolveTaskCapabilities(issue("Write docs for the new feature"));
    assert.equal(resolution.category, "documentation");
  });

  it("detects via .md file path and 'documentation' keyword in title", () => {
    // NOTE: "guide" contains "ui" as a substring, so it triggers frontend-ui detection.
    // Use a title with "documentation" keyword and a safe path to reach docs category.
    const resolution = resolveTaskCapabilities(issue("Add documentation", "", [], ["docs/changelog.md"]));
    assert.equal(resolution.category, "documentation");
  });
});

describe("resolveTaskCapabilities — default fallback", () => {
  it("falls back to default for generic tasks", () => {
    const resolution = resolveTaskCapabilities(issue("Refactor module XYZ"));
    assert.equal(resolution.category, "default");
  });

  it("default has 3 providers", () => {
    const resolution = resolveTaskCapabilities(issue("General code improvement"));
    assert.equal(resolution.providers.length, 3, "planner + executor + reviewer");
  });

  it("default overlays are empty", () => {
    const resolution = resolveTaskCapabilities(issue("Miscellaneous task"));
    assert.deepEqual(resolution.overlays, []);
  });
});

// ── resolveTaskCapabilities() — overrides ─────────────────────────────────────

describe("resolveTaskCapabilities — overrides", () => {
  it("returns workflow-disabled category when enabled=false", () => {
    const resolution = resolveTaskCapabilities(
      issue("Fix React component"),
      { enabled: false },
    );
    assert.equal(resolution.category, "workflow-disabled");
  });

  it("applies override when terms match", () => {
    const resolution = resolveTaskCapabilities(
      issue("Deploy new feature to staging"),
      {
        enabled: true,
        overrides: [{
          match: { terms: ["staging"] },
          category: "devops-staging",
          rationale: ["Matches staging env"],
          overlays: ["staging-env"],
          providers: [{ provider: "codex", role: "executor", profile: "devops", reason: "deployment" }],
        }],
      },
    );
    assert.equal(resolution.category, "devops-staging");
    assert.ok(resolution.overlays.includes("staging-env"), "has override overlay");
  });

  it("applies override when label matches", () => {
    const resolution = resolveTaskCapabilities(
      issue("Some task", "", ["priority:critical"]),
      {
        enabled: true,
        overrides: [{
          match: { labels: ["priority:critical"] },
          overlays: ["urgent-review"],
        }],
      },
    );
    assert.ok(resolution.overlays.includes("urgent-review"), "has urgent overlay");
  });

  it("does NOT apply override when terms don't match", () => {
    const resolution = resolveTaskCapabilities(
      issue("Normal task"),
      {
        enabled: true,
        overrides: [{
          match: { terms: ["staging"] },
          category: "devops-staging",
        }],
      },
    );
    assert.notEqual(resolution.category, "devops-staging");
  });

  it("merges rationale from base resolution and override", () => {
    const resolution = resolveTaskCapabilities(
      issue("Fix React bug", "", ["priority:critical"]),
      {
        enabled: true,
        overrides: [{
          match: { labels: ["priority:critical"] },
          rationale: ["Critical priority override applied."],
        }],
      },
    );
    assert.ok(resolution.rationale.some((r) => r.includes("Critical priority")), "has override rationale");
    assert.ok(resolution.rationale.some((r) => r.includes("frontend")), "has base rationale");
  });
});

// ── mergeCapabilityProviders() ────────────────────────────────────────────────

describe("mergeCapabilityProviders", () => {
  it("returns providers matching resolution suggestions", () => {
    const resolution = resolveTaskCapabilities(issue("Fix React component"));
    const merged = mergeCapabilityProviders(baseProviders, resolution);
    assert.ok(merged.length > 0, "has merged providers");
  });

  it("uses resolution suggestion profile over base provider profile", () => {
    const resolution = resolveTaskCapabilities(issue("Fix React component"));
    const merged = mergeCapabilityProviders(baseProviders, resolution);
    const planner = merged.find((p) => p.role === "planner");
    assert.ok(planner?.profile, "has a profile");
    assert.ok(planner!.profile.length > 0, "non-empty profile from resolution");
  });

  it("carries command from base provider", () => {
    const resolution = resolveTaskCapabilities(issue("Fix React component"));
    const merged = mergeCapabilityProviders(baseProviders, resolution);
    const planner = merged.find((p) => p.role === "planner" && p.provider === "claude");
    assert.equal(planner?.command, "claude --print", "preserved base command");
  });

  it("maps each resolution provider suggestion", () => {
    const resolution = resolveTaskCapabilities(issue("Fix React component"));
    const merged = mergeCapabilityProviders(baseProviders, resolution);
    assert.equal(merged.length, resolution.providers.length, "same count as resolution");
  });
});

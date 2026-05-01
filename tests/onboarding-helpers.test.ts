import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canProceedFromSetup,
  isGitReadyForWorktrees,
  primeCompletedOnboardingSettings,
} from "../app/src/components/OnboardingWizard/helpers.js";
import { getSettingValue, getSettingsList, SETTINGS_QUERY_KEY } from "../app/src/settings-payload.js";

describe("onboarding git readiness helpers", () => {
  it("requires git and at least one commit for setup completion", () => {
    assert.equal(isGitReadyForWorktrees(null), false);
    assert.equal(isGitReadyForWorktrees({ isGit: false, hasCommits: false }), false);
    assert.equal(isGitReadyForWorktrees({ isGit: true, hasCommits: false }), false);
    assert.equal(isGitReadyForWorktrees({ isGit: true, hasCommits: true }), true);
  });

  it("blocks setup progression when project name or git readiness is missing", () => {
    assert.equal(canProceedFromSetup("", { isGit: true, hasCommits: true }), false);
    assert.equal(canProceedFromSetup("my-project", { isGit: false, hasCommits: false }), false);
    assert.equal(canProceedFromSetup("my-project", { isGit: true, hasCommits: false }), false);
    assert.equal(canProceedFromSetup("my-project", { isGit: true, hasCommits: true }), true);
  });

  it("cancels in-flight settings queries before priming completed onboarding", async () => {
    const calls = [];
    let payload = {
      success: true,
      data: [
        { id: "ui.onboarding.completed", scope: "ui", value: false, source: "user", updatedAt: "2026-05-01T09:56:00.000Z" },
      ],
    };
    const qc = {
      async cancelQueries(arg) {
        calls.push({ type: "cancelQueries", arg });
      },
      setQueryData(queryKey, updater) {
        calls.push({ type: "setQueryData", queryKey });
        payload = updater(payload);
      },
    };

    await primeCompletedOnboardingSettings(qc, "system.projectName", "fifony");

    assert.deepEqual(calls.map((entry) => entry.type), ["cancelQueries", "setQueryData", "setQueryData"]);
    assert.deepEqual(calls[0].arg, { queryKey: SETTINGS_QUERY_KEY });
    assert.deepEqual(calls[1].queryKey, SETTINGS_QUERY_KEY);
    assert.deepEqual(calls[2].queryKey, SETTINGS_QUERY_KEY);
    assert.equal(getSettingValue(getSettingsList(payload), "system.projectName", ""), "fifony");
    assert.equal(getSettingValue(getSettingsList(payload), "ui.onboarding.completed", false), true);
  });
});

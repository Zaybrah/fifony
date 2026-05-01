import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodePersistedSettingObjectRows } from "../src/persistence/settings-objects.ts";

describe("settings object fallback loader", () => {
  it("decodes persisted settings from raw sqlite object rows", () => {
    const settings = decodePersistedSettingObjectRows([
      {
        key: "resource=settings\\data\\id=ui.onboarding.completed",
        metadata: JSON.stringify({ 1: "ui", 2: "true", 3: "user", _v: "v1" }),
        last_modified: "2026-05-01T10:04:40.261Z",
      },
      {
        key: "resource=settings/data/id=runtime.defaultEffort",
        metadata: JSON.stringify({ 1: "runtime", 2: '{"default":"medium","executor":"high"}', 3: "user", _v: "v1" }),
        last_modified: "2026-05-01T10:04:40.293Z",
      },
      {
        key: "resource=settings\\data\\id=runtime.workerConcurrency",
        metadata: JSON.stringify({ 1: "runtime", 2: "3", 3: "user", _v: "v1" }),
        last_modified: "2026-05-01T10:04:40.310Z",
      },
    ]);

    assert.deepEqual(settings, [
      {
        id: "runtime.defaultEffort",
        scope: "runtime",
        value: { default: "medium", executor: "high" },
        source: "user",
        updatedAt: "2026-05-01T10:04:40.293Z",
      },
      {
        id: "runtime.workerConcurrency",
        scope: "runtime",
        value: 3,
        source: "user",
        updatedAt: "2026-05-01T10:04:40.310Z",
      },
      {
        id: "ui.onboarding.completed",
        scope: "ui",
        value: true,
        source: "user",
        updatedAt: "2026-05-01T10:04:40.261Z",
      },
    ]);
  });

  it("keeps the latest row when the same setting id appears multiple times", () => {
    const settings = decodePersistedSettingObjectRows([
      {
        key: "resource=settings\\data\\id=ui.onboarding.completed",
        metadata: JSON.stringify({ 1: "ui", 2: "false", 3: "user", _v: "v1" }),
        last_modified: "2026-05-01T10:04:39.000Z",
      },
      {
        key: "resource=settings\\data\\id=ui.onboarding.completed",
        metadata: JSON.stringify({ 1: "ui", 2: "true", 3: "user", _v: "v1" }),
        last_modified: "2026-05-01T10:04:40.261Z",
      },
    ]);

    assert.deepEqual(settings, [
      {
        id: "ui.onboarding.completed",
        scope: "ui",
        value: true,
        source: "user",
        updatedAt: "2026-05-01T10:04:40.261Z",
      },
    ]);
  });
});
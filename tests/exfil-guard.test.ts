import { test } from "node:test";
import assert from "node:assert/strict";

import {
  scanForSecrets,
  redactSecrets,
  assertNoSecrets,
  SecretLeakError,
} from "../src/concerns/exfil-guard.ts";

test("clean text passes through untouched", () => {
  const text = "no secrets here, just regular code: const x = 42;";
  const result = scanForSecrets(text);
  assert.equal(result.clean, text);
  assert.deepEqual(result.leaked, []);
});

test("anthropic key is redacted", () => {
  const key = "sk-ant-api03-" + "a".repeat(80);
  const result = scanForSecrets(`token=${key} more text`);
  assert.match(result.clean, /token=\[REDACTED\] more text/);
  assert.equal(result.leaked.length, 1);
  assert.equal(result.leaked[0].pattern, "anthropic-api-key");
});

test("github token is redacted", () => {
  const text = "GH_TOKEN=ghp_" + "A".repeat(36);
  const result = scanForSecrets(text);
  assert.match(result.clean, /GH_TOKEN=\[REDACTED\]/);
  assert.equal(result.leaked[0].pattern, "github-token");
});

test("AWS access key is redacted", () => {
  const text = "aws=AKIAIOSFODNN7EXAMPLE rest";
  const result = scanForSecrets(text);
  assert.match(result.clean, /aws=\[REDACTED\] rest/);
});

test("private key block is redacted in full", () => {
  const text = `before
-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBALR9Q3tZ
-----END RSA PRIVATE KEY-----
after`;
  const result = scanForSecrets(text);
  assert.match(result.clean, /\[REDACTED\]/);
  assert.doesNotMatch(result.clean, /BEGIN RSA PRIVATE KEY/);
  assert.equal(result.leaked[0].pattern, "private-key-block");
});

test("env var values are detected", () => {
  process.env.FIFONY_EXFIL_TEST_KEY = "this-is-a-very-secret-token-12345";
  try {
    const text = "leaked value: this-is-a-very-secret-token-12345 oops";
    const result = scanForSecrets(text);
    assert.match(result.clean, /\[REDACTED\] oops/);
    assert.ok(result.leaked.some((l) => l.pattern === "env:FIFONY_EXFIL_TEST_KEY"));
  } finally {
    delete process.env.FIFONY_EXFIL_TEST_KEY;
  }
});

test("env var base64-encoded variant is detected", () => {
  const value = "another-very-secret-value-67890-xyz";
  process.env.FIFONY_EXFIL_TEST_TOKEN = value;
  try {
    const encoded = Buffer.from(value, "utf8").toString("base64");
    const result = scanForSecrets(`payload=${encoded}`);
    assert.match(result.clean, /\[REDACTED\]/);
    assert.ok(result.leaked.some((l) => l.pattern.startsWith("env:FIFONY_EXFIL_TEST_TOKEN")));
  } finally {
    delete process.env.FIFONY_EXFIL_TEST_TOKEN;
  }
});

test("path-like env vars are not treated as secrets", () => {
  // PATH is in denylist and shouldn't trigger even though it contains "PATH"
  const text = `PATH inside text: ${process.env.PATH ?? "/usr/bin"}`;
  const result = scanForSecrets(text);
  assert.equal(result.leaked.length, 0);
});

test("duplicate occurrences of same secret deduplicate in match list", () => {
  const key = "ghp_" + "B".repeat(36);
  const text = `${key} ${key} ${key}`;
  const result = scanForSecrets(text);
  assert.equal(result.leaked.length, 1);
});

test("redactSecrets returns the cleaned string", () => {
  const text = "hello AKIAIOSFODNN7EXAMPLE world";
  const cleaned = redactSecrets(text);
  assert.match(cleaned, /hello \[REDACTED\] world/);
});

test("assertNoSecrets passes on clean text", () => {
  assert.doesNotThrow(() => assertNoSecrets("nothing to see here", "test"));
});

test("assertNoSecrets throws SecretLeakError with context", () => {
  const text = "leaked AKIAIOSFODNN7EXAMPLE here";
  try {
    assertNoSecrets(text, "git-commit");
    assert.fail("expected SecretLeakError");
  } catch (err) {
    assert.ok(err instanceof SecretLeakError);
    assert.equal((err as SecretLeakError).context, "git-commit");
    assert.match((err as Error).message, /git-commit/);
  }
});

test("empty input is safe", () => {
  const result = scanForSecrets("");
  assert.equal(result.clean, "");
  assert.equal(result.leaked.length, 0);
});

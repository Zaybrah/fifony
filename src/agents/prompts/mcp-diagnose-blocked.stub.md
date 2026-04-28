# Blocked Issue Diagnostic — {{issueId}}

## Issue
- **Title**: {{title}}
- **State**: {{state}}
- **Attempts**: {{attempts}} / {{maxAttempts}}
- **Last Error**: {{lastError}}
- **Updated At**: {{updatedAt}}

## Plan
{{#if hasPlan}}
- **Summary**: {{planSummary}}
- **Complexity**: {{planComplexity}}
- **Steps**: {{planStepsCount}}
{{else}}
No plan generated yet.
{{/if}}

## Attempt History
{{#if history.length}}
{{#each history}}
- {{this}}
{{/each}}
{{else}}
No attempt history.
{{/if}}

## Recent Events
{{#if recentEvents.length}}
{{#each recentEvents}}
- [{{kind}}] {{at}}: {{message}}
{{/each}}
{{else}}
No events recorded.
{{/if}}

## Diagnostic Framework

### Step 1 — Classify the block type

| Type | Signal | Recovery |
|------|--------|----------|
| **Stall** | Same error class in last 2+ attempts | Replan — the approach is wrong |
| **Logic error** | Clear root cause, fixable in code | Retry with injected fix context |
| **Test failure** | Tests exist, executor broke them | Retry with test output as context |
| **Permission / secret** | Missing env var, auth error | Human must configure, then retry |
| **External service** | Network/API failure not in our code | Retry or escalate to human |
| **Scope confusion** | Executor drifted from the plan | Replan with tighter contract |

### Step 2 — Stall detection

If the last 2 or more attempts share the same error class (not just same message — same root cause category), this is a **stall**. Continuing to retry without changing the plan will not converge.

**Stall trigger → recommend replan**, not retry.

### Step 3 — Replan vs retry vs escalate

- **Retry** when: the error is specific, the fix is clear, fewer than 3 attempts, no stall detected.
- **Replan** when: stall detected, scope confusion, the plan's acceptance criteria are wrong or untestable.
- **Escalate to human** when: missing credentials/secrets, external service outage, plan conflict requires a product decision.

## Your analysis

Based on the information above:
1. Classify the block type (from the table above).
2. Check for stall: do the last 2+ attempts share the same error root cause?
3. Give a one-sentence root cause statement.
4. State the recommended action: **retry** / **replan** / **escalate**, with the specific reason.
5. If retry: what exact context should be injected into the next prompt?
6. If replan: what part of the current plan is wrong?
7. If escalate: who should handle it and what do they need to do?

## Execution Plan

Complexity: {{estimatedComplexity}}
Summary: {{summary}}

Steps:
{{#each steps}}
{{step}}. {{action}}{{#if files.length}} (files: {{files | join ", "}}){{/if}}{{#if details}} — {{details}}{{/if}}
{{#if doneWhen}}   ✓ done when: {{doneWhen}}{{/if}}
{{/each}}

Each step has a `done when` criterion. Do not advance to the next step until the criterion is met.
Complete each step in order. The `execution-payload.json` in the workspace contains the full plan with acceptance criteria — use it as the source of truth.

You are helping improve issue metadata for a software execution queue.
Rewrite the description to be clearer, complete, and directly actionable.

Issue type: {{issueType}}
Current title: {{title}}
Current description: {{description}}
{{#if images}}
Visual evidence (attached screenshots for context):
{{#each images}}
- {{this}}
{{/each}}
{{/if}}

Rules:
- SIMPLICITY FIRST: describe the smallest change that solves the problem. Do NOT suggest refactoring, re-architecting, or expanding scope beyond what was asked.
- Keep it short — 3-8 lines max. No walls of text. No essays. A 1-line input should produce a 2-4 line output, not a specification document.
- For "bug": what's broken, what's expected. That's it.
- For "feature": what to add, where. No elaboration on alternatives or future work.
- For "refactor": current state → desired state. Minimal scope.
- For "docs": what to document.
- For "chore": what to do and why.
- Do NOT add acceptance criteria, test plans, or implementation details — the planner handles that.
- Do NOT inflate a simple request into a complex one. If the user said "fix the typo in header", the description is about fixing a typo — not about "comprehensive text review".
- Use bullet points. No ## headings unless truly needed.
- The value should be in Portuguese if the input is in Portuguese; otherwise in English.

After your analysis, return a single JSON code block as the LAST thing in your output:
```json
{ "field": "description", "value": "<REPLACE_WITH_ACTUAL_DESCRIPTION>" }
```

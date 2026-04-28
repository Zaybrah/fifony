# Start Skill — Sharpen a vague request into a structured brief

Use this skill to turn an ambiguous issue description into a precise, actionable brief before planning. Two phases run automatically.

## Phase 1 — Structured brief (text-only, no file reads)

Rewrite the request into a 7-section brief:

1. **Objective** — one sentence.
2. **Success criteria** — testable, observable outcomes. Each starts with a verb.
3. **Scope** — what is in / what is explicitly out.
4. **Assumptions** — implicit things marked `assumed:` so the user can challenge them.
5. **Open questions** — ambiguities that must be resolved before execution starts. Only real blockers — omit if none.
6. **Suggested execution order** — numbered steps, only when the direction is clear enough.
7. **Next step** — a closing handoff line pointing toward plan approval.

**Silent diagnostic pass before emitting** (do not show in output): scan the request for these anti-patterns and fix them inline:
- Vague verb (improve, fix, handle) with no specifics
- Two tasks in one
- No observable success signal
- Implicit reference ("the button", "the modal")
- No stop condition
- Scope creep (implies changes beyond what was asked)

**Rules:**
- Do NOT produce code. This is a thinking phase.
- Keep the brief concise — every line must be load-bearing.
- All output in English, regardless of input language.

## Phase 2 — Grilling loop (always runs after Phase 1)

For each Open Question in the brief, ask the user **one question at a time** and wait for their answer before asking the next.

Hard rules for Phase 2:
- **One question at a time.** Never present a list of questions.
- **If the answer is in the codebase, read the codebase instead of asking.** Use file reads, grep, or explore. Only ask when the answer is genuinely not inferable.
- **For each question you ask, provide your recommended answer.** No bare interrogatives.
- **Walk depth-first.** Resolve each branch fully before opening the next.
- **Do not produce code.** Phase 2 is still alignment, not execution.

## Phase 2 close

When every Open Question is resolved or explicitly deferred, emit a one-paragraph **Sharpened brief** that summarizes the resolved decisions and explicit deferrals, then suggest approving the plan.

## When to use

- The issue description is short, vague, or mixes multiple concerns.
- Before approving a plan that feels under-specified.
- When handing a task to an agent — sharpen the prompt first so the agent has an unambiguous brief.

## When NOT to use

- The description is already precise with acceptance criteria.
- The user wants the work done now, not the prompt clarified.

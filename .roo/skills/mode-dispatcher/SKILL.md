---
name: mode-dispatcher
description: >
  Entry-point router that picks the most beneficial mode for a task by
  combining the built-in Zoo modes (architect, code, ask, debug,
  orchestrator, merge-resolver, skill-writer) with the SuperRoo
  superpowers skill-modes (test-driven-development, systematic-debugging,
  brainstorming, writing-plans, executing-plans, requesting-code-review,
  and 14 more). Use when starting any non-trivial task and you are unsure
  which mode to use, when the user asks "which mode should I use", or when
  a task spans multiple specialties. Keywords: dispatch, route, mode
  selection, which mode, superpowers, skill-mode, workflow selection.
---

# Mode Dispatcher

A **router, not a doer**. This skill never implements work itself. It
classifies the task, consults the decision matrix below, and hands off to
exactly one mode — a built-in Zoo mode or a SuperRoo superpowers
skill-mode — whichever is most beneficial for the task.

## When to use this skill

- Starting a non-trivial task and you are unsure which mode fits best.
- The user asks "which mode should I use for X?"
- A task spans multiple specialties (e.g., design + implementation + review).
- You want a consistent, auditable entry point instead of ad-hoc mode picks.

## When NOT to use this skill

- The user **explicitly named a mode** (e.g., "use TDD", "switch to
  architect"). Go straight there — do not re-route.
- **Trivial one-off edits** (rename a variable, fix a typo, tweak a CSS
  value). Use `code` directly; dispatching is overhead.
- **Pure questions** with no code change. Use `ask` directly.
- You are **already inside** a superpowers skill-mode mid-workflow. Do not
  bounce back to the dispatcher; finish the current workflow.

## Inputs required

- The user's task description (their own words are best).
- Optional: any constraints the user stated (deadline, "no tests",
  "just explain it").

## Workflow

1. **Classify the task.** Read the request and identify:
   - Task type (feature, bug, design, plan, review, question, merge, meta).
   - Domain (gameplay/visual/behavior vs. pure logic vs. infrastructure).
   - Stakes (throwaway experiment vs. production behavior).
2. **Apply the game-dev override FIRST.** If the task changes gameplay,
   visuals, or any subjective behavior in this game project, the
   playtest-first rule wins over every other row in the matrix. Route to
   `code` with the playtest-first handoff (see below).
3. **Consult the decision matrix.** Pick the single best row. If two rows
   tie, prefer the superpowers skill-mode (process discipline beats general
   capability) unless the task is explicitly about orchestration or merges.
4. **Announce the routing decision** to the user in one or two lines:
   which mode, and why (one sentence of reasoning).
5. **Hand off** using the matching mechanism:
   - Built-in mode → `switch_mode(mode_slug, reason)`.
   - Superpowers skill-mode → `new_task(mode, message)` with the user's
     original request plus any context you gathered.
6. **Stop.** Do not continue working in the dispatcher. The target mode
   owns the task from here.

## Decision matrix

Priority order: game-dev override (step 2) → matrix rows top to bottom.
First matching row wins.

| # | Task type | Route to | System | Why |
|---|-----------|----------|--------|-----|
| 0 | Gameplay / visual / behavior change (game project) | `code` + playtest-first handoff | Built-in | Feel is subjective; TDD would lock in unverified expectations. Implement, hand off for playtest, lock tests only after user confirms. |
| 1 | New feature or bug fix in **pure logic** (no subjective feel) | `test-driven-development` | Superpowers | Enforces RED-GREEN-REFACTOR; failing test first proves the test tests the right thing. |
| 2 | Bug, failing test, or "something is broken" | `systematic-debugging` | Superpowers | 4-phase root-cause investigation before any fix; prevents symptom-patching. |
| 3 | Multiple independent bugs or investigations | `dispatching-parallel-agents` | Superpowers | Concurrent independent investigations beat serial guessing. |
| 4 | "How should I design X?" / open-ended design question | `brainstorming` | Superpowers | Socratic refinement before committing to an approach. |
| 5 | "Make a plan for X" / large feature scoping | `writing-plans` | Superpowers | Comprehensive plan written assuming zero context. |
| 6 | "Execute this plan" (plan already exists) | `executing-plans` | Superpowers | Batch execution with review checkpoints. |
| 7 | "Review my code" / review a diff or PR | `requesting-code-review` | Superpowers | Rigorous review against plan and standards. |
| 8 | Processing review feedback you received | `receiving-code-review` | Superpowers | Structured triage of feedback before acting on it. |
| 9 | Multi-domain project needing coordination across specialties | `orchestrator` | Built-in | Cross-specialty task decomposition and coordination. |
| 10 | Merge conflict on a specific PR | `merge-resolver` | Built-in | Git-history-aware conflict resolution. |
| 11 | Quick question, explanation, or documentation lookup | `ask` | Built-in | No code change; no process overhead needed. |
| 12 | Trivial one-off edit (typo, rename, small tweak) | `code` | Built-in | Dispatching is overhead for one-line changes. |
| 13 | Creating or editing a skill (SKILL.md) | `skill-writer` | Built-in | Meta-work on skills has its own spec-compliance workflow. |
| 14 | Architecture / system design that needs a written spec | `architect` | Built-in | Planning and design artifacts without a superpowers plan workflow. |

### Tie-breakers

- **Process vs. capability:** if a superpowers skill and a built-in mode
  both fit, prefer the superpowers skill — it enforces a discipline the
  built-in mode does not.
- **Plan exists?** if a written plan is already in `docs/plans/`, route to
  `executing-plans`, not `writing-plans`.
- **User overrode:** any explicit user instruction about which mode to use
  beats the entire matrix.

## Handoff templates

### To a superpowers skill-mode

```
new_task(
  mode: "<skill-slug>",
  message: "<user's original request, verbatim> — routed by mode-dispatcher: <one-line reason>"
)
```

### To a built-in mode

```
switch_mode(
  mode_slug: "<mode-slug>",
  reason: "<one-line reason from the matrix>"
)
```

### Game-dev override handoff (row 0)

When routing to `code` for gameplay/visual/behavior work, the handoff
message MUST include the playtest-first contract:

1. Implement the requested change.
2. Hand off to the user with **specific playtest instructions** (what to
   do, what to look for, what "correct" looks like).
3. Wait for user confirmation.
4. Only after confirmation, write tests that lock in the behavior.

## Examples

**Example 1 — feature in pure logic**
User: "Add a cooldown system to the interaction module."
→ Row 1: `new_task(mode: "test-driven-development", ...)` — pure logic,
TDD discipline applies.

**Example 2 — gameplay feel**
User: "Make the player's jump feel snappier."
→ Row 0 (override): `switch_mode(mode_slug: "code", ...)` with the
playtest-first contract — jump feel is subjective; playtest before tests.

**Example 3 — bug**
User: "Shadows flicker when the player crosses a room boundary."
→ Row 2: `new_task(mode: "systematic-debugging", ...)` — root cause first.

**Example 4 — explicit user choice**
User: "Use the architect mode to sketch the lighting redesign."
→ No dispatch. The user named the mode; go straight to `architect`.

**Example 5 — typo**
User: "Fix the typo in src/texts.js line 12."
→ Row 12: `switch_mode(mode_slug: "code", ...)` — trivial, no process.

## Troubleshooting

- **No row matches.** Default to `ask` if the request is informational,
  otherwise `code`. Tell the user no matrix row matched and why you
  defaulted.
- **Task changes mid-flight.** If the routed mode discovers the task is
  actually a different type (e.g., a "feature" turns out to be a bug),
  that mode may re-route back through this skill. Do not force the
  original route.
- **Matrix row conflicts with user rules.** The workspace rules
  (`.roo/rules/superroo-workspace.md`) are the source of truth for
  non-negotiables (playtest-first, verification before completion claims,
  root cause before fixes). If a matrix row would violate a rule, the
  rule wins.

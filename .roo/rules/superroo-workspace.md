# SuperRoo Development Methodology

This workspace enforces SuperRoo development discipline.

---

## Mode Selection: Use the Dispatcher

This workspace has **two complementary mode systems**:

1. **Built-in Zoo modes** (general capabilities): `architect`, `code`,
   `ask`, `debug`, `orchestrator`, `merge-resolver`, `skill-writer`.
2. **SuperRoo superpowers skill-modes** (process disciplines):
   `test-driven-development`, `systematic-debugging`, `brainstorming`,
   `writing-plans`, `executing-plans`, `requesting-code-review`, and
   14 more.

**Single entry point:** for any non-trivial task, invoke the
**`mode-dispatcher`** skill (`.roo/skills/mode-dispatcher/SKILL.md`). It
consults a context-aware decision matrix and routes to whichever system is
most beneficial — a built-in mode or a superpowers skill-mode — then hands
off. It is a router, not a doer.

Skip the dispatcher only when:
- ⚠️ The user explicitly named a mode (go straight there)
- ⚠️ Trivial one-off edits (use `code` directly)
- ⚠️ Quick questions with no code change (use `ask` directly)
- ⚠️ You are already inside a superpowers skill-mode mid-workflow

Slash commands remain available for direct access:
- `/tdd` - Test-driven development
- `/debug` - Systematic debugging
- `/brainstorm` - Design refinement
- `/write-plan` - Create implementation plan
- `/execute-plan` - Execute plan with TDD
- `/review` - Request code review
- `/finish` - Complete the development branch

**Do NOT bypass the dispatcher for convenience on serious work.**
When in doubt, dispatch. The matrix exists for a reason.

---

## Communication and Tool Usage

**ALWAYS communicate before using tools:**
- Explain what you're about to do BEFORE making function calls
- Output text to communicate with the user (user sees your text, not raw function calls)
- NEVER use bash echo or code comments as means to communicate
- Example:
  - Bad: immediately calls Read tool without explanation
  - Good: "Let me check the implementation..." then calls Read tool

**Use new_task() for complex tasks:**
- Spawn subagents when task has 3+ distinct steps
- Use appropriate mode for the subtask
- Keep exactly ONE subtask in_progress at a time
- Don't spawn subagents for simple single-step tasks

**Tool usage patterns:**
- Read files in parallel when gathering context
- Explain findings after reading
- Show command output when verifying claims

---

---

## Core Principles (Non-Negotiable)

These apply ALWAYS, even if temporarily outside superpowers modes:

### 🎮 PLAYTEST BEFORE LOCKING TESTS (Game Dev)

This is a game project — behavior is finicky and hard to specify up front.
Do NOT rely on strict TDD. Instead:
1. Make the requested changes.
2. Hand off to the user for playtesting with specific test instructions.
3. Only after the user confirms the correct behavior, write tests that lock it in.
Never assume tests written before the user's playtest are correct.

### ✅ NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION

Before saying "done," "fixed," or "passing," run the verification command
and show the output. Evidence before assertions, always.

### 🔍 ROOT CAUSE INVESTIGATION BEFORE FIXES

No fixes without understanding the root cause first.
Patching symptoms creates more bugs.

### 👁️ REVIEW EARLY, REVIEW OFTEN

Code review is automatic after task completion (test-driven-development/systematic-debugging).
Catch issues before they compound.

---

## Playtest-First Workflow (Game Dev)

For any gameplay/visual/behavior change, follow this sequence:

1. **Implement** the requested change.
2. **Hand off to the user** for playtesting. Provide specific, concrete test
   instructions (what to do, what to look for, what "correct" looks like).
3. **Wait for user confirmation** that the behavior is correct.
4. **Only then** write tests that lock in the confirmed behavior.

Rules:
- Do NOT write tests before the user has playtested and confirmed the behavior.
- Do NOT treat pre-playtest tests as the source of truth — they may encode
  wrong expectations.
- If the user reports the behavior is wrong, fix the implementation first,
  re-playtest, and only lock in tests after confirmation.
- This overrides the generic TDD "failing test first" principle for game
  behavior work. (Pure logic with no subjective feel may still use TDD.)

---

## If You're Bypassing the Dispatcher

**Stop and ask:**
- Why am I not using the mode-dispatcher skill?
- Is this serious work? (If yes → dispatch)
- Am I bypassing for convenience? (If yes → stop, dispatch)

The discipline exists to catch bugs early, maintain quality, and ensure
rigorous development. Bypassing defeats the purpose.

---

**When you start a session, invoke the `mode-dispatcher` skill**
(`.roo/skills/mode-dispatcher/SKILL.md`). It routes to the most beneficial
mode from either system:
- built-in modes: architect, code, ask, debug, orchestrator, merge-resolver, skill-writer
- superpowers skill-modes: brainstorming, writing-plans, test-driven-development,
  systematic-debugging, requesting-code-review, and 14 more
- Or use slash commands for direct access: /tdd, /debug, /brainstorm, /write-plan, /execute-plan

---

## Decision Escalation

If you find yourself unable to decide between two or more viable
approaches after reasonable investigation, STOP and present the choices
to the user with a brief recommendation, then let them pick. Do not
ruminate silently or keep investigating indefinitely. Use the
`ask_followup_question` tool to surface the decision.

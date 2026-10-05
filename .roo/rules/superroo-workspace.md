# SuperRoo Development Methodology

This workspace enforces SuperRoo development discipline.

---

## Use SuperRoo Skill-Modes

For serious work, you MUST use SuperRoo skill-modes. Start with:
- **using-superpowers** - Entry point that selects the right skill

Or use slash commands for quick access:
- `/tdd` - Test-driven development
- `/debug` - Systematic debugging
- `/brainstorm` - Design refinement
- `/write-plan` - Create implementation plan
- `/execute-plan` - Execute plan with TDD
- `/review` - Request code review

Or select directly from 21 skill-modes:
- **test-driven-development** - RED-GREEN-REFACTOR cycle
- **systematic-debugging** - 4-phase root-cause investigation
- **brainstorming** - Socratic design refinement
- **writing-plans** - Comprehensive implementation plans
- **executing-plans** - Batch execution with review checkpoints
- **requesting-code-review** - Perform rigorous code review
- **receiving-code-review** - Process review feedback
- And 14 more specialized skills...

**Do NOT bypass SuperRoo modes for convenience.**

Only use other modes for:
- ⚠️ Trivial one-off tasks explicitly marked as experimental
- ⚠️ User explicitly requests different mode
- ⚠️ Quick questions that don't involve code changes

When in doubt, use a skill-mode. They exist for a reason.

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

## If You're Bypassing SuperRoo Modes

**Stop and ask:**
- Why am I not using a SuperRoo mode?
- Is this serious work? (If yes → use SuperRoo mode)
- Am I bypassing for convenience? (If yes → stop, use proper mode)

The discipline exists to catch bugs early, maintain quality, and ensure
rigorous development. Bypassing defeats the purpose.

---

**When you start a session, select the appropriate SuperRoo skill-mode:**
- using-superpowers for automatic skill selection
- brainstorming for design refinement
- writing-plans for implementation planning
- test-driven-development for feature implementation
- systematic-debugging for investigating bugs
- requesting-code-review for code review only
- Or use slash commands: /tdd, /debug, /brainstorm, /write-plan, /execute-plan

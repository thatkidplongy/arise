---
name: refactor-code
description: Improve the structure of existing code without changing its behavior — spot code smells, apply named refactorings in small safe steps, and judge when a design pattern genuinely helps (and when it's over-engineering). Use when asked to refactor, clean up, simplify, tidy, or restructure code, or when a feature is hard to add because the current structure fights you.
---

# Refactoring code

Refactoring is changing the **internal structure** of code to make it easier to
understand and cheaper to change, **without altering its observable behavior**.
If behavior changes, it isn't a refactor — it's a rewrite or a bug.

## The core discipline

1. **Pin down behavior first.** There must be a way to tell you didn't break
   anything — existing tests, a characterization test you add first, or a
   runnable path you can exercise before and after. No safety net → write one
   before touching the code.
2. **Separate the two hats.** Either you're *adding behavior* or you're
   *refactoring* — never both in the same edit. Finish one, verify, then switch.
3. **Small steps.** Apply one named refactoring at a time. After each, the code
   still compiles and the tests still pass. Many tiny reversible steps beat one
   big risky rewrite.
4. **Verify after every step**, not just at the end. A green checkpoint you can
   return to is the whole point.
5. **Commit at green checkpoints** so any step is trivially revertible.

## How to approach a request

1. Read the target code and its callers until you can state what it does in one
   sentence. Don't refactor what you don't understand.
2. Name the problem using [references/code-smells.md](references/code-smells.md)
   — "this is Feature Envy," "this is a Long Parameter List." Naming the smell
   points directly at the fix.
3. Pick the matching move from
   [references/refactoring-techniques.md](references/refactoring-techniques.md)
   and apply its mechanics step by step.
4. Reach for [references/design-patterns.md](references/design-patterns.md) only
   when a smell keeps recurring and a pattern removes the underlying duplication
   or coupling — never to show off a pattern. Refactor *toward* a pattern when
   the code demands it, not preemptively.
5. Match the surrounding code's naming, idioms, and comment density. A refactor
   should read as if it was always there.

## When NOT to refactor

- Right before a deadline with no test coverage and no time to add it.
- Code you're about to delete or replace wholesale.
- Purely to satisfy a rule ("this function is 21 lines") when the current form
  is already clear. Clarity is the goal; line counts are a hint, not a law.
- Speculatively, for flexibility no one has asked for (that's Speculative
  Generality — itself a smell).

## Scope discipline

Keep the diff to the refactor you were asked for. If you spot other smells along
the way, note them separately rather than expanding the change — an unrelated
"while I was here" cleanup buried in a refactor makes review harder and hides
regressions. Prefer explicit, reviewable steps over a sweeping rewrite.

## References

- **[code-smells.md](references/code-smells.md)** — how to recognize what's
  wrong, grouped by family, each with the refactorings that address it.
- **[refactoring-techniques.md](references/refactoring-techniques.md)** — the
  catalog of named moves with when-to-use and mechanics.
- **[design-patterns.md](references/design-patterns.md)** — patterns worth
  refactoring toward, with intent, fit, and (important) when to avoid them.

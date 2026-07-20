# Design patterns

Patterns are proven shapes for recurring design problems. In refactoring they're
a **destination**, not a starting point: refactor *toward* a pattern when a smell
keeps recurring and the pattern removes the underlying duplication or coupling.

> **Read this first — the anti-pattern trap.** Adding a pattern speculatively is
> itself a smell (Speculative Generality). A pattern trades simplicity for
> flexibility; only pay that price once the flexibility is actually needed —
> usually the *second or third* time the same variation appears. One `if` is not
> a Strategy. A single implementation behind an interface is not extensibility,
> it's ceremony. When in doubt, keep it concrete and inline.

Each entry: **intent**, **use when**, **avoid when**, and the smell it typically
resolves.

---

## Creational — how objects get made

### Factory Method / Simple Factory
- **Intent:** decide which concrete type to create behind a single call, so
  callers depend on an abstraction.
- **Use when:** construction logic is duplicated or branches on a type code;
  callers shouldn't know concrete classes.
- **Avoid when:** there's one type, or a plain constructor / function is clear.
- **Resolves:** Repeated Switch on type at construction; new-ing concretes
  everywhere.

### Builder
- **Intent:** construct a complex object step by step; separate construction from
  representation.
- **Use when:** many optional parameters/config; you want readable, validated
  assembly; immutable results.
- **Avoid when:** two or three params — use a Parameter Object or named args.
- **Resolves:** Long Parameter List / telescoping constructors.

### Singleton
- **Intent:** exactly one instance, globally reachable.
- **Use when:** genuinely one shared resource (rarely).
- **Avoid when:** almost always — it's global mutable state, hides dependencies,
  and wrecks testability. Prefer passing the dependency in (composition root /
  DI). Listed here mainly so you recognize and question it.

---

## Structural — how objects compose

### Adapter
- **Intent:** make an incompatible interface usable by wrapping it in the
  interface your code expects.
- **Use when:** integrating a third-party or legacy API without leaking its
  shape through your codebase.
- **Resolves:** Inappropriate Intimacy with an external library.

### Decorator
- **Intent:** add responsibilities to an object dynamically by wrapping it,
  keeping the same interface.
- **Use when:** you'd otherwise have a subclass explosion for optional features
  (logging, caching, compression stacked in combinations).
- **Avoid when:** one fixed extra behavior — just add it.

### Facade
- **Intent:** one simple entry point over a complicated subsystem.
- **Use when:** callers repeat the same multi-step dance across a subsystem.
- **Resolves:** Message Chains, scattered subsystem knowledge.

### Composite
- **Intent:** treat individual objects and compositions of them uniformly (tree
  structures).
- **Use when:** part-whole hierarchies where leaves and branches share behavior
  (files/folders, UI nodes).

### Proxy
- **Intent:** a stand-in that controls access (lazy loading, access control,
  remoting) behind the real object's interface.

---

## Behavioral — how objects collaborate

### Strategy
- **Intent:** capture interchangeable algorithms behind a common interface; pick
  one at runtime.
- **Use when:** the same operation has several variants selected by a type/flag,
  especially if the switch recurs.
- **Avoid when:** there's exactly one algorithm, or a plain function parameter
  (pass the behavior as a lambda) is enough.
- **Resolves:** Replace Conditional with Polymorphism at scale.

### State
- **Intent:** an object changes behavior when its internal state changes, as if
  it changed class.
- **Use when:** a `status` field drives big conditionals and legal transitions
  matter.
- **Resolves:** repeated switches on a state code.

### Observer / Pub-Sub
- **Intent:** notify dependents automatically when a subject changes, without the
  subject knowing who's listening.
- **Use when:** one change must fan out to many independent reactions.
- **Avoid when:** a direct call is clearer; overuse makes control flow hard to
  trace.

### Template Method
- **Intent:** define a skeleton algorithm, letting subclasses fill in specific
  steps.
- **Use when:** several routines share the same steps in the same order, with a
  few differing hooks.
- **Resolves:** Duplicated Code across near-identical procedures.

### Command
- **Intent:** wrap a request as an object (so it can be queued, logged, undone).
- **Use when:** you need undo/redo, queuing, or to parameterize actions.

### Chain of Responsibility
- **Intent:** pass a request along a chain until a handler deals with it.
- **Use when:** several handlers might process a request and the set/order
  varies (middleware pipelines, validators).

---

## Modern / everyday patterns

- **Dependency Injection** — pass collaborators in rather than constructing or
  looking them up inside. The single biggest lever for testable, decoupled code;
  prefer it over Singletons and service locators.
- **Null Object / Special Case** — a stand-in object with neutral behavior so
  callers stop null-checking (see Introduce Special Case).
- **Value Object** — small immutable type defined by its values, with equality by
  value (Money, DateRange). Cures Primitive Obsession.
- **Repository / Gateway** — isolate data-access behind a plain interface so
  domain code doesn't know about the DB/HTTP details.
- **Guard Clause** — not a GoF pattern but the most useful everyday shape:
  return early for edge cases to keep the happy path flat.

---

## Choosing (or rejecting) a pattern — checklist

1. Name the concrete problem and the smell first. If you can't, you don't need a
   pattern yet.
2. Has the variation appeared **at least twice**? If not, keep it inline.
3. Would a plain function, a lambda, or a Parameter Object solve it? Prefer the
   lighter tool.
4. Does the pattern remove real duplication/coupling, or just add indirection?
   Indirection has a cost — pay it only for a return.
5. Will the next reader understand it faster? If a pattern makes the code harder
   to follow for the flexibility you have today, it's over-engineering.

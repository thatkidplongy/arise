# Code smells

A "smell" is a surface symptom that usually points to a deeper structural
problem. Smells are heuristics, not rules — they tell you *where to look*, not
that something is definitely wrong. Confirm the problem is real (it makes change
harder or understanding slower) before acting.

For each smell below: **what you see**, **why it hurts**, and **fixes** (named
moves from `refactoring-techniques.md`).

---

## Bloaters — things that grew too big

### Long Function / Method
- **See:** a function that scrolls off the screen; needs comments to mark its
  sections; you have to read it all to understand any part.
- **Hurts:** hard to name, test, and reuse; hides multiple responsibilities.
- **Fixes:** Extract Function (the workhorse), Replace Temp with Query,
  Decompose Conditional, Replace Loop with Pipeline, Introduce Parameter Object.
  Rule of thumb: whenever you feel the urge to write a comment explaining a
  block, extract it into a well-named function instead.

### Large Class / Module
- **See:** a class with dozens of fields/methods doing several unrelated jobs.
- **Hurts:** low cohesion; every change risks the whole thing; hard to hold in
  your head.
- **Fixes:** Extract Class, Extract Subclass, Extract Interface, Move Function/
  Field to split responsibilities out.

### Primitive Obsession
- **See:** strings/ints/maps standing in for concepts — `String currency`,
  `int cents`, a `(lat, lng)` tuple passed everywhere, status as a magic string.
- **Hurts:** validation and behavior scatter; the type system can't help you.
- **Fixes:** Replace Primitive with Object, Replace Type Code with Subclasses/
  polymorphism, Introduce Parameter Object, extract a small value type.

### Long Parameter List
- **See:** four, five, six+ parameters; callers passing flags they don't care
  about; booleans that change what the function *does*.
- **Hurts:** hard to call correctly; order mistakes; signals the function does
  too much.
- **Fixes:** Introduce Parameter Object, Preserve Whole Object, Replace
  Parameter with Query, Remove Flag Argument (split into two functions).

### Data Clumps
- **See:** the same group of values traveling together — `startDate, endDate`
  in five signatures; `street, city, zip` repeated.
- **Hurts:** duplication of structure; changes ripple across every site.
- **Fixes:** Extract Class / Introduce Parameter Object for the clump; then
  Preserve Whole Object at call sites.

---

## Object-orientation abusers — half-applied OO

### Switch / Type-Code Conditionals
- **See:** the same `switch`/`if-else` on a type or "kind" field repeated in
  several places.
- **Hurts:** every new case means editing every switch; easy to miss one.
- **Fixes:** Replace Conditional with Polymorphism, Replace Type Code with
  Subclasses or State/Strategy. (If the switch appears *once*, leave it — a lone
  switch is fine.)

### Repeated / Duplicated Switch — see above; the smell is the *repetition*, not the switch itself.

### Refused Bequest
- **See:** a subclass that inherits methods/fields it doesn't want or overrides
  to throw/no-op.
- **Hurts:** inheritance implies an "is-a" that isn't true.
- **Fixes:** Replace Inheritance with Delegation, Push Down Method/Field, or
  extract a sibling rather than a child.

### Temporary Field
- **See:** a field set only in certain circumstances, null/empty the rest of the
  time.
- **Hurts:** readers must reason about when it's valid.
- **Fixes:** Extract Class for the field + the methods that use it; Introduce
  Special Case (Null Object).

---

## Change preventers — one change forces many

### Divergent Change
- **See:** one module changes for many different reasons ("I edit `Order` when
  tax rules change AND when the DB schema changes AND when the UI changes").
- **Hurts:** unrelated concerns entangled; risky edits.
- **Fixes:** Split Phase, Extract Class along the axes of change, Move Function
  to group by reason-to-change.

### Shotgun Surgery
- **See:** the opposite — one conceptual change forces tiny edits across many
  files.
- **Hurts:** easy to miss a spot; change is expensive.
- **Fixes:** Move Function/Field to pull the scattered logic together, Inline
  Class/Function to collapse needless indirection, Combine Functions into Class.

### Parallel Inheritance Hierarchies
- **See:** every time you add a subclass in one hierarchy you must add one in
  another.
- **Fixes:** Move Function/Field so one hierarchy references the other; collapse
  where possible.

---

## Dispensables — things that add no value

### Comments (as deodorant)
- **See:** a comment explaining *what* a confusing block does.
- **Hurts:** the comment is patching unclear code and will drift out of date.
- **Fixes:** Extract Function with an intention-revealing name, Rename, add a
  Guard Clause. Keep comments that explain *why* (rationale, tradeoffs, links) —
  delete comments that only restate *what*.

### Duplicated Code
- **See:** the same expression/structure in two+ places.
- **Hurts:** fixes and changes must be made N times; they drift apart.
- **Fixes:** Extract Function, Pull Up Method, Form Template Method, Extract
  Class. (Beware *coincidental* duplication — code that looks alike today but
  changes for different reasons. Don't unify those.)

### Dead Code
- **See:** unreachable branches, unused variables/params/functions, feature
  flags for shipped features.
- **Fixes:** Delete it. Version control remembers. Unused code is pure cost.

### Speculative Generality
- **See:** abstract classes with one implementation, unused hooks/params "for
  the future," generic machinery no caller needs.
- **Fixes:** Inline Class/Function, Collapse Hierarchy, Remove Dead Parameter.
  Build for today's requirements; generalize when the second case actually
  arrives.

### Lazy Element
- **See:** a class or function that does so little it doesn't earn its keep.
- **Fixes:** Inline Function/Class.

---

## Couplers — modules too entangled

### Feature Envy
- **See:** a method that reaches into another object's data far more than its
  own.
- **Hurts:** behavior lives away from the data it needs.
- **Fixes:** Move Function to the class it envies; Extract Function first if only
  part of it is envious.

### Inappropriate Intimacy
- **See:** two modules reaching deep into each other's internals.
- **Fixes:** Move Function/Field, Extract Class for the shared part, Replace
  Inheritance with Delegation, Hide Delegate.

### Message Chains
- **See:** `a.getB().getC().getD().doThing()`.
- **Hurts:** the caller is coupled to the whole navigation path.
- **Fixes:** Hide Delegate; or Extract Function and Move it down the chain
  (tell, don't ask).

### Middle Man
- **See:** a class where most methods just delegate to another.
- **Fixes:** Remove Middle Man (talk to the delegate directly), Inline Function.

---

## Quick smell → move lookup

| Smell | First move to try |
|---|---|
| Long Function | Extract Function |
| Duplicated Code | Extract Function / Pull Up Method |
| Long Parameter List | Introduce Parameter Object |
| Repeated Switch on type | Replace Conditional with Polymorphism |
| Feature Envy | Move Function |
| Primitive Obsession | Replace Primitive with Object |
| Data Clumps | Extract Class |
| Divergent Change | Extract Class (split by reason to change) |
| Shotgun Surgery | Move Function/Field (gather) |
| Comments explaining *what* | Extract Function + Rename |
| Speculative Generality | Inline / Collapse Hierarchy |
| Nested conditionals | Decompose Conditional / Guard Clauses |

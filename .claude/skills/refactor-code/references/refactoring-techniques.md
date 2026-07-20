# Refactoring techniques

A catalog of named, behavior-preserving moves. Each entry: **when** to reach for
it and the **mechanics** (small steps). Apply one at a time; keep the code green
between steps. Examples are illustrative sketches, not tied to any one language.

---

## Composing functions

### Extract Function
The most-used refactoring. Turn a fragment into its own named function.
- **When:** a block needs a comment to explain it; a fragment is duplicated; a
  function is doing more than one thing.
- **Mechanics:** create a new function named for its *intent* (not its
  mechanics) → move the fragment in → pass in what it reads, return what it
  writes → replace the original fragment with a call → verify.
```
# before
total = 0
for item in order.items: total += item.price   # sum line items
# after
total = sum_line_items(order)
```

### Inline Function
The inverse. Replace a call with the function's body.
- **When:** the body is as clear as the name; the indirection adds nothing; a
  poorly-factored function you want to re-extract differently.
- **Mechanics:** confirm it isn't polymorphic → replace each call with the body
  → delete the function → verify.

### Extract Variable
Name a sub-expression.
- **When:** a complex expression is hard to read or repeated within a function.
- **Mechanics:** introduce a well-named local set to the expression → replace
  uses → verify.
```
if (order.quantity * order.price - discount(order)) > 100 …
# →
base = order.quantity * order.price
final = base - discount(order)
if final > 100 …
```

### Inline Variable / Temp
Remove a variable that just restates its expression and is used once.

### Replace Temp with Query
Turn a local computed once into a function, so any code can get it and it stops
being a shared mutable temp.
- **When:** a temp holds a computed value used in several places; you're about to
  Extract Function and the temp is in the way.

### Change Function Declaration (Rename / reshape signature)
Rename a function/parameter, add or remove a parameter.
- **When:** the name doesn't reveal intent; the parameter list is wrong.
- **Mechanics:** for a safe rename, add the new declaration alongside, migrate
  callers, remove the old — or use the tool's rename if reliable.

### Combine Functions into Class / into Transform
Group functions that operate on the same data.
- **When:** several functions share and pass around the same data clump.

### Split Phase
Separate code that does two different things (e.g., parse then calculate) into
two sequential phases with a clear intermediate structure.

---

## Simplifying conditionals

### Decompose Conditional
Extract the condition, the then-branch, and the else-branch into named
functions.
```
if (date.before(SUMMER_START) || date.after(SUMMER_END)) charge = winterCharge()
else charge = summerCharge()
# →
if (isOffSeason(date)) charge = winterCharge()
else charge = summerCharge()
```

### Consolidate Conditional Expression
Combine several conditionals that all lead to the same result into one, then
extract it.

### Replace Nested Conditional with Guard Clauses
Flatten deep nesting by returning early for the edge/exceptional cases.
```
# before
function pay(emp) {
  if (emp.separated) result = separatedAmount()
  else { if (emp.retired) result = retiredAmount()
         else result = normalPay() }
  return result
}
# after
function pay(emp) {
  if (emp.separated) return separatedAmount()
  if (emp.retired)  return retiredAmount()
  return normalPay()
}
```

### Replace Conditional with Polymorphism
Move each branch of a type-switch into a method on a subclass/variant.
- **When:** the same switch on a "kind"/type recurs in several places.
- **Mechanics:** create a subclass per case → move the branch's body into an
  overridden method → replace the switch with a polymorphic call. (For a single
  switch, don't bother.)

### Introduce Special Case / Null Object
Replace repeated `if (x == null) …` checks with an object that answers sensibly.

### Introduce Assertion
Make an implicit assumption explicit with an assertion (documents, doesn't
change behavior for valid inputs).

### Replace Flag Argument with Explicit Functions
`setDimmed(true/false)` → `dim()` / `undim()`; `book(customer, isPremium)` →
`book()` / `premiumBook()`.

---

## Moving features between objects

### Move Function
Relocate a function to the module/class it belongs with.
- **When:** Feature Envy — it uses another object's data more than its own; or
  it's referenced more from elsewhere.

### Move Field
Relocate data to the record that uses it most / owns it conceptually.

### Extract Class
Split one class into two when a subset of fields and methods form their own
concept.
- **Mechanics:** create the new class → Move Field then Move Function for the
  cohesive subset → link from the old class → verify.

### Inline Class
The inverse — fold a class that no longer pulls its weight into its main user.

### Hide Delegate / Remove Middle Man
Add a method so callers stop chaining through you (`hide`), or remove such
methods when they only forward (`remove`). Balance to taste as coupling shifts.

---

## Organizing data

### Replace Primitive with Object
Turn a bare primitive that has behavior/validation into a small type.
- **When:** Primitive Obsession — `String phone`, `int money`.

### Encapsulate Variable / Field
Route access to data through functions so you can add validation, logging, or
change representation later.

### Encapsulate Collection
Return a copy or read-only view; provide add/remove methods so callers can't
mutate your internals directly.

### Replace Type Code with Subclasses / State
Turn a `type`/`status` code that drives behavior into polymorphic variants.

### Split Variable
Give a variable that's reused for two different meanings two separate names.

---

## Simplifying data & calls

### Introduce Parameter Object
Replace a recurring group of parameters with a single object.
- **When:** Long Parameter List or Data Clumps.
```
function amountInvoiced(startDate, endDate) …
# →
function amountInvoiced(dateRange) …
```

### Preserve Whole Object
Pass the whole record instead of pulling several values out of it first.

### Replace Parameter with Query
Drop a parameter the function can derive itself; and its inverse, Replace Query
with Parameter, when you want to remove a hidden dependency.

### Remove Dead Parameter
Delete a parameter no longer used.

---

## Working with loops & collections

### Replace Loop with Pipeline
Express a loop as map/filter/reduce (or comprehension) when it's doing
transform/select/aggregate work.
```
names = []
for r in rows:
    if r.active: names.append(r.name)
# →
names = [r.name for r in rows if r.active]
```

### Split Loop
Split a loop that does two things into two loops, each doing one — often a step
toward Extract Function. (Optimize back into one only if profiling demands it.)

---

## Generalization

### Pull Up Method / Field
Move identical members from subclasses to the shared superclass (removes
duplication).

### Push Down Method / Field
Move a member used by only one subclass down into it.

### Extract Superclass / Extract Interface
Factor shared behavior/contract out of similar classes.

### Collapse Hierarchy
Merge a class and its sub/superclass when the distinction no longer earns its
keep (often fixes Speculative Generality).

### Replace Inheritance with Delegation
When a subclass only uses part of its parent or the "is-a" is false: hold the
former parent as a field and forward the calls you actually need.

---

## Working safely without tests

When there's no coverage for the code you must change:
1. Add a **characterization test** — capture the *current* output for
   representative inputs (even if that output seems wrong; you're pinning
   behavior, not judging it).
2. Refactor in small steps, re-running that test after each.
3. Only then change behavior, as a separate, clearly-labeled step.

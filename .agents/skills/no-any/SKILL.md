---
name: no-any
description: Prevent explicit and inferred TypeScript or JavaScript `any` types when writing, reviewing, or fixing code in this repository.
---

# No `any`

- Do not introduce explicit `any` or leave declarations, callbacks, collections, generics, destructuring, or return values inferred as `any`.
- At untyped boundaries such as parsed JSON or third-party APIs, contain the library-provided `any` immediately behind an `unknown` return type, then narrow before use.
- Prefer existing domain types, concrete generics, `unknown`, and small type guards. Do not use assertions merely to hide `any`.
- Do not use `Array.isArray` directly to narrow `unknown`: its TypeScript predicate produces `any[]`. Reuse or add the smallest `value is unknown[]` guard.
- Permit `any` only when an upstream signature makes it unavoidable and `unknown` or a generic cannot work. Keep it in the smallest scope and add a comment naming the constraint.

## Check changes

1. Inspect the affected callers and existing type helpers before editing.
2. Search authored source, tests, and configuration for `any`, excluding generated and vendored files.
3. Run the repository's strict type check. Also inspect APIs whose declarations return `any`, because `noImplicitAny` does not report those flows.
4. Fix shared boundaries first, then run the relevant tests and repeat the search.

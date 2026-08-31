# ADR 0011 — Runtime Identity Invariant

- Status: Accepted
- Date: 2026-08-29
- Applies to: DeepSeek Harness Desktop 3.2.0 and later

## Context

Desktop loads a set of `@deepseek-ai/*` packages into a single Node process.
Several of them carry **module-level identity**: a module-scoped `Symbol`, a
singleton, a registry, or a scheduler that is keyed by an object created once
at module evaluation time.

`@deepseek-ai/dsh-tools` is the clearest example. It keys its tool scheduler
with a module-level Symbol:

```js
const TOOL_RUNTIME_SCHEDULER = Symbol("@deepseek-ai/dsh-tools.scheduler")
```

The agent loop then reaches the scheduler through that Symbol:

```js
const prepared = await ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(call.exec)
```

If two physical copies of `dsh-tools` are loaded into one process, there are
two distinct Symbols. The lookup yields `undefined`, and every tool call dies
with:

```
Cannot read properties of undefined (reading 'prepare')
```

This failure is unusually expensive to diagnose:

- it happens on the first tool call, not at startup, so the app looks healthy;
- the error surfaces in the renderer as `来源: UNKNOWN` / `source: UNKNOWN`,
  because the renderer cannot attribute an error raised inside a duplicated
  core module;
- `runtime.log` contains no corresponding stack, so the export tells a
  maintainer nothing.

It was reported as the P0 item of the 3.0.9 bug report. A known trigger is
installing a plugin: pnpm can materialise the `@deepseek-ai/*` core packages
into the profile as real directories instead of leaving them linked to the
main program, which produces exactly two copies.

The lockfile being correct today is not a guarantee. The invariant has to be
enforced, not merely observed.

## Decision

**An identity-sensitive `@deepseek-ai/*` package must resolve to exactly one
version across the whole workspace.**

Dependency classification:

| Class | Meaning | Version specifier |
|---|---|---|
| A | Enters the Desktop Runtime and carries module-level identity | **exact**, never a range |
| B | Peer / Host API declared to express an ABI range | range is acceptable, resolution must still be unique |
| C | Build / test only (typecheck, bundling, tests) | range is fine, deliberately not pinned |

The list of class A packages is **derived**, not hand-maintained: it is
whatever appears in `apps/dsh-desktop` `dependencies` plus a workspace
package's runtime `dependencies`. Plugin packages declare the SDK in
`devDependencies` purely for typechecking, and tsdown keeps those external
(`neverBundle` in `shared/tsdown.client.ts`), so they never enter a Runtime and
stay class C.

Class C is deliberately left on ranges. Pinning 117 devDependencies would buy
nothing - those versions never reach a Runtime - while making every SDK bump a
lockfile-wide churn.

### Enforcement

`scripts/runtime-graph-check.mjs` (wired as `pnpm runtime-graph:check`) fails
CI when any class A package resolves to more than one version. It reports the
package name, every resolved version, and which importer declared which
specifier.

It compares **resolved versions**, not declared specifiers. Two importers may
legitimately declare different ranges (`^0.1.1-rc.1` and `0.1.1-rc.1`) and
still be correct as long as pnpm resolved both to the same concrete version;
comparing resolutions is what keeps that case green instead of noisy.

The guard runs in `ci.yml`, `desktop-ci.yml` and `dsh-candidate-lite.yml`, and
is part of `pnpm verify`. It is separate from `scripts/runtime-deps-check.mjs`,
which answers a different question:

- `runtime-deps-check` — does committed runtime JS import something undeclared?
- `runtime-graph-check` — can one Runtime load two copies of an identity package?

### Failure mode

A missing resolution is a failure, not a silent pass. If the lockfile cannot
say how an identity package resolved, the invariant is unverified, and CI must
report that rather than imply safety.

## Consequences

- Upgrading `@deepseek-ai/*` core packages is now a deliberate, reviewable act.
  A version bump that splits a class A package turns CI red before it reaches a
  user.
- Plugin packages keep their devDependency ranges, so typechecking against a
  newer SDK does not force a lockfile rewrite.
- The guard adds one more CI step. It runs in about a second and touches no
  network.
- This ADR documents *why* the constraint exists. Without it, the guard looks
  like an arbitrary lint rule and gets relaxed the first time it is
  inconvenient.

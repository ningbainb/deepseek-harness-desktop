# ADR-0001: Desktop-owned built-ins and guarded community updates

## Status

Accepted for Desktop 0.1.9.

## Context

The desktop profile combines an exact DSH runtime, packages shipped inside the Electron application, and registry-installed community bundles. Built-in packages are physical links into the application image, so updating one package independently can create a runtime graph that was never packaged or tested together. Community bundles currently accept any registry version that exposes `dsh.bundle.patch`; their Node engine, DSH peer ranges, and desktop support are not evaluated, and a failed runtime restart does not restore the previous package graph.

The performance baseline on the Windows development machine is about 97 ms for a fresh profile, 55 ms for an unchanged profile, 25.2 seconds for the first cold DSH file scan, and 2.8–3.0 seconds after the runtime files are warm. Compatibility checks must not add network work to application startup, and package downloads must not extend runtime downtime.

## Decision

Built-in packages are versioned and upgraded only as part of a Desktop release. The Extension Dock reports their actual versions but never offers an independent package update.

Community packages use a guarded update path. A registry candidate is assessed against its DSH bundle declaration, Node engine, installed peer package versions, and optional `dsh.compatibility.desktop` and `dsh.compatibility.runtime` ranges. The result is `compatible`, `incompatible`, or `unknown`; incompatible candidates are blocked, while unknown candidates require an explicit user confirmation.

Checks run only when the Extension Dock is opened or the user requests a refresh. A selected candidate is downloaded to the pnpm store while DSH continues running. The profile is stopped only for an offline exact-version switch and restart. The desktop keeps the previous manifest and lockfile and restores them if mutation, validation, or runtime startup fails.

An installed community bundle with an explicit incompatible declaration is disabled before DSH starts but remains installed for diagnosis or a compatible update. Packages without enough metadata remain enabled and are labelled unknown.

## Consequences

### Positive

- Every built-in runtime graph corresponds to a tested Desktop artifact.
- Community updates have an explainable compatibility result and a recovery path.
- Registry latency is outside both application startup and DSH downtime.
- Existing community packages without new metadata continue to work.

### Negative

- Publishers must add compatibility metadata to receive a definitive compatible result when peer ranges are insufficient.
- Rollback adds one offline pnpm reconciliation when an updated runtime cannot start.
- Built-in plugin fixes require a Desktop patch release.

### Neutral

- The first Windows start can remain slower because antivirus scans newly installed runtime files; it is measured separately from warm startup.

## Alternatives Considered

Automatic background installation was rejected because incorrect third-party metadata could silently break the runtime. Updating every plugin only through a Desktop release was rejected because it would prevent independent community plugin iteration. Treating missing metadata as compatible was rejected because absence of evidence is not a compatibility guarantee.

## References

- [Desktop plugin compatibility design](../plans/2026-08-16-desktop-plugin-compatibility-design.md)
- [pnpm store command](https://pnpm.io/cli/store)

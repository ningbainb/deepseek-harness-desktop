# Desktop 3.0 security boundaries and non-goals

Desktop 3.0 treats compatibility, diagnostics, presets, runtime selection, and task execution as separate trust boundaries. A successful check in one boundary does not grant authority in another.

## Boundaries

| Boundary | Enforced rule |
| --- | --- |
| Renderer and plugin | Plugins use the public SDK and Contract only; Electron, raw preload, IPC, credentials, and Runtime Provider controls are not public plugin APIs. |
| Desktop capability | A declared capability is assessed evidence, not a permission grant; the current renderer surface and host policy decide availability. |
| Workspace opening | The Host requires a registered canonical workspace root, a relative allowlisted file, real-path revalidation, and a private main-to-Host capability before native opening. |
| Runtime selection | Stable starts only a matching `known-good` or `supported` matrix entry; candidate and blocked states cannot be promoted by local metadata. |
| Primary full-user Runtime | A one-time native confirmation authorizes `danger-full-access` and `approval: never` only within the current Windows user; every start still verifies official Runtime evidence and bytes, and no renderer or plugin can choose the overlay. |
| Automatic repair | A bounded repair Runtime works only in a private transaction workspace, receives redacted diagnostic context, and cannot commit changes until registered verification passes. Failed application is rolled back. |
| Child tool PATH | The app-owned `runtime-bin` directory is prepended only to Runtime, plugin installer, and terminal child environments; Desktop never changes process-global, user, or system PATH. |
| Plugin and preset integrity | Exact package and archive hashes detect unexpected bytes but do not establish publisher identity, trust, or broad code permission. |
| Task data | Worktree evidence retains bounded review metadata, not prompts, session transcripts, tool output, credentials, or unbounded unknown fields. |
| Diagnostics | Export is user initiated, destination chosen, confirmed, local only, and redacted before a ZIP or JSON package is written. |
| Legacy credential compatibility | Desktop reads only app-owned old Free Mode credential files, fills missing reference values in the child environment, never overwrites current credentials, and never logs secret values. |

## Privacy defaults

Official packaged builds upload a fixed product-event vocabulary to the release-injected first-party endpoint. A Desktop-only local random secret derives rotating daily and monthly anonymous actors; the stable secret, IP, content, credentials, paths, and long-lived device identity are not persisted by the service. Development, source, test, and Fork builds have an inert committed configuration. Diagnostic export remains separately user initiated with `userInitiated: true` and `automaticUpload: false`; its manifest lists excluded secret values, project files, prompts, sessions, answers, tool results, user names, real home paths, and URL credentials.

Diagnostic collectors are bounded and independently timed out so a damaged recovery subsystem does not force a broad data capture. Logs are redacted for credentials and account paths, and lines carrying conversation or tool content are excluded rather than summarized.

## Non-goals

Desktop does not claim to sandbox arbitrary third-party plugin code, certify plugin publishers, authenticate a browser session from a capability declaration, scan arbitrary project content during migration, silently install presets, silently merge worktree changes, or auto-promote a candidate runtime.

This document is a product-boundary guide, not a substitute for a security review of a plugin, a package publisher, a local operating system, or an upstream DSH runtime. See [SDK quickstart](sdk-quickstart.md), [runtime support policy](runtime-support-policy.md), and [upgrade and rollback](upgrade-and-rollback.md).

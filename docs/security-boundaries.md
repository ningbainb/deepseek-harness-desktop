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

## User and device authorization matrix

The host-only [`dsh-user-scope`](../packages/dsh-user-scope/README.md) service is the ownership authority. It persists an opaque local principal, one principal per paired device, Workspace grants, and Session ownership. Unknown ownership, unavailable or newer-schema state, identity fields supplied by a client, and revoked bindings fail closed.

| Resource or operation | Remote paired device | Local Desktop profile | Revocation and unknown ownership |
| --- | --- | --- | --- |
| Device principal | The paired cookie must resolve to the same live principal before and after each awaited Host call. | Uses the one opaque principal persisted for the current DSH profile. | Device revocation invalidates the next request; an unknown or mismatched binding is denied. |
| Workspace list and use | Only Workspaces with an explicit `use` grant are listed or accepted. | Retains the profile management view. | Revoked or unknown grants are omitted and direct access returns a non-enumerating unavailable result. |
| Session list, history, prompt, rename, model directory and model selection | The Session must be owned by or granted to the principal and, when attached to a Workspace, that Workspace must also be granted. Authorization is rechecked after Host calls. | Uses the local profile principal and registered Session ownership. | Unknown Session ownership is denied; removal of a grant makes later reads and writes unavailable. |
| Session search | The search engine receives only authorized Session IDs; returned rows are authorized and bounded again before release. | Uses the normal local search surface. | A missing index, foreign row, or unauthorized Session is not exposed. |
| Session event stream | Each Mux frame is filtered by current Session access. The live device table is the synchronous kill switch. | Uses the normal local event channel. | Revoking the device aborts the active stream and suppresses later frames. |
| Attachment and native file access | No attachment or arbitrary file method is present in the mobile allowlist. | Native Workspace file opening separately requires a canonical registered root, relative allowlisted path, real-path revalidation, and a private capability. | Unknown paths and client-supplied absolute paths are rejected. |
| Memory and personal Prompt | The mobile API exposes no direct CRUD method. Request-time injection uses user-scope; personal Prompt injection is local-owner only. | Uses the local principal with feature enablement and Session ownership checks. | Unavailable scope or foreign Session ownership suppresses injection. |
| Conversation import | The mobile API exposes no import method. Desktop import uses the private Desktop route and its own file capability. | User-initiated Desktop flow only. | A remote device cannot select a host path or invoke import through the mobile API. |

There is no complete in-app local multi-account switch. The supported local identity boundary is the current DSH profile plus separately paired device principals; changing a display name, Workspace path, email, or machine name does not select a principal. Adding local account switching is a separate design task that must migrate or explicitly share ownership rather than rewriting identifiers.

## Privacy defaults

Official packaged builds upload a fixed product-event vocabulary to the release-injected first-party endpoint. A Desktop-only local random secret derives rotating daily and monthly anonymous actors; the stable secret, IP, content, credentials, paths, and long-lived device identity are not persisted by the service. Development, source, test, and Fork builds have an inert committed configuration. Diagnostic export remains separately user initiated with `userInitiated: true` and `automaticUpload: false`; its manifest lists excluded secret values, project files, prompts, sessions, answers, tool results, user names, real home paths, and URL credentials.

Diagnostic collectors are bounded and independently timed out so a damaged recovery subsystem does not force a broad data capture. Logs are redacted for credentials and account paths, and lines carrying conversation or tool content are excluded rather than summarized.

## Non-goals

Desktop does not claim to sandbox arbitrary third-party plugin code, certify plugin publishers, authenticate a browser session from a capability declaration, scan arbitrary project content during migration, silently install presets, silently merge worktree changes, or auto-promote a candidate runtime.

This document is a product-boundary guide, not a substitute for a security review of a plugin, a package publisher, a local operating system, or an upstream DSH runtime. See [SDK quickstart](sdk-quickstart.md), [runtime support policy](runtime-support-policy.md), and [upgrade and rollback](upgrade-and-rollback.md).

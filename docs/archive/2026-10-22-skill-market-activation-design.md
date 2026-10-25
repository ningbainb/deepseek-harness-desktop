# Embedded market activation and recovery design

Status: proposed extension to the approved public-package integration. The dependency, SDK alignment and isolated acceptance fixtures are separate prerequisites; this document does not claim the activation interface or recovery layer exists.

## Intent and constraints

Users need to discover, inspect and install skills without leaving Desktop, while keeping their existing local skills, conversations, providers and plugin settings. Use the public NPM market and official DSH SDK through the profile and Cordis patch mechanism. Do not write official source or SDK implementations, change the supported-runtime promotion files, drop features, or weaken regression checks.

## Finding that changes the integration scope

The upstream market can activate MCP, LSP and hooks already declared in the shared Agent directory before any market suite is installed. Its project-layout switch does not prevent this user-level behavior. Its archive refresh and source URL update can also remove an old checkout before replacement is committed. Consequently, silently enabling the bare package is not an acceptable upgrade default.

## Approaches

1. Recommended: retain the complete market, add an explicit first-activation explanation in the existing Skill Center flow, and preserve source content through tested replacement transactions. Continue using the upstream per-suite capability confirmation, clearly identified as a UI safeguard rather than a sandbox.
2. A skills-only replacement would avoid some executable surfaces but duplicate the upstream product and omit market functionality; do not take this route without a separate user request.
3. Keep the candidate disabled until upstream fixes these boundaries. This is the current fallback, not completion of the user-facing market objective.

## Activation experience

Retain the local inventory and Import/Open directory actions. Add a neighboring market entry rather than another crowded top-level sidebar item. Before first activation, explain that trusted sources may launch local processes, execute hooks and read existing declarations under the Agent root. Display the effective storage roots without exposing tokens. Offer Cancel and Enable; Cancel must make no profile or source mutation. Preserve an existing explicit enable/disable choice on upgrade.

Activation uses Desktop's existing serialized profile/configuration workflow, with a recoverable snapshot and an explicit disabled override until the user confirms. Do not change the shared Agent root to a blank replacement or copy all its configuration: either action would change existing local skill discovery. Do not automatically migrate unrelated tools' files. Test activation failures before/after commit and restoration of the same original bytes.

## Installation and replacement behavior

Reuse the upstream search, details, capability confirmation, progress and retry UI. Feedback, translation, automatic updates and project-layout scanning remain off unless the user explicitly chooses otherwise. Explain translation's outbound text and possible model cost and feedback's public GitHub issue behavior. Retain all other market surfaces behind the activation choice.

For managed source replacement, fully acquire and validate into a sibling staging directory, retain the previous checkout as a transaction backup, commit the replacement and state, then release the backup. Preserve local/adopted source directories. Restore previous content and records when download, validation, rename, copy or state persistence fails. Never delete the only remaining recoverable copy. A submitted host operation continues after a UI request timeout; report that state rather than claiming cancellation. Exact recovery implementation and any version-pinned community patch must be reviewed before shipping; official SDK files remain unchanged.

## Verification and release boundary

Unit checks cover dormant defaults, existing preferences, SDK identity and activation/cancellation/rollback. Windows native Desktop acceptance uses isolated DSH_HOME and DSH_AGENTS_HOME, actual search and confirmation clicks, slash-menu discovery, restart persistence and unchanged retained local skill bytes. Adversarial tests cover source replacement and failed state writes. Run feature-baseline and the entire source regression gate with no skips or relaxed deadlines.

The previously observed Window Chrome & Geometry full-gate failure remains unresolved; successful isolated retries do not erase it. No installer or three-platform release may be declared accepted from these source checks. macOS and Linux require their native GitHub jobs.

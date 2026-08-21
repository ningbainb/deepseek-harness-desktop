# Desktop 3.0 schema versioning

DeepSeek Harness Desktop publishes machine-readable JSON Schemas for interchange and diagnostics. The files under [docs/schemas](schemas) are the canonical public schema documents. A schema may describe a profile-local persisted envelope, but its state instances and internal IPC payloads are not public/exportable artifacts.

## Public schema catalog

| Schema | Purpose |
| --- | --- |
| [Desktop Contract v1](schemas/desktop-contract-v1.schema.json) | Renderer-visible Contract and Runtime Provider snapshot |
| [Runtime Provider v1](schemas/runtime-provider-v1.schema.json) | Provider identity, support state, and capability snapshot |
| [Supported Runtime Matrix v1](schemas/supported-runtime-matrix-v1.schema.json) | Reviewed runtime-selection evidence |
| [Compatibility Patch Registry v1](schemas/compat-patch-registry-v1.schema.json) | Scoped upstream compatibility patch metadata |
| [Deep Link v1](schemas/dsh-deep-link-v1.schema.json) | Canonical allowlisted `dsh://` routes |
| [Preset v1](schemas/dshpreset-v1.schema.json) | Portable `.dshpreset` manifest |
| [Task Ledger v3](schemas/task-ledger-v3.schema.json) | Profile-local Project, Task, Run, and derived Evidence envelope |

## Compatibility rule

Within a schema major, producers may add optional fields where the schema permits them and consumers must ignore fields they do not understand. Consumers still validate every field that they rely on, and trusted plans normalize to their documented fields instead of carrying unknown data into a privileged operation.

Required-field removal, a changed field meaning, a changed type, or an incompatible enum requires a new schema major and a new reader or migration path. A reader that receives a newer unsupported major reports an actionable upgrade path; it does not guess how to interpret the data.

`dshpreset` format major `1` is the currently supported portable format. An archive with a newer major directs its user to upgrade Desktop, while an older unsupported major directs its user to the migration assistant before import. Additive optional preset fields in v1 do not become trusted import inputs unless the v1 reader explicitly recognizes them.

Task Ledger major `3` is the currently supported profile-local task-board envelope. A ledger with a newer major is read-only until a compatible Desktop is installed; a legacy major is handled by the migration assistant with a verified backup. The schema describes field shape only: ledger values, including task prompts, are never diagnostic-upload data.

## Authoring rules

- Use exact semantic versions in version-bearing public fields unless the schema explicitly declares a range.
- Do not place secret values, private paths, raw project content, prompts, session history, or tool output in a public-schema artifact.
- Treat `dsh.compatibility` and runtime evidence as declarative evidence, never as capability grants or identity proof.
- Generate derived runtime metadata from its package and lockfile authorities rather than hand-editing it.
- Keep schema identifiers stable for a major and add a new file for a new major instead of rewriting a published schema in place.

The public-schema validator checks current metadata, matrices, patch registry entries, and representative additive v1 inputs:

```powershell
node scripts/validate-public-schemas.mjs
node --test scripts/public-schema-validation.test.mjs
```

See [compatibility policy](compatibility-policy.md) and [preset authoring](preset-authoring.md) for how versioned schemas affect integrations.

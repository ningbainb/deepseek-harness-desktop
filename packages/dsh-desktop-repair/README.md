# dsh-desktop-repair

English | [中文](README.zh.md)

`@linxin666/dsh-desktop-repair` is the host-only repair bundle built into DeepSeek Harness Desktop. It is not a general chat plugin and is inert unless Desktop starts the managed `desktop-repair` profile with a private `DSH_DESKTOP_REPAIR_JOB` file.

When the normal Desktop profile fails twice, Desktop can copy only the affected Profile configuration and enabled plugin roots into an incident staging directory. This bundle uses the user's configured default model, with at most one configured fallback, to inspect and edit that candidate. Desktop verifies the candidate and applies it through a separate hash-checked rollback transaction. The model never edits the original Home directly.

## Bounds

- At most two provider/model attempts per incident.
- At most twelve tool actions per job.
- Tools can list, read, write, move, or delete bounded files only inside declared staging roots.
- Checks are selected by a fixed registered name. The model cannot supply a command, shell string, working directory, or dependency installation request.
- Check processes run without a shell and with package-manager offline mode enabled.
- A job writes only a structured diagnosis, relative changed paths, check names, provider/model identifiers, and fixed outcomes.

## Security model

Plugin files, manifests, comments, diagnostics, and command output are untrusted data. They cannot redefine the host policy or add tools. Jobs contain no original Profile path, project path, credential path, API key, session transcript, or Desktop install path. Credential-like files and filesystem-link escapes are rejected on every tool call. Raw model output and tool arguments are never copied into the result or product telemetry.

The bundle relies only on the public DSH Agent, default-model, Session, system-prompt, and Tool SDKs. It does not modify DSH source.

## Development

```sh
pnpm --filter @linxin666/dsh-desktop-repair typecheck
pnpm --filter @linxin666/dsh-desktop-repair test
```

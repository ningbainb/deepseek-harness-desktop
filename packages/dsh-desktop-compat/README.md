# dsh-desktop-compat

English | [中文](README.zh.md)

Desktop-only compatibility fixes for DeepSeek Harness Desktop 2.0.

## What it does

The package preserves the existing queue-first interaction. If DSH rc.6 becomes idle after cancelling an active turn while ordinary follow-up messages remain queued, the plugin re-arms the official agent driver without duplicating or reordering those messages. It also replaces the known `code run failed (abort): [object Object]` presentation with a clear cancellation message.

The implementation is host-only and uses public `agent/status`, agent inbox, `followup`, and `tools/post-execute` SDK contracts. It does not patch files in DeepSeek Harness and can be removed after the upstream runtime implements the documented cancellation behavior.

## Agent terminal choice

On Windows Desktop, the Agent keeps the official sandbox-managed `pwsh` tool
and gains a separate `desktop_wsl` tool for per-call Linux shell selection.
WSL is outside the Windows sandbox, so the default is one-shot approval for
every command; unavailable approval fails closed. The user can choose Off,
Ask, or Always Allow in Extension Dock > Smart Control > Agent Shell Permission.
Always Allow requires a native Desktop risk confirmation before persistence;
invalid settings disable WSL commands. Only installed user
Linux distributions are accepted; Docker Desktop's internal distributions are
excluded. Multiple distributions require an explicit name. WSL commands run
in the foreground with a 60-second limit. This does not change the user's
embedded terminal preference or replace the official `ctx.shell` provider.

## Tool-call argument recovery

Some model adapters can emit an extra transport envelope such as
`{"arguments":{"command":"...","description":"..."}}`. Desktop
normalizes it in the public `llm/stream` hook before the agent loop parses the
tool call. It unwraps exactly one level only when the current tool schema
accepts the nested object and rejects the outer envelope. Ambiguous, malformed,
unknown, and otherwise invalid calls remain unchanged for DSH's normal schema
validator.

Each recovery or refusal writes a bounded runtime-log diagnostic with the
provider, model, tool name, call id, source, and reason. Raw tool arguments are
never written to that diagnostic.

## Historical Session recovery

Desktop handles three confirmed historical variants without modifying DSH source: plaintext JSONL mislabeled as Zstandard, released-v0 `permission/preset` data containing exactly `preset` and `origin: "default"`, and released-v0 `subagent/descriptor` generation-2 data matching the published one-shot or continuable schema. The latter two repairs remove only the legacy `origin` or change only descriptor version 2 to 3; no model, permission, tool filter or reasoning setting is invented. Mixed logs are validated as one complete candidate. Original bytes are backed up before replacement, and the candidate must pass the complete official Session migration catalog. A Runtime retry failure restores the original bytes.

Recovery covers both the stored-log reader and the native historical preparation entry used by current DSH. Shared repair tasks prevent concurrent reads from competing over backups; native migration publication and cancellation remain authoritative. A source change detected during normalization rejects the stale candidate; a change detected after repair prevents rollback from overwriting newer data and retains the original backup for recovery. Unknown fields or generations, other origin values, incomplete frames, identity mismatches, conflicting backups and unrelated migration failures remain unchanged. Diagnostics report counts and bounded kinds only; Session ids, paths, prompts and responses are omitted.

## Install

DeepSeek Harness Desktop 2.0 mounts this bundle automatically in its isolated desktop profile. The package is not intended as a general Web UI plugin.

## Config

The bundle has no user configuration. Queue-first sending remains the default, and steering messages are not changed.

## Known limitations

The recovery targets the DSH rc.6 cancellation wake gap for ordinary next-turn messages. It should be removed when the official runtime fulfills the same documented contract.

## Development

```bash
pnpm --filter @linxin666/dsh-desktop-compat test
pnpm --filter @linxin666/dsh-desktop-compat build
```

# dsh-memory

English | [中文](README.zh.md)

Owner-isolated local memory for DeepSeek Harness. Each principal has a separate JSON file; matching content enters model requests within bounded limits.

## What it does

- Personal preferences lists all, global, workspace or session memories, including expired items; expired items are excluded from retrieval.
- Reload reads local storage. Save, delete and confirmed replacements check item versions; conflicts preserve edits.
- Clearing current results confirms the count and deletes only reviewed items; other scopes and subsequently created items remain.
- Models search or suggest. Confirm suggestions as new items or replacements within the same scope; repeated suggestions coalesce and duplicate content is reported.
- The conversation header and memory page show recently prepared context, match reasons, editing, deletion and session-only ignoring; collapsing the panel preserves its editing draft.

## Install

Mount through the desktop aggregate or this package's `cordis.patch.yml`, using official NPM SDKs and `dsh-user-scope`. Official runtime sources are not modified.

## Config

The `memory` settings contain `version: 1` and `enabled`, disabled by default. Global, workspace and session items restrict where they apply. [Schema](src/core/schema.ts) defines the limits: 2,000 items per principal, 2,000 content characters and 10 tags per item; automatic injection includes at most 5 items and 2,000 content characters total.

## Security model

Model search uses only direct user text from the current turn; empty queries return no memory. Content phrases and tags determine relevance, with scope, pinning and update time breaking ties. Management queries are separate from model retrieval, and every item checks current owner and target access.

Pending suggestions exist only in process memory, are not written to memory files before confirmation, and disappear on restart. Obvious credentials are rejected; content is excluded from logs, telemetry and diagnostics. Context records retain only item IDs, versions and match reasons and reauthorize reads; they do not record user query text.

File locking and atomic writes protect local JSON. Invalid JSON retains the original and attempts a `.corrupt` backup; future versions remain untouched. Caches refresh after approximately 10 seconds; expired caches are excluded while loading. Failed manual refreshes also stop using old cache contents.

## Known limitations

Files have no application-level encryption; selected content is sent to the configured model provider. The panel reports context prepared during request construction, not proof the model used it; character limits can truncate an item. There is no vector search or automatic conversation summarization.

Session ignoring affects subsequent retrieval and lasts only for this process; recent context and ignored sessions are each limited to 64 sessions. Workspace/session targets require authorized IDs. Legacy clients retain compatible APIs; the new management UI uses version checks and explicit deletion sets.

# dsh-memory

English | [中文](README.zh.md)

Owner-isolated local memory for DeepSeek Harness. Memory is persisted in one
private JSON file per principal, is never sent to a remote database, and is
bounded before it reaches a model prompt.

The model can search the current direct user turn or create a pending memory
suggestion. Only an explicit settings action or user confirmation persists a
new item. Obvious credentials are rejected without echoing the matched text.

The storage and injection limits come from `src/core/schema.ts`: at most 2,000
items are stored per principal, each item contains at most 2,000 characters and
10 tags, and one request receives at most 5 matching items with at most 2,000
characters of assembled memory text. Global, workspace, and session entries are
resolved only after the current principal and target ownership are authorized.
Disabling Memory produces no model-visible memory context.

Invalid JSON is preserved beside the source as `memories.json.corrupt` and
reported as a storage error; a future schema version is left untouched. Neither
case is silently replaced with an empty file.

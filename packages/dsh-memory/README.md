# dsh-memory

English | [中文](README.zh.md)

Owner-isolated local memory for DeepSeek Harness. Memory is persisted in one
private JSON file per principal, is never sent to a remote database, and is
bounded before it reaches a model prompt.

The model can search the current direct user turn or create a pending memory
suggestion. Only an explicit settings action or user confirmation persists a
new item. Obvious credentials are rejected without echoing the matched text.

# Model Preferences

English | [中文](README.zh.md)

This plugin adds durable pinning, provider ordering, provider enable/disable controls, and recent-model tracking to the official DeepSeek Harness model selector.

It uses the official `ModelDirectory` for loading, capability state, reasoning options, selection, reloads, and stale-response handling. The plugin currently projects preferences into the official `Settings → Models` page and composer seat; the preference card is rendered inside that page rather than as a second sidebar entry. Credentials, adapters, current requests, and the host default model are not changed.

Custom `/model` command replacement is outside this delivery round. The plugin only projects preferences into the settings card and composer model seat; the official `/model` behavior remains unchanged and is not a release gate for this round.

The settings namespace is `model-preferences`.

# dsh-desktop-base

English | [中文](README.zh.md)

The base aggregate for DeepSeek Harness Desktop community features. One install activates the Web UI collection, plugin market, Codex Connect, and reasoning-effort controls used by the Desktop distribution.

This package is a dependency and configuration carrier. It does not copy, rename, or claim ownership of any upstream plugin.

## Included packages

- `@linxin666/dsh-web-ui-all@0.1.15`
- `dshmarket@1.3.0`
- `dsh-codex-connect@0.1.0-alpha.4.5`
- `reasoning-slider@0.0.2`

Tencent QQ Bot is not included. Its connector requires separate redistribution and branding permission before it can be part of a public aggregate or installer.

## Install

```sh
dsh plugin --profile web add dsh-desktop-base
```

Restart the DSH Web profile after installation.

## Before switching from standalone packages

Remove standalone copies of the included bundles from the same profile before adding this aggregate. Loading both forms can register the same Cordis ids twice.

Codex Connect owns the `llm-openai-codex` route. Remove or disable another Codex provider before enabling this aggregate.

## Version policy

Every dependency is pinned to an exact tested release. Aggregate releases control upgrades so a new upstream release cannot silently change an existing Desktop installation.

## Ownership and licenses

Each included plugin remains owned and published by its upstream project. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for repository links and license information.

DeepSeek Harness Desktop is a community project and is not an official DeepSeek release.

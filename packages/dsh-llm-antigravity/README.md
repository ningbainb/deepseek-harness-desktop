# @ningbainb/dsh-llm-antigravity

English | [中文](README.zh.md)

## What it does

Community Desktop detects the local Google Antigravity CLI and supports direct interactive ACP through the Desktop compatibility layer.

## Install

Install the official Antigravity CLI and sign in with `agy` or `agy acp --login` in a terminal.

Open **Settings > Web UI Plugins > Antigravity CLI (Gemini)**, enable the integration and save. Use **Check again** to inspect the local CLI and its ACP capabilities.

## Config

The card lets you set an absolute executable path, switch transport, select default reasoning effort, change the per-request timeout and add model IDs separated by commas or whitespace. Automatic discovery checks PATH and, on Windows, `%LOCALAPPDATA%\agy\bin\agy.exe`.

ACP is the default transport and uses the CLI's existing sign-in session.

## Known limitations

Model availability depends on the CLI and the signed-in account. The settings card shows diagnostics and available models. Desktop's ordinary model backends require independently verified API-billed authentication.

## Security model

Use the official executable or a trusted local installation. Personal and business OAuth are restricted to direct local interaction. The CLI can fall back to a saved OAuth login, so Desktop keeps Antigravity out of ordinary model routing, remote mobile sessions, Value Mode, and scheduled tasks.

[Antigravity headless mode](https://antigravity.google/docs/cli/headless/) · [Antigravity ACP](https://antigravity.google/docs/cli/acp/)

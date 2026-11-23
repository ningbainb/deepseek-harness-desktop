# @ningbainb/dsh-llm-antigravity

English | [中文](README.zh.md)

## What it does

Community Desktop includes the provider for models available to your local Google Antigravity CLI account.

## Install

Install the official Antigravity CLI and sign in with `agy` or `agy acp --login` in a terminal.

Open **Settings > Web UI Plugins > Antigravity CLI (Gemini)**. Refresh models, then choose a model from **Antigravity CLI (Gemini)** in the model selector or a model routing setting. The provider starts enabled and lists models after the CLI reports a signed-in catalog.

## Config

The card lets you set an absolute executable path, switch transport, select default reasoning effort, change the per-request timeout and add model IDs separated by commas or whitespace. Automatic discovery checks PATH and, on Windows, `%LOCALAPPDATA%\agy\bin\agy.exe`.

The default transport streams NDJSON over stdin and stdout. ACP opens a fresh stdio session for each request. Both transports send conversation text to Antigravity and return structured DSH tool requests to the DSH approval and execution loop. Antigravity handles its existing sign-in session.

## Known limitations

Image and file attachments are represented as text placeholders. Model and reasoning availability depends on the CLI and the signed-in account.

## Security model

Use the official executable or a trusted local installation. DSH starts it in a temporary working directory and sends prompts over stdin. It requests strict tool permissions and cancels ACP permission requests. Native tool requests are not forwarded to DSH. Tool declarations and responses can contain workspace data, so select the provider only for conversations you intend to send to Antigravity.

[Antigravity headless mode](https://antigravity.google/docs/cli/headless/) · [Antigravity ACP](https://antigravity.google/docs/cli/acp/)

# Release plugin adapter
English | [中文](README.zh.md)

Original plugin settings navigation and independent Dafeiyu companion visibility, with a read-only support route.

## What it does

- Opens the original Prompt Pilot and shared browser settings through Desktop's existing plugin-options directory.
- Shows full-body Dafeiyu by default when no display preference is saved, preserving an explicit off choice; pauses the original pet widget and polling while visible, retaining its settings and data.
- Exposes prerequisite shapes at `/api/desktop-release-plugins` for support tools. This route performs no model, browser, credential or session operation.

## Install

The integrating Desktop owns dependency installation and profile composition. Mount this package's `cordis.patch.yml` alongside the original three vendor patches. Preserve the identities `@local/dsh-prompt-pilot@1.2.3`, `dsh-dafeiyu-pet@0.2.0` and `dsh-builtin-browser@0.4.14`. Keep all existing pet, AionUI and official browser rows.

The original plugin-options directory must map the three package owners to sections `prompt-pilot`, `dsh-builtin-browser` and `release-plugin-adapter`. Navigation prefers the Dock document's existing events, then the `selectDockSetting` preload or the public `@linxin666/dsh-desktop-client` contract `openDesktopSurface('extensions', { setting: 'plugin-options', plugin: owner })` for native settings pages.

## Config

The browser-origin preference `dsh-release-plugin-adapter.dafeiyu-visible` defaults on when absent; stored `true` enables it and `false` disables it. Invalid values or unreadable storage keep the companion hidden. Reading the default does not write a preference. Cross-window storage changes synchronize visibility; hiding does not disable the vendor host.

Prompt Pilot defaults auto-prediction on through its original client. A saved disable, model selection and context budget remain unchanged. The official default skin is independent of both features.

A compact Tab guide appears below the composer with the current session's grey suggestion. It disappears when the suggestion is accepted, dismissed, disabled, or replaced by typing. Tab fills a draft; the user reviews it and sends separately.

## Security model

The support route uses the existing authenticated Connection carrier and returns only fixed plugin identifiers, missing method names and status. It never returns paths, tokens, credentials or conversation data. All vendor archives retain their reviewed bytes and package identities.

The Desktop-owned browser bootstrap validates the installed vendor identity and version, exact host entry, marker, 48-character hexadecimal spawn token and TCP port before importing the vendor host. Browser children bypass Desktop initialization. The vendor retains its sandbox and RPC authentication. Managed launch environment is revalidated across relaunch; user Electron overrides remain supported.

## Known limitations

Visibility is scoped to the browser origin. Desktop navigation requires the existing plugin-options mappings. The support route checks service contracts, without establishing browser window readiness. Packaged window startup and end-to-end plugin behavior require Desktop integration acceptance; this package's unit tests do not establish that acceptance.

Independent Dock settings documents keep the shared display preference editable while suppressing the floating widget. Main conversation windows continue to follow that preference.

Turning the full-body companion off restores the original pet according to its saved enabled setting. Temporary renderer priority never writes the original pet configuration; its settings entry remains available.

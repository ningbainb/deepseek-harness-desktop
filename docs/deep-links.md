# Desktop deep links, file association, and notifications

Desktop-aware plugins create allowlisted links through `@linxin666/dsh-desktop-client` helpers such as `taskDeepLink()` and `runDeepLink()`. They should subscribe through the SDK, treat ordinary DSH Web as unavailable, and never construct a link from a path, URL, query string, fragment, command, or package specification.

## Deep-link allowlist

Desktop accepts only `dsh://extensions`, `dsh://updates`, `dsh://task/<safe-id>`, `dsh://session/<safe-id>`, `dsh://run/<safe-id>`, and `dsh://preset/preview`. Safe identifiers contain lowercase ASCII letters, digits, dot, underscore, or hyphen and are at most 128 characters.

Credentials, ports, fragments, queries, traversal, percent-encoded separators, unknown routes, commands, paths, URLs, and package specifications are rejected before dispatch. Links are normalized into structured records, queued in a bounded list until Runtime is ready, deduplicated for the application lifetime, and dispatched once.

## Preset file association

The installer registers `.dshpreset` with DeepSeek Harness Desktop. Initial launch, `second-instance`, and platform file-open ingress accept only an absolute path with that extension. The main process reads and validates the file, opens Extension Dock on the Preset tab, and sends only the preview plan. Double-click never confirms or installs a Preset, and renderer code never receives the path.

## Notifications

Desktop Contract `notifications.show` accepts structured `category`, `id`, `title`, `body`, and optional allowlisted `deepLink`. Categories are `task`, `run`, `plugin-recovery`, `update`, and `preset`. Unknown fields and unsafe links are rejected.

The notification service deduplicates IDs, applies a per-category minimum interval, and suppresses native notifications while a Desktop window is focused. A click routes only the already validated structured deep link. Task surfaces may report completion or failure through the Contract; run notifications open the Task Board through `dsh://run/<safe-id>`; the main process reports same-Home built-ins fallback, downloaded updates, and Preset import completion or restoration.

The canonical interchange validation is [Deep Link v1](schemas/dsh-deep-link-v1.schema.json). For capability detection and SDK usage, see [Desktop Client SDK quickstart](sdk-quickstart.md).

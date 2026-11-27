# Chat Artifact

English | [中文](README.zh.md)

`@ningbainb/dsh-chat-artifacts` renders self-contained HTML, CSS, and SVG visualizations in DSH conversations. The assistant can use it for architecture diagrams, reports, dashboards, and interactive prototypes.

## What it does

Use **Render Mermaid locally** on a static artifact containing an escaped `<pre class="mermaid">` diagram. The optional bundled runtime loads on demand. Inline SVG and rendered Mermaid diagrams export as SVG or high-resolution PNG from the artifact card.

- `render_artifact` streams a script-free preview while the model generates HTML. When the turn finishes, each artifact's latest version remains visible beneath the assistant's response. If the plugin renderer is unavailable, the standard Tool Card shows a short text result.
- `patch_artifact` takes an artifact ID and a sequence of literal `oldString` and `newString` replacements. Each `oldString` must match exactly once after the preceding edits. The tool saves a complete snapshot, so earlier versions remain selectable after reopening the conversation.
- The assistant uses the surrounding conversation to decide when a diagram adds clarity. Follow-ups on the same subject can update the existing diagram. The model receives a short, session-local list of recent artifact identifiers for this purpose.
- The card offers preview, source, and split views, plus a fullscreen workspace with desktop, tablet, and phone widths. The preview follows the DSH theme.
- Settled Desktop previews size to their content in the conversation. The conversation handles scrolling for ordinary diagrams and reports.
- Completed Markdown fences marked `html-live`, or `html` fences containing a complete HTML document, offer a static preview on request.
- SEP-1865 MCP Apps from explicitly configured servers appear as interactive cards. Tables, counters, and other controls can use the originating server's tools. The card includes the original tool result and a reload control.

## Install

Add the package to a DSH profile through the standard plugin loader. `cordis.patch.yml` mounts the host plugin, and the package metadata registers the browser renderer. `dsh-web-ui-all` already includes both.

## Configure

The model supplies an HTML fragment and can set `mode` to `static` or `interactive` on `render_artifact`. `static` is the default, including when replaying saved artifacts without a `mode`. Use `interactive` for controls that require inline JavaScript after generation finishes.

Set `mcpAppServers` on the Chat Artifact plugin's profile configuration. An app server uses either `stdio` or `streamable-http` with HTTPS or loopback HTTP. Reserve a distinct name for each app server. The pinned DSH MCP plugin drops app metadata on ordinary model tools, so the app connector owns one connection for the model tools and interactive UI of each server in this configuration.

```yaml
- id: chat-artifacts
  config:
    mcpAppServers:
      reports:
        transport: stdio
        command: reports-mcp
        readOnlyTools: [read_report]
```

## Security model

- The host validates HTML before saving it, and the client validates saved records again before rendering. Invalid records show an error with a bounded source excerpt when available.
- Static previews disable artifact-authored scripts. The guarded Desktop permits only the host's nonce-authorized sizing and theme bridge in settled static previews. Browser, remote web, streaming, and exported static previews run without a bridge. Settled interactive previews run only in the guarded native DSH Desktop window.
- Interactive frames have an opaque origin. They cannot access the host DOM, cookies, native credentials, Electron IPC, or Node APIs. The sandbox and native navigation guard block popups and navigation, and the content security policy blocks external network access. Browser storage is in memory and lasts only for the current frame.
- `window.dshUi.sendAction(action, payload)` requires a trusted user interaction in the frame. The card shows the request for review. Select **Fill message input** to insert it into the conversation draft. Sending the message remains a separate user action.
- The guarded Desktop renders MCP Apps in two sandboxed frames. Network access is off by default. The card can enable the app's declared network origins and reload its view. The host binds resource and tool requests to the original server, session, and principal.
- A reverse tool call runs without a prompt only if the profile lists it in `readOnlyTools` and its MCP annotation declares it read-only. The running agent turn uses DSH one-shot approval for other calls. After a turn ends, the guarded Desktop can ask for native one-shot approval. External links and message drafts require separate confirmation.

## Known limitations

- A fragment can contain up to 512 KiB of UTF-8 HTML. Titles are limited to 160 characters and descriptions to 500 characters. The initial height hint ranges from 240 to 720 pixels and defaults to 420. The Desktop can expand a settled preview to 3200 pixels. Taller content remains scrollable.
- **Export static HTML** downloads a static `.html` preview. **Copy HTML** copies the original source, including inline scripts from interactive artifacts.
- Offscreen frames can unload in long conversations. When a frame reloads, its in-memory state resets. The saved artifact and version history remain available.
- MCP App cards keep their original result for fallback. Interactive views depend on the current Desktop host and originating server and can expire when the host restarts, the server disconnects, or the app binding expires.

See [NOTICE.md](NOTICE.md) for the pinned SEP-1865 SDK and integration references.

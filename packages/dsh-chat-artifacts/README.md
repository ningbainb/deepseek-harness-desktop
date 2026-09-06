# Chat Artifact

English | [中文](README.zh.md)

@ningbainb/dsh-chat-artifacts adds a model-facing render_artifact tool and
an official DSH Tool UI renderer. A successful call appears as a visualization
inside the conversation while the normal assistant text remains the source of
the explanation.

## Scope

The first release covers:

- self-contained HTML fragments with inline CSS and SVG;
- a render_artifact tool with architecture, flow, timeline, comparison,
  roadmap, dashboard, table, wireframe, report, and other kinds;
- durable presentation metadata for live rendering and session replay;
- expand/collapse, source viewing, HTML copying, and rendering failure
  fallback;
- iframe lazy mounting for long conversations and light/dark theme tokens.

The package is a dual-face plugin. Its host half registers the tool and the
system-prompt guidance. Its browser half registers the render_artifact key in
the official tool.call.toolview slot. If the browser half is unavailable,
the DSH generic Tool Card still receives the short text result.

## Security model

The host rejects unsafe content before it can be projected into the session
log. The browser validates replayed metadata again and renders only with:

| Surface | Policy |
| --- | --- |
| JavaScript | Rejected by validation and disabled with sandbox="" and script-src 'none' |
| Network | External URLs, CSS imports, forms, and connection APIs are rejected; CSP uses connect-src 'none' |
| Browser bridge | No parent access, popup, Electron, Node, or automatic download APIs |
| Resources | Only inline CSS/SVG and media data: or blob: URLs |
| Recovery | Invalid metadata becomes a normal error row with bounded source text |

The input is an HTML fragment rather than an arbitrary document shell. The
frame adds its own CSP and theme stylesheet around the validated fragment.

## Limits

- HTML is limited to 512 KiB in UTF-8.
- Requested frame height must be 240–720 pixels; the default is 420.
- Titles are limited to 160 characters and descriptions to 500 characters.
- The first release does not execute arbitrary JavaScript or load external
  libraries.

## Installation

Add the package to a DSH profile through the normal plugin loader. The
cordis.patch.yml entry mounts the host half, and the package metadata tells
the web client loader to include the browser half. The aggregate
dsh-web-ui-all package includes this plugin as both a patch source and a
dependency.

## Deferred work

The following are deliberately outside the first release:

- update_artifact and versioned artifact editing;
- settings-page switches and HTML persistence actions;
- Mermaid and controlled chart DSL renderers;
- full-screen artifact workspace, export, and conversation nodes.

These features can reuse the durable artifactId and the same keyed Tool UI
extension without changing the current conversation protocol.

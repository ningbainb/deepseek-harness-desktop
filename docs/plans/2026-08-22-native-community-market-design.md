# Native Community Market Design

## Purpose

DeepSeek Harness Desktop owns a native community market inside Extension Dock. The market reads the public catalog maintained by awesome-dsh-plugin, renders it with Desktop-owned HTML, CSS, and JavaScript, and sends every installation through Desktop's existing transactional plugin pipeline. It does not embed a remote website, depend on browser login state, or expose Desktop data and local files to a market page.

## Source and attribution

The live catalog is `https://awesome-dsh-plugin.com/plugins.json`, the same public data source consumed by the MIT-licensed dshmarket project. Desktop consumes the catalog data but does not ship or execute dshmarket client or host code. The UI identifies awesome-dsh-plugin as the catalog source and links to a plugin's author repository only through the operating system browser.

## Main-process data boundary

A dedicated market catalog module fetches only the fixed HTTPS catalog URL through an injected fetch implementation, enforces a timeout and response-size budget, validates the top-level catalog and each visible plugin entry, and returns a bounded clone-safe projection. A successful response is retained in memory with its validators so repeated refreshes may use HTTP revalidation without persisting a stale catalog to disk. Failures are explicit and retryable.

Each projected entry has a deterministic opaque id, display name, catalog identity, owner, repository URL, optional npm package name, category, localized description, popularity facts, publish date, deprecation facts, and a main-process-derived install specification. Plain npm package names are preferred. GitHub repository and monorepo-subpath entries fall back to `github:owner/repository` and `github:owner/repository#path:/subpath` forms.

## Extension Dock interface

Extension Dock gains a first-class `市场` tab. Its visual direction is a dense native catalog: a compact catalog masthead, live count and update date, search field, category rail, sort selector, result count, and paginated plugin cards. Cards show the plugin name, author, localized description, source type, category, stars, downloads, installed state, and one install action. The renderer creates no remote iframe, webview, remote script, or cross-origin image.

The market loads on first activation and refreshes on demand. Search, category filtering, sorting, and pagination are renderer-local operations over the bounded catalog response. Installed state is derived from Extension Dock's current plugin inventory and refreshed after a successful installation.

## Installation flow

The renderer sends only the opaque catalog id. The main process resolves it against the most recently validated catalog and invokes the existing full-access external-plugin transaction with the derived npm or GitHub source. The existing native approval is the single confirmation. For catalog installs its copy is concise: plugin name, source, installation action, and automatic rollback promise. After approval, Desktop stops Runtime, applies the prepared installation, rebuilds the profile, restarts Runtime, commits on success, and rolls back on failure.

Compatibility warnings do not block a user-confirmed catalog install. Source-shape validation, protected built-in checks, mutation serialization, and rollback remain because they are correctness boundaries rather than repetitive warning UI.

## dshmarket retirement

The Desktop profile no longer mounts or manages dshmarket. Existing Desktop-managed dshmarket rows are retired during profile reconciliation, while unrelated user-managed files remain untouched. Package dependencies, runtime integration expectations, the one-off catalog card, and documentation references move to the native Extension Dock market.

## Verification

Unit tests cover catalog parsing, install-source derivation, bounded failures, conditional revalidation, opaque-id lookup, IPC surface restrictions, catalog installation routing, and concise market confirmation. Renderer source tests cover the market tab, search/category/pagination controls, absence of remote embedding, and the single install bridge. Full Desktop tests, SDK tests, typecheck, package verification, and packaged Extension Dock capture complete the release check.

# Notices

This repository includes the dsh-web-ui plugin and skin collection originally copyrighted by zhu1090093659, plus the DeepSeek Harness Desktop shell and contributions from project contributors. See the per-package license files for package-specific notices.

`@ningbainb/dsh-win-control` adapts architectural ideas from `helloHub1212/dsh-windows-mcp` (MIT License) and integrates with `CursorTouch/Windows-MCP` via DeepSeek Harness's native MCP client bridge.

nbfast (`@ningbainb/dsh-fast-ops`) adapts architectural ideas from `T-Auto/dsh-ops` (MIT License) for token-efficient batch file, search, and cached reference operations.

nbfast also uses ast-grep, its optional grammar packages, and node-ignore. Repomix, Aider and RTK informed the repository map and command output rules. [nbfast notices](packages/dsh-fast-ops/NOTICE.md)

`@ningbainb/dsh-doc-ingest` uses officeParser, unpdf, PDF.js, Defuddle, LinkeDOM, yauzl and ipaddr.js to extract content locally. [Document ingest notices](packages/dsh-doc-ingest/NOTICE.md)

The ACP workbench interoperates with the Agent Client Protocol and locally installed agents. [ACP notices](packages/dsh-llm-antigravity/NOTICE.md)

`@ningbainb/dsh-chat-artifacts` implements the MCP Apps protocol and uses the Model Context Protocol TypeScript client. [MCP Apps notices](packages/dsh-chat-artifacts/NOTICE.md)

`@ningbainb/dsh-local-search` uses SQLite FTS5 and the optional sqlite-vec extension. Orama, QMD and claude-mem informed the local search and memory design. [Local search notices](packages/dsh-local-search/NOTICE.md)

`@ningbainb/dsh-checkpoints` uses Git plumbing for workspace snapshots and Pierre Diffs for patch review. Cline, Roo Code and diff2html informed the checkpoint and comparison workflow. [Workspace checkpoint notices](packages/dsh-checkpoints/NOTICE.md)

`@ningbainb/dsh-im-hub` adapts the unified semantic core and lightweight native channel adapter architecture from `xmanrui/dsh-im` (MIT License) for 4 domestic IM channels (Feishu WS, DingTalk Stream, WeCom, Generic Webhook).

DeepSeek Harness and the `@deepseek-ai/dsh` packages are third-party dependencies distributed under their own terms. This community project is not an official DeepSeek release. DeepSeek names and marks belong to their respective owners.

The Windows release also bundles Electron, pnpm, Chromium, Node.js, and transitive open-source dependencies. Their license files are included in the packaged dependency tree where supplied by the upstream packages.

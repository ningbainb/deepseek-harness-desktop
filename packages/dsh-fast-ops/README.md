# nbfast

English | [中文](README.zh.md)

## What it does

nbfast (`@ningbainb/dsh-fast-ops`) provides token-efficient batch file reading (`fast_read_files`), unified workspace search (`fast_search`), SHA-256 CAS multi-edit (`fast_edit_batch`), progressive specialized tool discovery (`fast_discover`), RFC-4180 table reading, and bounded session result caching (`fast_result`).

Pass `contextLines` to a grep search to get merged, line-numbered excerpts around the current page of matches. Each excerpt includes the revision of the file read by the search. Use it for a follow-up edit when the excerpt is sufficient. Results too large for the inline budget can be read from the returned `contextRef` using `fast_result`.

## Syntax-aware tools

Use `fast_discover` with `select:<tool>` to activate tools as needed.

| Tool | Use |
| --- | --- |
| `fast_outline` | Read declaration signatures, visibility, nesting, and line ranges. Accepts a workspace path or glob. |
| `fast_ast_search` | Search syntax patterns such as `ctx.on($EVENT, $HANDLER)`. Matches carry the file's SHA-256 revision and optional line context. With `contextEncoding: 'json-text'`, page `contextRef` via `fast_result`, concatenate the `text` fields in order, and parse the JSON. |
| `fast_ast_rewrite` | Preview edits and a diff. To apply the preview, pass `dryRun: false` with the exact `expectedRevisions` path-to-SHA-256 map. Changed sources stop the write. |
| `fast_repo_map` | Get ranked workspace paths and declaration signatures under a token budget, with Git ignore rules and credential filtering applied. |

When the native parser or grammar is unavailable, the outline reports `parser: 'fallback'`, search can use literal matching, and structural rewrites require a supported parser. The settings card reports parser availability.

## Terminal output

For long shell results, nbfast can hide routine successful test records, repeated warnings, duplicate build diagnostics, and long Git diff bodies. It retains failure diagnostics and adds a `ref://` handle when the output supplied by the shell tool fits the session result cache. Page with `fast_result` and concatenate the `text` fields in order to recover the exact shell-tool result, including ANSI sequences and line endings. Commands exceeding the official shell tool's own capture limit retain its original spill-file notice. References are scoped to the current principal and session, subject to cache expiration and eviction. The settings card includes a master switch and individual Git, test, and build controls.

## Attribution

Architectural design creatively adapted from [`T-Auto/dsh-ops`](https://github.com/T-Auto/dsh-ops) (MIT License) for native integration in DeepSeek Harness Community Desktop without shipping redundant shell payloads.

Versioned upstream references and license details for ast-grep, node-ignore, Repomix, RTK, and Aider are in [NOTICE.md](NOTICE.md).

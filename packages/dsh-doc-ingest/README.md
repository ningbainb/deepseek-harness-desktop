# dsh-doc-ingest

English | [中文](README.zh.md)

Read local office documents, PDFs, and approved public webpages as structured Markdown for DeepSeek Harness Desktop.

## What it does

- `doc_inspect(path)` returns the format, table of contents, available pages or workbook sheets, and PDF text-layer status.
- `doc_read(path, { pages?, sheet?, section?, maxChars? })` reads a page range, sheet name, or named heading. Longer Markdown uses a session-bound `ref://` reference readable with `fast_result`.
- `doc_extract_url(url)` extracts article text and metadata from an approved public URL, preserving the structure of tables, formulas, and code when present.
- `doc_index_to_kb(path)` adds the extracted text to the authorized workspace's local knowledge index after approval. This tool is available when local search is installed.

## Install

The Desktop profile loads the package through its [Cordis patch](cordis.patch.yml). Work Mode registers the document tools in the current agent's scope.

## Config

The default limits are 32 MiB for files, 128 MiB of expanded Office ZIP data, a 100:1 ZIP expansion ratio, 8 MiB for webpages, and 15 seconds per parse worker. Tool responses inline at most 12 KiB of Markdown.

## Security model

Document tools resolve the authorized session's workspace at call time. Paths must remain inside that workspace after link resolution. Parsers accept bounded bytes, do local work in a terminable worker, and return redacted text. A webpage request requires one-time approval and connects only to a validated public address at each redirect. Proxy rules supplied by the Desktop runtime are used when they can tunnel to an already validated IP.

## Known limitations

Scanned or blank PDFs with no usable text layer report that status. Image OCR, password entry, legacy binary Office formats, and authenticated webpages are outside the extraction contract. A page selector applies to PDF and presentation slides. Spreadsheet formulas are preserved as document content and are never recalculated.

The document reader supports direct requests and fixed HTTP or HTTPS proxies via a numeric-address CONNECT tunnel. Explicit Desktop system, PAC, and auto-detect modes are unavailable for webpage extraction, and SOCKS proxies are unsupported. With no configured Desktop mode or proxy environment, webpage requests use the Node runtime's direct connection.

## Third-party acknowledgments

See [NOTICE.md](NOTICE.md) for versions, API choices, and upstream licenses. The Office parser uses its bundled slim entry and PDF text extraction uses local PDF.js assets through unpdf. Defuddle reads LinkeDOM's parsed HTML with remote fallbacks disabled.

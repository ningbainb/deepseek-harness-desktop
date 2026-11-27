# dsh-local-search

English | [中文](README.zh.md)

## What it does

The local index searches confirmed memory, owned conversation history, and explicitly selected Markdown or text sources. Conversation results include the timestamp, turn, and durable message sequence. Knowledge results include the source path and heading breadcrumbs.

SQLite FTS5 indexes Chinese bigrams and trigrams and splits code identifiers. Reciprocal rank fusion combines BM25, exact title and tag matches, and optional cosine similarity. Rank also accounts for scope, recency, and pinning. Search uses a TypeScript lexical fallback when FTS5 is unavailable and a quantized Int8 fallback when the optional SQLite vector extension is unavailable.

## Install

The Desktop profile loads `@ningbainb/dsh-local-search` through its Cordis patch. Open **Memory and knowledge** in the Dock to search history, choose a workspace, and manage its sources. Work Mode can also add an extracted document with `doc_index_to_kb`. The workspace tools are `kb_search` and `kb_read_chunk`.

For host plugins, the Cordis `localSearch.indexMarkdownForAgent(agent, { sourcePath, markdown })` method registers extracted Markdown against the current agent's authorized workspace and returns `{ chunks }`. The original source file must be inside that workspace.

## Configuration

| Embedding mode | Configuration |
| --- | --- |
| `off` | Default. BM25 and exact matches run locally without model configuration. |
| `api` | Set `embedding.mode`, `baseUrl`, and `model` in the Cordis patch. Use `apiKeyEnv` to reference an existing OpenAI-compatible endpoint's credential. Indexed text and queries are sent to that endpoint. |
| `local-onnx` | Set `embedding.mode` and an absolute `modelPath` for an existing local quantized embedding model. Provision `@huggingface/transformers` in the Desktop runtime profile separately. The model loader uses local files only. |

## Security model

Search data is kept in `<DSH_HOME>/search/<principal-hash>/`. Each principal has a separate database and source catalog. Session and workspace access are checked against the live authorization registry. Sources are limited to the selected workspace and path aliases are rejected. Search tools return document text as untrusted data.

The existing memory JSON and official session logs remain authoritative. The knowledge catalog atomically records selected source paths and extracted Markdown. Knowledge searches and direct chunk reads check the current catalog, and startup removes derived rows for missing entries. A change to the configured embedding provider or model invalidates previous knowledge vectors. The plugin quarantines corrupt SQLite files and their sidecars, then repopulates the index in the background.

## Known limitations

Initial indexing can take time for a large history. Sessions without recorded ownership are excluded. Directory sources scan up to 256 files and 32 MiB, and each file is limited to 2 MiB. Refresh edited sources by rebuilding the index. An unavailable embedding provider leaves keyword search available.

## Attribution

See [NOTICE.md](NOTICE.md) for pinned sources, license terms, and implementation differences.

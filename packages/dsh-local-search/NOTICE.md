# dsh-local-search third-party notices

| Project | Version and license | Use and constraint |
| --- | --- | --- |
| [Node.js SQLite](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html) and [SQLite FTS5](https://sqlite.org/fts5.html) | Node.js 24.19.0, [Node license](https://github.com/nodejs/node/blob/v24.19.0/LICENSE), SQLite public domain | The built-in synchronous interface implements the derived index. The plugin builds indexes off startup's critical path, applies SQLite page-cache bounds, and limits query terms and result pages. FTS5's unicode61 tokenizer alone provides limited Chinese segmentation. |
| [sqlite-vec](https://github.com/asg017/sqlite-vec/releases/tag/v0.1.9) | 0.1.9, MIT or Apache-2.0, Alex Garcia and contributors | Uses the published loadable extension for Int8 cosine distance. The binding is pre-1.0, vector dimensions must agree, and virtual table availability depends on the platform binary. Extension loading is disabled once the bundled library has been loaded. |
| [Orama](https://github.com/oramasearch/orama) | @orama/orama 3.1.18, Apache-2.0, Orama contributors | Reviewed its schema-driven in-memory BM25 and hybrid search. SQLite retains the corpus on disk. The local TypeScript fallback retains BM25 and quantized vectors without depending on Orama's in-memory index or serialization. |
| [QMD](https://github.com/tobi/qmd/tree/aa247d0ee2e5dc3b83e1270714c0f06ca94e2514) | @tobilu/qmd 2.9.0, MIT, Tobi Lutke and contributors | Architectural reference for Markdown chunking and rank fusion. QMD release notes identify incorrect lexical normalization and incorrect weighting of expanded queries in early releases. The Desktop implementation uses rank lists directly and applies fixed channel weights. |
| [Claude-Mem](https://github.com/thedotmack/claude-mem/tree/019a36df177c9e952a125d9be4a32e23dd59cbf9) | 17.0.2, Apache-2.0, Alex Newman and contributors | Reference for structured observations. The Desktop proposes bounded user-authored observations in its existing review queue. Persisting a proposal requires an explicit user action. |
| [Transformers.js](https://github.com/huggingface/transformers.js) | 4.3.2 reviewed, Apache-2.0, Hugging Face contributors | Optional local embedding adapter for independently provisioned engines and models. The profile uses offline feature extraction, fixed quantized dtype, and worker-independent document limits. |

QMD, Claude-Mem, Orama, and Transformers.js are not bundled. Search and ranking code in this package is original TypeScript.

## sqlite-vec MIT terms

~~~text
MIT License

Copyright (c) 2024 Alex Garcia

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
~~~

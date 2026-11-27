# dsh-doc-ingest third-party notices

| Project | Version and license | Integration |
| --- | --- | --- |
| [officeParser](https://github.com/harshankur/officeParser/tree/v8.4.1) | `8.4.1`, [MIT](https://github.com/harshankur/officeParser/blob/v8.4.1/LICENSE), Copyright (c) 2019 Harsh Ankur | Bundles the official slim export in the Office worker and extracts its AST and Markdown with `parseOffice(Uint8Array)` and `ast.to('md')`. The registry's `8.9.0` release requires Node 24.22.1 within Node 24, beyond the pinned Windows test runtime. The slim build excludes OCR and default CDN locations. |
| [unpdf](https://github.com/unjs/unpdf) | `2.2.3`, [MIT](https://github.com/unjs/unpdf/blob/main/LICENSE), Copyright (c) 2023-PRESENT Johann Schopplich | Uses the bundled serverless PDF.js for bounded page text extraction. The parser creates and destroys one proxy per job and avoids the optional canvas renderer. |
| [PDF.js](https://github.com/mozilla/pdf.js/tree/v6.2.108) | `6.2.108`, [Apache-2.0](https://github.com/mozilla/pdf.js/blob/v6.2.108/LICENSE) | Copies only font data and character maps for offline CJK extraction and includes the upstream notices. unpdf also includes its own serverless PDF.js build. |
| [Defuddle](https://github.com/kepano/defuddle) | `0.19.13`, [MIT](https://github.com/kepano/defuddle/blob/main/LICENSE), Copyright (c) 2025 Steph Ango | Uses the synchronous `defuddle/full` parser on already downloaded content. Its async extractors can call external endpoints and remain disabled. |
| [LinkeDOM](https://github.com/WebReflection/linkedom) | `0.18.15`, [ISC](https://github.com/WebReflection/linkedom/blob/6e2ae0ca56adc00f9e6e7d35971f22d676a454ff/LICENSE), Copyright (c) 2021 Andrea Giammarchi | Supplies inert DOM parsing without executing page code or using its optional native canvas peer. |
| [yauzl](https://github.com/thejoshwolfe/yauzl/tree/f5798e15204ffbb9a428b00217e4659684a41b0f) | `3.4.0`, [MIT](https://github.com/thejoshwolfe/yauzl/blob/f5798e15204ffbb9a428b00217e4659684a41b0f/LICENSE) | Inspects ZIP members with lazy entries and validates decompressed byte counts before the Office parser. |
| [ipaddr.js](https://github.com/whitequark/ipaddr.js/tree/dc55282780d8702bac31ef012ca52e4a77fbca1f) | `2.5.0`, [MIT](https://github.com/whitequark/ipaddr.js/blob/dc55282780d8702bac31ef012ca52e4a77fbca1f/LICENSE) | Classifies resolved IPv4 and IPv6 addresses before any webpage connection. |
| [fflate](https://github.com/101arrowz/fflate) | `0.8.3`, [MIT](https://github.com/101arrowz/fflate/blob/master/LICENSE) | Creates small controlled Office fixtures in tests and is contained in the upstream slim Office build. |

Bundled Office and PDF assets retain their upstream license files. The installed runtime dependencies retain their own license files.

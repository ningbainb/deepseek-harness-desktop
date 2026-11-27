# nbfast third-party notices

nbfast is maintained by ningbainb.

| Project and version reviewed | License | Use |
| --- | --- | --- |
| [ast-grep N-API 0.51.3](https://github.com/ast-grep/ast-grep/tree/0.51.3/crates/napi) | [MIT](https://github.com/ast-grep/ast-grep/blob/0.51.3/LICENSE), Copyright (c) 2022 Herrington Darkholme | Native syntax trees, pattern matching and source edits. The N-API package ships language support for JavaScript, TypeScript, TSX, HTML and CSS. Dynamic registration may terminate the process on invalid libraries, so nbfast checks that registration in a bounded child before enabling it. |
| [ast-grep official grammar packages](https://github.com/ast-grep/langs/tree/main/packages), releases 0.0.6 for C, C++, C#, Go and Python, and 0.0.7 for Java, JSON and Rust | ISC for the npm wrappers, MIT for the [upstream wrapper repository](https://github.com/ast-grep/langs/blob/main/LICENSE) and the [Tree-sitter grammars](https://github.com/orgs/tree-sitter/repositories) | Optional, release-pinned grammar prebuilds. nbfast registers grammar libraries from its installed packages. |
| [node-ignore 7.0.17](https://github.com/kaelzhang/node-ignore/tree/7.0.17) | [MIT](https://github.com/kaelzhang/node-ignore/blob/7.0.17/LICENSE-MIT) | Git ignore rule matching. |
| [Repomix 1.19.0](https://github.com/yamadashy/repomix/releases/tag/v1.19.0) | [MIT](https://github.com/yamadashy/repomix/blob/v1.19.0/LICENSE), Copyright 2024 Kazuki Yamada | Reference for file selection, ranking and signature extraction. Its Git configuration and Windows ignore fixes informed the safety checks. |
| [Aider 0.86.0](https://github.com/Aider-AI/aider/releases/tag/v0.86.0) | [Apache-2.0](https://github.com/Aider-AI/aider/blob/v0.86.0/LICENSE.txt) | Reference for token-bounded repository maps and weighting definitions by references. |
| [RTK 1.2.1](https://github.com/rtk-ai/rtk/releases/tag/v1.2.1) | [Apache-2.0](https://github.com/rtk-ai/rtk/blob/v1.2.1/LICENSE), Copyright 2026 RTK AI Labs | Reference for filtering successful test output, aggregating build diagnostics and retaining access to unfiltered output. |

nbfast uses its own TypeScript algorithms informed by the cited Repomix, Aider and RTK implementations.

# Workspace checkpoint notices

[`@pierre/diffs` 1.5.2](https://registry.npmjs.org/@pierre%2Fdiffs/1.5.2), copyright 2025 The Pierre Computer Company, is provided under the Apache License 2.0 in the published package. Its browser renderer supplies split and unified diff views. The pinned version supports the JavaScript highlighting engine and a worker-free configuration. The plugin retains a native text renderer for an unavailable or invalid diff bundle. See the [upstream API documentation](https://diffs.com/docs).

The renderer ships as compiled browser code. The renderer's packaged notices and full license texts are collected in [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt).

[diff2html 3.4.56](https://registry.npmjs.org/diff2html/3.4.56) is an MIT-licensed reference for split and unified patch layouts. It is not a runtime dependency.

[Cline 4.1.28](https://github.com/cline/cline/releases/tag/v4.1.28) ([Apache-2.0](https://github.com/cline/cline/blob/v4.1.28/LICENSE)) and [Roo Code 3.54.0](https://github.com/RooCodeInc/Roo-Code/releases/tag/v3.54.0) ([Apache-2.0](https://github.com/RooCodeInc/Roo-Code/blob/v3.54.0/LICENSE)) informed the checkpoint workflow. Cline's [checkpoint incident and follow-up](https://github.com/cline/cline/issues/4388) documents the failure mode of renaming real Git metadata. This plugin uses an independent bare repository with an isolated environment and private index. The reference implementations are not bundled.

Snapshot storage uses standard SHA-256 Git objects and the Desktop-provided or system Git. Git creates commits and references with `fast-import`, compares trees with `diff` and reads packed objects with `cat-file`. [Git fast-import](https://git-scm.com/docs/git-fast-import) · [Git diff](https://git-scm.com/docs/git-diff) · [Git cat-file](https://git-scm.com/docs/git-cat-file)

The in-process directory scan evaluates workspace ignore rules with [`ignore` 7.0.17](https://registry.npmjs.org/ignore/7.0.17), distributed under the [MIT license](https://github.com/kaelzhang/node-ignore/blob/7.0.17/LICENSE-MIT).

The host uses the pinned published DeepSeek Harness `0.2.3-alpha.2` SDK contracts for `agent/pre-step`, `agent/turn-stopping`, `session/event`, and `tools/execute`. [Agent SDK](https://www.npmjs.com/package/@deepseek-ai/dsh-agent/v/0.2.3-alpha.2) · [Tools SDK](https://www.npmjs.com/package/@deepseek-ai/dsh-tools/v/0.2.3-alpha.2)

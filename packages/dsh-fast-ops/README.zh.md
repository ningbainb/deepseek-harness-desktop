# nbfast

[English](README.md) | 中文

## 能力

nbfast（`@ningbainb/dsh-fast-ops`）为 DeepSeek Harness 社区桌面版提供省 Token 工具集，支持批量文件范围读取（`fast_read_files`）、统一文件与内容检索（`fast_search`）、带 SHA-256 校验的批量精准编辑（`fast_edit_batch`）、按需工具展开（`fast_discover`）、RFC-4180 表格读取与有界结果引用缓存（`fast_result`）。

内容检索可通过 `contextLines` 同时返回当前页命中项周围的代码。相邻片段会合并，每段带行号和检索时读到的文件版本。上下文充分时可用该版本直接发起后续编辑。片段超出内联额度时，可通过 `fast_result` 分页读取返回的 `contextRef`。

## 语法树工具

使用 `fast_discover` 的 `select:<tool>` 按需启用工具。

| 工具 | 用途 |
| --- | --- |
| `fast_outline` | 读取声明签名、可见性、嵌套层级和行号范围。支持工作区路径和 glob。 |
| `fast_ast_search` | 匹配 `ctx.on($EVENT, $HANDLER)` 等语法模式，返回文件 SHA-256 版本和可选的行上下文。当 `contextEncoding` 为 `'json-text'` 时，用 `fast_result` 分页读取 `contextRef`，按顺序拼接 `text` 字段，再解析 JSON。 |
| `fast_ast_rewrite` | 预览改动和差异。应用时传入 `dryRun: false` 和预览返回的 `expectedRevisions` 路径至 SHA-256 映射。源文件发生变动时停止写入。 |
| `fast_repo_map` | 在 Token 预算内返回按相关性排序的工作区路径和声明签名，应用 Git 忽略规则与凭据过滤。 |

原生解析器或语法库不可用时，大纲标记 `parser: 'fallback'`，搜索可回退到字面匹配，语法级写入要求存在受支持的解析器。设置卡显示解析器可用状态。

## 终端输出

nbfast 可精简长终端输出中的测试成功记录、重复警告、重复构建诊断和长 Git 差异正文，同时保留失败诊断。终端工具返回的输出能放入会话结果缓存时，摘要会附带 `ref://` 引用。通过 `fast_result` 分页并按顺序拼接 `text` 字段，可还原终端工具结果中的 ANSI 序列和原始换行。命令超出官方终端工具自身的捕获上限时，结果会保留工具原有的完整输出文件提示。引用仅限当前主体和会话使用，受缓存保留时长及淘汰策略限制。设置卡提供总开关及 Git、测试、构建的独立控制。

## 致谢与来源

架构思路借鉴并创造性转化自 [`T-Auto/dsh-ops`](https://github.com/T-Auto/dsh-ops)（MIT 协议），移除冗余 `niubash` 荷载，原生融入桌面端并兼容最新内核。

[NOTICE.md](NOTICE.md) 记录 ast-grep、node-ignore、Repomix、RTK 和 Aider 的核查版本、许可证及采用方式。

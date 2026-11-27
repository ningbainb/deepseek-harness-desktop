# dsh-local-search

[English](README.md) | 中文

## 能力

本地索引覆盖已确认的记忆、当前主体拥有的历史会话，以及明确选中的 Markdown 或文本来源。会话结果包含时间、轮次和持久化消息序号，知识库结果包含来源路径和标题层级。

SQLite FTS5 索引中文双字与三字词组以及拆分后的代码标识符。倒数排名融合结合 BM25、标题和标签精确匹配，以及可选的余弦相似度，并计入作用域、时间与置顶加权。FTS5 不可用时使用纯 TypeScript 词法检索，SQLite 向量扩展不可用时使用 Int8 量化向量降级。

## 安装

桌面 Profile 通过 Cordis patch 加载 `@ningbainb/dsh-local-search`。在扩展坞打开「记忆与知识库」即可搜索历史、选择工作区和管理来源。工作模式可用 `doc_index_to_kb` 加入提取后的文档。工作区工具提供 `kb_search` 和 `kb_read_chunk`。

宿主插件可调用 Cordis 服务 `localSearch.indexMarkdownForAgent(agent, { sourcePath, markdown })`，将提取的 Markdown 登记到当前 Agent 有权限的工作区，并获得 `{ chunks }`。原始文件须位于该工作区内。

## 配置

| 向量模式 | 配置 |
| --- | --- |
| `off` | 默认模式。BM25 和精确匹配在本机运行，无需模型配置。 |
| `api` | 在 Cordis patch 设置 `embedding.mode`、`baseUrl` 和 `model`。可通过 `apiKeyEnv` 引用已有 OpenAI-compatible 接口的凭据。索引文本与查询会发送到该接口。 |
| `local-onnx` | 设置 `embedding.mode` 与本机已下载量化向量模型的绝对路径 `modelPath`。在桌面 Runtime Profile 中另行安装 `@huggingface/transformers`。模型仅从本地文件加载。 |

## 安全模型

检索数据保存在 `<DSH_HOME>/search/<principal-hash>/`。每个主体使用独立数据库与来源清单，按实时授权检查会话和工作区。来源限于所选工作区，拒绝路径别名。知识库工具按不可信来源数据返回文档文字。

原有记忆 JSON 与官方会话日志为权威来源。知识库以原子方式记录已选来源路径和提取后的 Markdown。每次搜索或读取文档块都会核对当前来源清单，启动时清理已失去来源的派生记录。切换向量提供方或模型后，旧的知识库向量自动失效。损坏的 SQLite 文件与附属日志会隔离，后台重新填充索引。

## 已知限制

历史较多时首次索引需要时间，检索范围限于已有归属记录的会话。目录最多扫描 256 个文件和 32 MiB，单文件上限 2 MiB。修改来源后可重建索引以刷新。向量提供方不可用时仍可进行关键词检索。

## 致谢

查阅 [NOTICE.md](NOTICE.md) 查看锁定来源、协议与实现差异。

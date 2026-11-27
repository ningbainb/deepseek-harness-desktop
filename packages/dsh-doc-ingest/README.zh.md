# dsh-doc-ingest

[English](README.md) | 中文

在 DeepSeek Harness Desktop 中，将本地办公文档、PDF 和已授权的公开网页读取为结构化 Markdown。

## 能力

- `doc_inspect(path)` 返回格式、标题大纲、可用页次或工作表，以及 PDF 的文本层状态。
- `doc_read(path, { pages?, sheet?, section?, maxChars? })` 按页码范围、工作表名或章节标题读取。较长的 Markdown 生成绑定当前会话的 `ref://` 引用，可通过 `fast_result` 分页读取。
- `doc_extract_url(url)` 从已授权的公开网页提取正文与元数据，并尽可能保留表格、公式和代码结构。
- `doc_index_to_kb(path)` 经批准后将提取的文本加入当前有权访问的工作区知识库。启用本地检索时可用。

## 安装

桌面 Profile 通过包内 [Cordis 补丁](cordis.patch.yml) 加载插件。工作模式将文档工具注册在当前智能体的作用域。

## 配置

默认限制为文件 32 MiB、Office ZIP 解压总量 128 MiB、ZIP 压缩比 100:1、网页 8 MiB、单个解析 Worker 15 秒。工具结果行内返回的 Markdown 最多 12 KiB。

## 安全模型

文档工具在每次调用时解析已授权会话的工作区。链接解析后的文件路径须在该工作区内。解析器读取受限字节，在可终止的 Worker 中完成本地解析并输出脱敏文本。网页请求需要单次授权，并在每跳重定向时仅连接已经验证的公网地址。桌面 Runtime 的代理配置支持向已验证 IP 建立隧道时，网页请求沿用该配置。

## 已知限制

扫描件和空白 PDF 缺少可用文本层时会显示对应状态。图像 OCR、密码输入、旧版二进制 Office 和登录态网页不在解析范围内。页码选择适用于 PDF 及演示文稿的幻灯片。工作表公式作为文档内容保留，不重新求值。

文档阅读器支持直连，也支持通过 CONNECT 隧道向已验证的 IP 建立固定 HTTP 或 HTTPS 代理连接。显式选择桌面系统代理、PAC 或自动检测模式时，网页提取不可用。网页提取也不支持 SOCKS 代理。未配置桌面代理模式或代理环境变量时，网页请求由 Node Runtime 直连。

## 第三方致谢

版本、采用方式与许可证见 [NOTICE.md](NOTICE.md)。Office 使用 slim 构建，PDF 使用 unpdf 与本地 PDF.js 资源。Defuddle 读取 LinkeDOM 提供的已解析 HTML，远程回退保持关闭。

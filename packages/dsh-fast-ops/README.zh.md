# dsh-fast-ops

[English](README.md) | 中文

## 能力

面向 DeepSeek Harness 社区桌面版提供省 Token 工具集：批量文件范围读取（`fast_read_files`）、统一文件与内容检索（`fast_search`）、带 SHA-256 校验的批量精准编辑（`fast_edit_batch`）、缓存友好按需工具展开（`fast_discover`）、RFC-4180 表格读取与有界结果引用缓存（`fast_result`）。

## 致谢与来源

架构思路借鉴并创造性转化自 [`T-Auto/dsh-ops`](https://github.com/T-Auto/dsh-ops)（MIT 协议），移除冗余 `niubash` 荷载，原生融入桌面端并兼容最新内核。

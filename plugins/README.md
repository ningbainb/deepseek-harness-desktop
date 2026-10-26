# 插件分发包

本目录是 [DSH 插件合集 2026-10-26](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/plugins-20261026) 的索引说明。二进制包放在 Release 资产里，避免污染源码历史。

## 包列表

| 插件 | 下载 | 大小 | 说明 |
| --- | --- | --- | --- |
| 预测下一句 | [dsh-prompt-pilot-1.2.3.tgz](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/plugins-20261026/dsh-prompt-pilot-1.2.3.tgz) | 19 KB | `@local/dsh-prompt-pilot`：按当前对话预测下一条提示词，Tab 接受；自带测试 21/21 通过 |
| 鲸鱼娘全身桌宠 | [dsh-dafeiyu-pet-0.2.0.tgz](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/plugins-20261026/dsh-dafeiyu-pet-0.2.0.tgz) | 4.2 MB | 大肥鱼桌宠：192×208 全身精灵图，九组动作 + 十六方向、任务联动、气泡/记账/音效 |
| 操控浏览器 | [dsh-builtin-browser-0.4.14.tgz](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/plugins-20261026/dsh-builtin-browser-0.4.14.tgz) | 568 KB | 可见浏览器窗口 + CDP 驱动：DOM 级交互、会话隔离、Cookie 持久化、批量表单、验证码检测、带登录态下载 |
| 合集 | [dsh-plugins-bundle-20261026.zip](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/plugins-20261026/dsh-plugins-bundle-20261026.zip) | 4.8 MB | 三个 tgz + 安装说明 |

## 安装

图形界面：桌面端 → 插件管理 → 本地安装 → 选择 `.tgz` → 启用 → 重启 DSH。

命令行：

```sh
dsh plugin --profile desktop add file:/绝对路径/dsh-prompt-pilot-1.2.3.tgz
dsh plugin --profile desktop add file:/绝对路径/dsh-dafeiyu-pet-0.2.0.tgz
dsh plugin --profile desktop add file:/绝对路径/dsh-builtin-browser-0.4.14.tgz
```

依赖自动拉取：prompt-pilot 需要 `zod@4.4.3`，浏览器插件需要 `electron>=30`，桌宠无外部依赖。若需随 profile 自动挂载，把包名加入 `package.json` 的 `dsh.profile.bundles`（prompt-pilot 为 `@local/dsh-prompt-pilot`）。

## 校验值（SHA-256）

```
3f37f0664288a8ce2ec9c01d9d763d68bf5454e642cbd4a153fac27d2dc70f2a  dsh-builtin-browser-0.4.14.tgz
9759c153bef8b95284a380cddfa3d686d86aef4d5a28e2c00619f0d203d8b39e  dsh-dafeiyu-pet-0.2.0.tgz
9941974e4175a2854b54a09a6966bde1cd2c9557e407b70b2e66ba7274fb0d2a  dsh-prompt-pilot-1.2.3.tgz
```

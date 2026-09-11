# dsh-client-ui-mode-switcher

[English](README.md) | 中文

一个位于会话顶部的模式切换器，无需修改配置文件即可切换当前智能体模式。

## 行为

- 从 DSH 官方运行时读取可用的智能体预设，并隐藏已损坏的预设。
- 空白会话直接原地切换。列表摘要或已加载的原生投影任一表明对话已开始时，不将其作为空白草稿复用。
- 如果当前会话已有消息，会在同一工作区或原目录创建带目标预设的空白会话，保留已有历史；不会把无关工作区当作回退目标。
- 创建或刷新失败时保留原对话选中状态；迟到结果不会覆盖用户后来打开的对话。
- 当前 DSH 使用官方 Remote 调用和会话投影，不修改全局默认模式。旧宿主保留预设标签同步，并在完成后恢复用户原来的默认值。
- 切换期间禁用选择器，并在提示信息中显示运行时错误。

当运行时提供的可用预设不足两个时，选择器会自动隐藏。

## 安装

本插件已包含在桌面端托管配置中。若用于独立开发配置，请构建工作区并添加本地包：

```sh
pnpm install
pnpm --filter @linxin666/dsh-client-ui-mode-switcher build
dsh plugin --profile web add link:$(pwd)/packages/dsh-mode-switcher
```

安装后重启 `dsh web`。

## 开发

```sh
pnpm --filter @linxin666/dsh-client-ui-mode-switcher typecheck
pnpm --filter @linxin666/dsh-client-ui-mode-switcher test
pnpm --filter @linxin666/dsh-client-ui-mode-switcher build
```

## 许可证

BSD-3-Clause

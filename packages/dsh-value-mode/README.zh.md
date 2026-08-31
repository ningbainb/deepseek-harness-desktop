# dsh-value-mode

[English](README.md) | 中文

DeepSeek Harness 性价比模式（Value Mode）V2 插件：由专家主控模型理解、拆解、派发和汇总任务，按需使用副模型子代理完成局部工作，在交付质量与模型成本之间取得平衡。

## 功能特性

- 用户确认专家主控模型（Expert Controller）并选择副模型 / 子代理执行模型（Subagent Worker），直接复用已配置好的 DSH 供应商，无需重复填写 API Key。未明确配置主控时，自动预选并兜底使用当前默认模型。
- 内置三档运行策略：
  - **更省（Saver）**：优先由主控直接处理，只在需要并行或明确拆分时派发子代理。
  - **智能平衡（Balanced - 默认）**：复杂架构、疑难问题和重要改动按需派发副模型，并由主控复核。
  - **更强（Powerful）**：更积极地派发并行子任务，主控统一审查结果和风险。
- `subagent` / `subagent_fork` 子代理入口固定最大深度为 1，副模型只完成被派发的单项任务，不继续派发或调用专家。
- `consult_expert` 和 `ManualExpertToggle` 保留为兼容导出，但不再作为主控路由或可见重复按钮。
- V2 会话级独立覆写：支持在顶栏气泡中针对当前会话单独微调策略或专家主控，不污染全局默认配置。
- V2 成本与调用分析：实时统计会话内专家主控与副模型子代理调用次数、Token 消耗及副模型调用占比。
- V2 智能自愈与高风险审查：支持连续失败自动升级建议，并在涉及安全、数据迁移、升级器等关键修改时自动触发专家审查。
- V2 兼容咨询历史抽屉：可在顶栏浮层中随时展开回顾本会话旧版专家咨询结论摘要与耗时。
- 安全降级机制：模型未配置完整或供应商临时不可用时，平滑回退为普通 DSH 模型执行，零报错。
- 深度 Web GUI & Desktop 集成：会话顶栏状态徽章与快捷控制气泡、首次选择时的配置引导和插件配置中心设置卡片。

## 安装方式

### DeepSeek Harness Desktop

本插件已内置于 DeepSeek Harness Desktop 3.2.0+，随桌面版 profile 直接开箱即用。

### 独立 DSH 安装

如在独立 DSH 运行时中使用，可按标准 bundle 方式添加：

```sh
pnpm install
pnpm --filter @linxin666/dsh-value-mode build
dsh plugin --profile web add link:$(pwd)/packages/dsh-value-mode
```

安装完成后重启 `dsh web` 即可。

## 配置使用

在会话顶部选择 **性价比模式** 后，首次会自动打开非阻塞式配置引导：

1. 确认专家主控模型（默认预选当前默认模型）；
2. 选择副模型 / 子代理执行模型；
3. 选择运行策略（默认智能平衡）；
4. 点击“完成配置并开启”。配置按模型、策略、enabled 顺序提交，任一步失败都保持关闭。

也可以进入 **设置 -> Web UI 插件 -> 性价比模式** 进行完整调整。

## 开发与测试

```sh
pnpm --filter @linxin666/dsh-value-mode typecheck
pnpm --filter @linxin666/dsh-value-mode test
pnpm --filter @linxin666/dsh-value-mode build
```

## 许可证

BSD-3-Clause

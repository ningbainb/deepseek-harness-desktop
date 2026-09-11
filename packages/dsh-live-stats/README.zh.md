# @linxin666/dsh-live-stats

[English](README.md) | 中文

DSH Web 的实时输入/输出 token 估算、滚动 1 秒生成速率与峰值，以及会话费用显示。累计用量和平均速度的主指标由原生 DSH 展示。一个紧凑的可展开入口显示估算 API 费用，使用鼠标或键盘展开可查看令牌估算、最近滚动速率与步骤峰值。关闭费用显示时，入口文字为“实时估算”；空会话不显示补充统计：

```text
≈¥0.05 · Details
```

`~` 表示 token 启发式估算，`≈` 表示计算所得的 API 费用。当 provider 用量到达时，token 估算值会被真实用量替换；精确的缓存统计始终来自 DSH 的持久化 token 用量投影。重试会替换该步骤先前的估算，被中止的回合会移除其未结算的估算。

## 功能

- **宿主侧**：注册可重放的 `liveTokenUsage` 会话投影（`ctx.sessionProjections`）。该折叠从表面日志加上 header/工具框架估算输入 token，从流式 chunk 形成“新增输出 token + 事件时间”样本；每个样本按 `[t-1000ms, t]` 计算滚动 1 秒速率并记录步骤峰值。同一毫秒的批次先合并，`usage` 汇总和最终消息只修正账单 token，不制造瞬时峰值。最新速率在无新样本时常驻显示；没有有效流式样本时不显示 TPS。
- **客户端**：在官方会话 composer dock 挂载一个双语可展开入口。它读取会话限定的 `liveTokenUsage` 投影，以 `~` 标记令牌估算、以 `≈` 标记费用。保留原生用量和平均速度控件、插件设置及余额中心；未知费用或无效速率不会用零补齐。

用量中心明确区分三类指标。账户余额或站点额度跟随当前会话选择的服务商，界面分别标明钱包资金与额度；不支持的服务商、缺失明细或请求失败均显示未知，不会用零补齐。`≈` 费用是按所选峰谷时段计算的本地估算，不是账户余额或账单。滚动速率是最近一次流式输出的 1 秒窗口样本，步骤峰值是有测量步骤的最大滚动速率；两者都不是原生整段会话平均速度，也不是计费速率。

## 安装

推荐直接安装全家桶聚合包 `@linxin666/dsh-web-ui-all`（一个包装齐全部功能插件与皮肤），或单独安装本插件：

```sh
# 推荐：直接从 npm 安装
dsh plugin --profile web add @linxin666/dsh-live-stats

# 或从仓库安装（开发调试）
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-live-stats

```

安装后重启 `dsh web`，存在用量或速率样本的会话会在输入区下方显示紧凑的补充统计入口。

另一种方式：作为普通 overlay 行加入个人 DSH overlay（`~/.dsh/config.yaml`），保存即热加载：

```yaml
- insert:
    - id: live-stats
      name: '@linxin666/dsh-live-stats'
      config:
        charsPerToken: 4
        blockOverhead: 4
        roleOverhead: 4
```

三个估算参数均可选（默认值如上）。

## 配置

| 键 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `charsPerToken` | `number` | `4` | 一个 token 大致对应的文本字符数 |
| `blockOverhead` | `number` | `4` | 每个内容块分配的固定框架 token 数 |
| `roleOverhead` | `number` | `4` | 每条消息或助手响应分配的固定框架 token 数 |
| `showCost` | `boolean` | `true` | 是否在 composer 行显示当前会话估算 API 费用 |
| `priceMode` | `string` | `auto` | 按北京时间自动峰/谷计价，或强制使用 `peak` / `offpeak` |

## 导出形态

函数/命名空间插件：`inject` / `Config` / `apply`，无默认导出。估算器（`./estimator`）与投影折叠（`./projection`）均为纯函数并有单元测试；客户端 `TpsLine` 通过运行时投影 hook 渲染。invariant 伴侣注册于 `./invariant`。

## 模型体验

### 提示与工具面

#### 模型看到什么

什么也看不到。插件不注入提示段落、不注册工具、也不自行发出 `session` 事件——它只消费持久化事件流与投影载体的线路径。

#### Token 影响

每个请求为零。

#### KV 缓存影响

无系统提示贡献，因此对缓存稳定性无影响。

## 已知限制与待办

- **余额**：跟随原生模型选择器的当前服务商。兼容 DeepSeek 的接口返回币种与余额明细；Sub2API 返回钱包余额或订阅／密钥额度；New API / One API 计费接口返回站点定义的账户或令牌额度，不一定是美元或钱包资金。未支持的站点显示未知。刷新余额不发送模型请求。

- **启发式估算**：在 provider 用量到达前，输入/输出总量为字符数启发式（`~`）；精确缓存统计始终来自 DSH 的持久化 token 用量投影。滚动峰值只接受合法、递增时间的流式增量。
- **仅 Web**：补充速率位于输入区的可展开明细内；暂无 TUI 等价物。
- **单一活跃步骤**：投影每个会话只跟踪一个活跃步骤，dock 行显示该会话的视图；并发会话各自拥有独立投影。
- **密度假设**：`charsPerToken` 默认为 4 字符，会低估中文文本、高估纯 ASCII；若估算偏差明显，请按部署调整。
- **费用估算**：显示的 `≈` 金额使用内置 DeepSeek 峰/谷价格计算当前会话，不是 provider 最终账单；按模型区分的价格表留待后续版本。

## 安全模型

本地余额路由只接收服务商与模型标识；Host 通过官方 SDK 从配置解析该服务商的地址、凭据引用或 API Key 记录。不搜索其他用户目录，不把中转密钥发往官方兜底地址，不跟随携带认证的重定向，不返回上游原始错误。远程查询要求 HTTPS，限时八秒、响应上限 64 KiB。缓存与并发查询按服务商、地址和凭据指纹隔离；客户端切换模型后丢弃旧请求结果。余额查询失败不影响本地 Token 统计。

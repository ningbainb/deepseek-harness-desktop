# @linxin666/dsh-live-stats

[English](README.md) | 中文

DSH Web 的实时输入/输出 token 估算、滚动 1 秒生成峰值与会话费用显示。它供给内置的会话状态行：响应流式输出时实时更新输入/输出 token 总量，按当前计价档位显示紧凑的 `≈¥` API 费用，生成吞吐组（`TPS 31.4 tok/s`）渲染在步骤计数之后：

```text
1 turns · 3 steps API ↑7.9K ↓12 · ≈¥0.05 TPS 31.4 tok/s
```

`~` 表示 token 启发式估算，`≈` 表示计算所得的 API 费用。当 provider 用量到达时，token 估算值会被真实用量替换；精确的缓存统计始终来自 DSH 的持久化 token 用量投影。重试会替换该步骤先前的估算，被中止的回合会移除其未结算的估算。

## 功能

- **宿主侧**：注册可重放的 `liveTokenUsage` 会话投影（`ctx.sessionProjections`）。该折叠从表面日志加上 header/工具框架估算输入 token，从流式 chunk 形成“新增输出 token + 事件时间”样本；每个样本按 `[t-1000ms, t]` 计算滚动 1 秒速率并记录步骤峰值。同一毫秒的批次先合并，`usage` 汇总和最终消息只修正账单 token，不制造瞬时峰值。最新速率在无新样本时常驻显示；没有有效流式样本时不显示 TPS。
- **客户端**：在会话 composer dock 挂载费用/TPS 行。它直接读取宿主侧的 `liveTokenUsage` 投影，显示紧凑的输入/输出 token 总量和当前会话估算费用。

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

安装后**重启 `dsh web`**，会话状态行出现费用/TPS 行。

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

- **启发式估算**：在 provider 用量到达前，输入/输出总量为字符数启发式（`~`）；精确缓存统计始终来自 DSH 的持久化 token 用量投影。滚动峰值只接受合法、递增时间的流式增量。
- **仅 Web**：TPS 组渲染在 DSH Web 的会话统计行内；暂无 TUI 等价物。
- **单一活跃步骤**：投影每个会话只跟踪一个活跃步骤，dock 行显示该会话的视图；并发会话各自拥有独立投影。
- **密度假设**：`charsPerToken` 默认为 4 字符，会低估中文文本、高估纯 ASCII；若估算偏差明显，请按部署调整。
- **费用估算**：显示的 `≈` 金额使用内置 DeepSeek 峰/谷价格计算当前会话，不是 provider 最终账单；按模型区分的价格表留待后续版本。

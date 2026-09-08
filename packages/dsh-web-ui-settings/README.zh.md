# @linxin666/dsh-client-ui-web-ui-settings

[English](README.md) | 中文

面向 DSH 设置页的 dsh web UI 设置插件组：在 DSH 设置页加入一个一级设置分区，承载全家桶插件的启用开关与配置表单。

## 是什么

- **全家桶设置分区**：在 DSH 设置页注册一个一级分区，以静态标题和卡片归组 dsh web UI 全家桶插件。
- **桌面插件市场独立**：DeepSeek Harness Desktop 通过扩展坞原生社区市场完成发现和事务安装，并继续由扩展坞负责恢复与回滚；本包明确不恢复旧的组内社区插件卡片。
- **桌面拓展坞一键入口**：在受支持的 Desktop 中，拓展坞按钮紧邻设置；前三次符合条件的启动显示非模态轻提示，普通 Web 环境不会渲染桌面专用入口。
- **ChatGPT 登录**：RC.1 授权服务和 OpenAI Codex Provider 存在时，设置页新增一级分区，一次点击启动官方 ChatGPT OAuth 流程，并在系统浏览器继续。
- **bai 供应商引导**：`设置 → 模型` 与拓展坞 `AI 设置 → 模型接入` 提供浏览器登录、明确授权 Key、自动同步模型与手动 Key 接入。检测成功后发现 `/v1/models`，并写入官方 `llm-pi-ai` provider 配置。充值和 Key 管理直接打开供应商控制台。

桌面首页“选择工作区”和侧栏创建项目使用同一套居中文件夹表单。首页入口同时列出已有项目，选择后打开该项目，不修改原名称。纯浏览器宿主保留官方目录浏览器。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-web-ui-settings
```

### 从仓库安装（开发调试）

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-web-ui-settings
```

安装后重启 `dsh web`，设置页出现该分区。

## 安全模型

- ChatGPT 界面只调用 `llm-pi-ai/openai-codex` 对应的官方 `ctx.authorization` 流程，不读取、复制、导入或改写 OAuth grant。
- 本机 HTTP 桥接只返回流程状态、限长提示、交互问题和来自 `describeRecord` 的凭据存在性元数据。access token、refresh token 和已存记录内容不会进入浏览器 bundle 或桥接响应。
- 授权路由复用设置桥接的 loopback、规范 Host、同源和认证代理检查。Provider 错误在跨越边界前会收敛为稳定错误码。
- bai 供应商使用官方 `llm-pi-ai` 的 `openai-completions` 配置能力，不替换官方 `ModelDirectory`，模型列表来自用户 Key 对应的 `/v1/models`。
- bai 供应商 Key 只经本机受保护的 POST 路由进入官方凭据服务；路由只回传凭据存在性、模型数量和模型名称，绝不回传 Key，也不把 Key 写入 settings 文件、URL 或日志。
- 浏览器连接只能由受保护的本机请求发起。临时监听器绑定 `127.0.0.1`，仅接受来源为 bai 精确域名、携带随机 256 位 state 的一次性表单 POST，五分钟后过期。网站要求用户明确授权 Key；密码和网站会话留在网站。取消或插件卸载会关闭监听器，已开始的授权写入完成后才能进行下一项操作。账户余额仍在控制台管理。

## 代理配置

`trustedProxyHosts` 为空时，桥接仍仅限 loopback。与 DSH 运行在同一主机上的认证反向代理可以显式加入准确的 authority，并指定保存共享令牌的环境变量名：

```yaml
- id: ui-web-ui-settings
  config:
    trustedProxyHosts:
      - dsh.example.com
    proxyTokenEnv: DSH_WEB_UI_SETTINGS_PROXY_TOKEN
```

不要把令牌写入 profile 配置。代理必须在转发前完成认证、替换内部令牌请求头，并且只能转发到 DSH 的 loopback 监听器。

## 已知限制

- 仅当依赖的 `@deepseek-ai/dsh-client-ui-settings` 存在时，该分区才会出现在 dsh 设置页。
- 拓展坞快捷入口还要求 Desktop 宿主声明窄权限 `extensions.open`。
- ChatGPT 登录要求宿主授权服务和已注册的 `llm-pi-ai/openai-codex` 流程；打开 OAuth 页面还需要本地 Desktop 与系统浏览器环境。
- 认证代理模式本身不提供认证；没有正确配置并排序代理的部署必须让 `trustedProxyHosts` 保持为空。
- bai 供应商的额度、充值、Key 撤销和账号管理仍由 bai 供应商控制台负责；本包不代理充值，也不持有项目共享 Key。

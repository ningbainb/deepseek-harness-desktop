# dsh-aionui-panel — DSH Web GUI 右侧面板系统

[English](README.md) | 中文

> AionUi 右侧面板的像素级复刻（Apache-2.0 授权参考实现，非抄录）：Explorer 项目面板（文件树 / 文件名搜索 / Git 变更）+ Preview 预览面板（10+ 格式多 tab 预览）+ 统一拖拽布局系统，按项目隔离的偏好持久化。

## 安装

推荐直接安装全家桶聚合包 `@linxin666/dsh-web-ui-all`（一个包装齐全部功能插件与皮肤），或单独安装本插件：

```sh
### 从 npm 安装（推荐）
dsh plugin --profile web add @linxin666/dsh-client-ui-aionui-panel

### 从仓库安装（开发调试）
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-aionui-panel

```

安装后**重启 `dsh web`**。原生 Sidebar SDK 可用时，默认由 DSH 管理右侧界面及会话标签，切换对话不强制展开或跳转。边缘展开按钮可打开保留的兼容工具；旧宿主直接使用兼容面板。

面板标题栏为并存的工作台控件预留空间。文件面板关闭按钮位于工具栏内；应用框架重建时重新挂载面板内容，并保留面板状态。

## 使用

官方 Sidebar 标签系统可用时，网页预览使用原生标签，也可从原生新标签页向导打开。兼容预览的加号创建独立原生网页标签，不丢弃编辑缓冲区；旧宿主保留 URL 标签。原生网页地址和地址栏草稿随标签记录保留，隐藏或重挂载不丢失，但不跨应用重启保存。关闭由原生标签和浮窗标题栏负责，地址栏不重复提供按钮；地址栏中的 Ctrl/Cmd+W 仍可使用，兼容查看器保留关闭按钮。兼容标签已提交的网址随项目标签元数据保存在本地，不作为文件系统路径读取。两种查看器均保留不透明来源的 iframe 沙箱，不允许弹出窗口；禁止嵌入的网站可能无法显示。

原生 Sidebar SDK 可用时，Explorer 工具栏打开 DSH 自带的“文件”页或原生“Git 变更”标签。原生新标签页向导同时提供“文件工具”（搜索、拖拽、路径引用和编辑）。这些页面共用已有工作区状态与编辑缓冲区，由原生标签栏负责关闭和分栏，不嵌套“文件／变更”工具栏。隐藏的桌面 Explorer 暂停其 UI，状态和未保存的编辑标签保留。工具仅对当前所属对话生效；旧宿主保留桌面面板。

原生右侧栏接管后，兼容文件树和编辑器让出布局空间，不关闭标签、不改写保存的偏好。收起原生侧栏不会自动打开旧面板；点击边缘展开按钮或明确执行编辑操作才返回兼容工具。空对话缺少原生标题栏返回按钮时，输入栏提供一个通过公共控制接口打开同一原生侧栏的入口；原生标题栏按钮存在时不重复显示。

项目会话（当前会话有工作目录）的兼容工具提供以下能力：

- **Explorer（最右栏，默认 260px，范围 220~500px）**：`文件 / 变更` 双 tab；文件夹整行点击展开/收起，普通文档和图片在已注册的原生 DSH Sidebar 阅读器可用时优先使用原生预览。右键“编辑 / 兼容预览”保留桌面编辑能力，已有编辑缓冲区保持原归属。切换预览面板时仅隐藏另一侧，不关闭其标签。文件名搜索使用 150ms 防抖，结果定位到树中。`变更`读取真实 Git 状态，支持 stage / unstage / discard，批量放弃须确认。
- **拖拽文件到输入框**：内部文件树行插入工作区相对路径。官方通用文件生命周期可用时，新上传、进度、重试和移除由 DSH 负责，不显示重复选择器；大图保留校验和压缩，混合附件保持原顺序后提交原生。旧 `.dsh-attachments/` 草稿引用保留存在性检查、缺失提示和移除。旧内核保留串行上传队列（单文件 100 MB）；无队列时保留文本与路径回退。本插件不预先解析 PDF、Office 或二进制内容。
- **Preview（右二栏，默认 480px，范围 340~1200px）**：多 tab 预览，支持 markdown / html / code / diff / csv / pdf / word / excel / ppt / 图片 / 文本 / url；源码/预览切换、分屏编辑（比例持久化）、保存（mtime 冲突检测）、下载、刷新（4 态：不渲染死按钮）、dirty 点、中键关闭、右键菜单批量关闭（dirty 确认）、tab 溢出渐变指示器。

交互细节：

- 拖拽左缘把手调宽（rAF 每帧合并，body user-select:none）；双击把手复位默认宽度。
- 两级宽度钳位（Explorer 先、Preview 后）数学保证聊天区 >= 360px；超限值回写持久化。
- 折叠 = 宽度缩 0，状态仓保留树展开态和预览标签；隐藏的 Explorer 子组件卸载以释放聚焦监听，无过渡动画。折叠后右侧出现浮动展开按钮。
- 明暗双主题跟随 GUI（`body[data-ds-dark-theme]`），prefers-reduced-motion 全局禁用动画。
- 偏好按项目隔离持久化（localStorage keys 与 AionUi 一致）：`chat-workspace-width-px` / `chat-preview-width-px` / `preview-panel-split-ratio` / `project-panel-collapse:<root>` / `explorer-ui:<root>` / `scm-ui:<root>` / `preview-ui:<root>`（LRU 上限 12 scope）。读取一律范围校验，非法值回退默认。

## 数据源

真实文件系统与真实 git 仓库，无任何 mock：

- host 半区（`src/index.ts` + `src/host/`）经 `/aionui-panel/*` HTTP 路由提供目录列举、文件读取（文本 80k 字符上限 / 图片 data URL）、写入（mtime 冲突检测）、文件名搜索（跳过 .git / node_modules）、git status（porcelain v1 -z）/ stage / unstage / discard，以及 SSE 变更流（fs 监听 + git 轮询）。
- 所有操作经过工作区门卫：路径必须落在已注册 workspace 内（realpath 规范化 + 前缀校验），浏览器只能读写项目根下的相对路径。
- 所有 `/aionui-panel/*` 路由（JSON 操作、raw 读取与 SSE 事件流）仅限 loopback：非 loopback 客户端在任何工作区访问前即收到 `403 forbidden: loopback-only`，与 dsh-ssh 的 fence 一致。
- 递归 watcher 忽略 `node_modules` / `.git` 下的变更；SCM 轮询每 30s 对每个 workspace 探测一次（单次探测有 15s 超时兜底），非 git 仓库的根经 TTL 缓存不再反复探测。文件编辑经 watcher 即时呈现；仅 `.git` 元数据变更（其他工具的 commit/checkout）在一个轮询周期内或窗口重新聚焦（5s 节流）时呈现。
- browser 半区（`src/client/`）以当前会话 cwd 作为项目根，切换会话即切换项目。

## 结构

- `src/index.ts` — host 半区入口（cordis 插件：路由注册 + systemPrompt 公告）。
- `src/host/` — fs/git 数据服务与路由层（workspace gate）。
- `src/core/types.ts` — 前后半区共享的线上类型。
- `src/client/` — browser 半区：框架无关状态核心（`store.ts`）、拖拽引擎（`drag.ts` + `hooks/useResizableSplit.ts`）、DOM 布局控制器（`layout.ts`，向 shell 的三栏 grid 追加面板轨道）、React 组件（explorer / scm / preview）。
- `tests/` — clamp 公式、porcelain 解析、持久化校验、markdown/csv 渲染、store 行为等纯逻辑测试（vitest，37 个）。

## 构建

```sh
export NPM_TOKEN='<token>'   # 若仍使用私有 scope 认证
pnpm install
pnpm -r build
```

## 署名

本项目是 AionUi（iOfficeAI/AionUi，Apache-2.0）右侧面板系统的复刻实现：尺寸、颜色、动效、交互参数来自对 v2.1.53 的实测调研（研究报告与截图见 aionui-research 仓库），实现为全新代码，未大段抄录源码。上游版权归 AionUi 项目所有，本项目仅按 Apache-2.0 约定保留署名。

## 安全模型

旧附件接口仅接受同源回环请求与已存在的直接会话，从宿主会话头取得工作目录并核对工作区登记，拒绝调用方指定任意目录、目录穿越与外部符号链接。该接口上传流有 100 MB 上限，使用独占新文件，失败清理未完成副本；不执行文件内容。移除旧卡片只移除草稿引用，不删除源文件或已上传副本，以保留历史引用。上传副本保存在工作区内，可能出现在文件树和 Git 未跟踪列表；不自动修改 Git 忽略规则。远程未配对访问继续被拒绝。原生上传遵循官方 DSH 的准入与存储策略，本插件不绕过其检查。匿名结果统计只包含固定状态码，不包含文件名、路径、附件标识或内容。

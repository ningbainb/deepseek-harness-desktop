# Desktop 内置终端与无外部控制台设计

## 目标

DeepSeek Harness Desktop 提供一个由 Electron 自身托管的本地交互终端，使用户在 DSH Runtime 尚未就绪、卡在启动进度或插件树崩溃时仍能进入可操作界面，并让 Git、PowerShell、Agent 和诊断命令在应用窗口内运行而不弹出 CMD、PowerShell 或 Windows Terminal 窗口。

## 已确认现状

Runtime、插件安装、托管 Git 探测和更新相关的非交互子进程已经使用 `windowsHide: true`，因此继续添加相同参数不能提供交互终端，也不能解决用户需要手动修复时必须打开外部控制台的问题。

项目已经随安装包提供 `@xterm/xterm`、`@xterm/addon-fit` 和 `node-pty`，SSH 插件也验证了 xterm 的浏览器渲染方式，但 SSH 终端依赖 DSH Runtime 和插件树，不能作为桌面启动故障时的控制平面。

## 方案比较

- 把终端嵌入 DSH Web 主页面会复用现有页面布局，但主页面、Cordis 插件树或 Runtime 失败时终端也会失效。
- 调用 Windows Terminal、CMD 或 PowerShell 实现成本低，但仍会产生外部窗口，并依赖系统组件和窗口策略。
- 在现有 Desktop 窗口底部挂载专属的本地 WebContentsView，由 Electron 主进程托管 PTY，可以独立于 Runtime 工作、复用安装包中已有的 xterm 资源，并且不产生第二个窗口或任务栏项目。

采用第三种方案；不使用独立 BrowserWindow，因为对用户而言它仍然属于弹出的终端窗口。

## 架构

终端面板使用附着在当前 Desktop BrowserWindow 内的独立 WebContentsView、本地 HTML、CSS、渲染脚本和专用 preload，保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`，禁止导航、新窗口、WebView 和浏览器权限。

主进程通过 `node-pty` 创建一个 ConPTY 会话，Windows 上优先使用 PowerShell 7，随后回退到系统 Windows PowerShell，工作目录由 Desktop 主进程固定为当前工作区或用户目录，渲染层不能指定可执行文件、参数、工作目录或环境变量。

终端 IPC 只允许终端子视图的 `webContents` 调用启动、写入、缩放、重启和关闭操作，输入长度与行列范围都有上限，面板收起或父窗口销毁后 PTY 必须立即回收，PTY 的异常和退出事件只更新终端状态，不能杀死 Desktop 或 DSH Runtime。

xterm 和 FitAddon 通过安装包中已经存在的固定本地依赖加载，不使用网络 CDN，不增加第二份运行库，不允许查询参数选择脚本地址。

## 用户体验

原生“工具 / Tools”菜单和应用内标题栏工具菜单增加“内置终端 / Built-in Terminal”，快捷键为 `Ctrl+Alt+T`。

启动进度页始终显示“打开内置终端”，因此卡在 8% 或进入重复崩溃保护时无需退出应用即可检查日志、运行 Git 或让本机 Agent 协助修复。

终端从当前窗口底部展开，不创建独立窗口；收起面板时结束当前 shell 会话，再次展开时创建干净会话，终端状态栏明确显示当前 shell 和工作目录，并提供重启会话按钮。

内置终端是完整的当前用户终端，用户主动输入的命令按当前 Windows 用户权限执行；后台自动迁移、更新、插件安装和 Git 探测仍采用非交互隐藏进程，不会为了显示日志而强制打开终端窗口。

## Git 与 Agent

终端启动前由主进程检查已经验证的内置 Git、用户托管 Git或系统 Git，并只把验证后的 Git 命令目录注入该终端会话的临时 `PATH`，不修改系统环境变量、注册表或用户全局 `PATH`。

如果 Git 不可用，现有固定清单、哈希验证和用户确认后的自动下载修复流程保持不变；修复成功后的新终端会话立即可使用 Git。

用户已经安装的 Agent 可以直接在内置终端运行，但 Desktop 不会在未经用户输入的情况下自动执行任意修复命令。

## 验收标准

- DSH Runtime 在启动阶段失败时，启动页仍能打开内置终端。
- 打开终端不会出现 CMD、PowerShell 或 Windows Terminal 外部窗口。
- 终端可以交互执行 PowerShell 内建命令、`git --version` 和可用的 Agent 命令。
- 非终端渲染器无法调用终端 IPC，终端渲染器无法选择任意 shell、路径或环境变量。
- 收起面板、关闭父窗口、PTY 退出和应用退出都会回收会话且不产生未处理异常。
- 开发环境测试、完整单元测试、打包结构校验和安装包冒烟测试全部通过。

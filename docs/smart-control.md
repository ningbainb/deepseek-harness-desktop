# 智能操控使用指南

DeepSeek Harness Desktop 4.1.0 提供 Browser Use 与 Computer Use。两项能力均为实验功能并默认关闭，可从会话左侧栏的“智能操控”进入操控中心。

## Browser Use

默认 Provider 是 Playwright MCP。Desktop 会查找系统中的 Chrome、Edge 或 Chromium，打开可见的独立浏览器窗口，并为每个任务使用隔离会话；浏览器本体不会被打入安装包。未发现兼容浏览器时，操控中心会给出当前平台的安装提示。

Chrome DevTools MCP 适合诊断。Attach 模式属于高级配置，仅允许连接本机调试端点；它可能共享现有浏览器登录态，启用前应关闭无关页面并确认风险。Stagehand 需要独立设置 `DSH_STAGEHAND_MODEL` 与 `DSH_STAGEHAND_MODEL_API_KEY`，不会复用 DeepSeek 路由或把凭据写进 Desktop Profile。

页面快照和结构读取属于观察操作。点击、输入、上传、下载或其他可能改变外部状态的操作会进入 Harness 审批流程；拒绝或取消不会自动重试。

## Computer Use

默认 Provider 是随包安装的 Cua Driver Native。外置 Cua Driver MCP 可作为进程隔离与故障回退，需要维护者明确配置 `CUA_MCP_COMMAND`。Desktop 不执行市场目录或远端返回的任意 Shell 命令。

截图、窗口枚举属于观察操作。鼠标点击、键盘输入和文本注入逐次确认。元素快照失效后必须重新观察，避免对陈旧坐标执行操作。

- macOS：首次使用通常需要“辅助功能”和“屏幕录制”权限。操控中心可打开对应系统设置；授权后请返回应用重新测试。
- Windows：能力取决于当前用户桌面会话和 Native Driver 状态，不需要为了普通使用申请管理员权限。
- Linux：能力取决于 X11/Wayland、桌面门户、发行版和沙箱限制，Preview 不承诺与 Windows 完全一致。

Native Provider 连续启动失败时，Desktop 会保留用户配置、临时停用 Computer Use 并以安全模式恢复 Runtime，避免启动循环。排除权限或驱动问题后，在操控中心重新开启即可清除暂停状态。

## 数据与隐私边界

匿名产品分析只使用固定枚举值记录入口访问、启停结果、Provider 类别、权限检查结果和安全探测结果。不会发送 URL、域名、页面内容、应用或窗口名称、截图、提示词、工具参数、绝对路径或凭据。操作审批由 DSH Runtime 处理，Desktop 前端只接收安全化状态与错误原因。

## 常见排查

1. 先点击“安全测试”，确认状态是“已就绪”还是“需要系统权限”。
2. Browser Use 未发现浏览器时，安装当前平台的 Chrome、Edge 或 Chromium 后重启 Desktop。
3. Computer Use 提示权限不足时，按操控中心入口打开系统设置并授权，再重新测试。
4. Provider 启动失败时先关闭并重新开启；连续失败后让安全模式完成启动，再查看诊断页。
5. 不要把远程调试端口暴露到局域网或公网，也不要对不受信任页面共享现有浏览器登录态。

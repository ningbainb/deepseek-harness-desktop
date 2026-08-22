# dsh-desktop-client

[English](README.md) | 中文

`@linxin666/dsh-desktop-client` 是 DeepSeek Harness Desktop 可选集成的公开浏览器安全 SDK。它只使用版本化 Desktop Contract，在普通 DSH Web 中返回 `unavailable`。

## 能力

- 读取 Desktop 信息、Contract capability 与 Runtime 状态。
- 订阅 Runtime 状态和已验证的 Deep Link。
- 在可用时展示 Desktop 通知，并打开扩展或更新界面。
- 提供窄权限 `extensions.open` 和受限的前三次启动拓展坞提示状态，但不会向主页面授予扩展管理权限。
- 通过 Desktop 验证器和系统默认应用打开工作区相对文件。

## 安装

```sh
pnpm add @linxin666/dsh-desktop-client
```

## 配置

无需配置，也不需要导入 Desktop 专有实现。

```ts
import {
  getDockEntryState,
  hasCapability,
  openDesktopSurface,
  openWorkspaceFile,
  showNotification,
  subscribeDeepLinks,
  taskDeepLink,
} from '@linxin666/dsh-desktop-client'

const dock = await getDockEntryState()
if (dock.available) {
  await openDesktopSurface('extensions')
}

if (await hasCapability('notifications.show')) {
  await showNotification({
    category: 'task',
    id: 'task:example:complete',
    title: '任务完成',
    body: '示例任务已完成。',
    deepLink: taskDeepLink('example'),
  })
}

if (await hasCapability('workspace-files.open')) {
  await openWorkspaceFile({ root: workspaceRoot, path: 'reports/result.md' })
}

const dispose = subscribeDeepLinks((link) => console.info('Desktop 路由', link))
// 插件卸载时释放订阅。
dispose()
```

## 安全模型

SDK 不暴露 preload 对象、Electron、任意 IPC、文件系统、Shell、插件变更、凭据、私钥、Token 或 DSH Runtime 对象。打开拓展坞只需要 `extensions.open`；安装、更新、删除和信任操作仍不向主页面开放。可选工作区文件 helper 接受调用方显式提供的已注册工作区根目录和相对路径。Desktop 通过工作区注册表解析根目录、重新验证最终规范化文件后，才交给操作系统。

## 已知限制

Desktop 集成是可选能力。普通 DSH Web 返回 `unavailable`，订阅为空操作，也不会创建后台进程或网络请求。公开 Host 路由不认证一个已注册根目录是否就是浏览器当前选中的会话；插件应传入其 UI 提供的当前工作区根目录。1.x 只增加能力；删除能力需要 SDK 2.0 或未来的 Desktop major，且至少提前一个 Desktop minor 标记弃用。

# Desktop 插件兼容性声明

社区 DSH bundle 可以在 `package.json` 的 `dsh.compatibility` 写入可验证的 Desktop 契约。该声明是兼容性证据而非权限授予：扩展坞会展示并评估它，不能由插件自行扩大 Renderer 或 Host 权限。

```json
{
  "dsh": {
    "compatibility": {
      "desktop": { "range": ">=3.0.0 <4.0.0", "api": "^1.2.0" },
      "runtime": {
        "range": ">=0.1.0-rc.8 <0.2.0",
        "evidence": {
          "providerId": "dsh-cli-provider-v1",
          "runtime": "0.1.0-rc.8",
          "desktop": "3.0.0",
          "verifiedAt": "2026-08-21",
          "matrixArtifact": "apps/dsh-desktop/runtime-support/supported-runtimes.json"
        }
      },
      "capabilities": ["workspace-files.open"],
      "surfaces": ["main"]
    }
  }
}
```

## 字段与匹配规则

`desktop` 和 `runtime` 可直接写 semver range，也可写带 `range` 的对象。`desktop.api` 声明 Desktop Contract API 范围；旧键 `desktopApi` 仅用于已有清单的兼容读取。`capabilities` 与 `surfaces` 是非空字符串列表，列出的每一项都必须由当前 Desktop 提供。Runtime、Node 或 peer 版本不匹配同样会使 bundle 不兼容。

`runtime.evidence` 或顶层 `runtimeEvidence` 只接受 `providerId`、`runtime`、`desktop`、`verifiedAt` 和 `matrixArtifact` 这些有界公开诊断字段。它用于说明测试组合，不携带凭据、路径、日志或权限，也不会让未获得的能力变为可用。

## 扩展坞与 profile 记录

安装或更新时，Extension Dock 显示 Desktop、Runtime、Desktop API、能力、Surface 与证据。范围或必需能力不匹配时操作被阻止；没有足够声明时状态是“未知”，只能由用户在扩展坞明确确认后继续，不能显示为“已适配”。启动对账也会停用已安装但不兼容的社区 bundle。

Desktop 在安装、更新、清单读取和启动对账后，将最终评估原子写入 `~/.dsh/profiles/desktop/desktop-plugins.lock.json`。它记录 schema 版本、包名、请求与已安装版本、Desktop 管理/内置状态、启用状态和兼容诊断。该文件是派生的诊断快照，不是包管理器 lockfile，不是可编辑的授权清单，也不能用来升级或信任未验证版本。

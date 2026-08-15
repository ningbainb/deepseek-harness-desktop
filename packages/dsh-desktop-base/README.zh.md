# dsh-desktop-base

[English](README.md) | 中文

DeepSeek Harness Desktop 的基础功能聚合插件。安装一个包即可启用桌面版所使用的 Web UI 插件合集、插件市场、Codex Connect 和推理强度控制。

本包只负责依赖和配置聚合，不复制、不改名，也不主张拥有任何上游插件。

## 包含内容

- `@linxin666/dsh-web-ui-all@0.1.15`
- `dshmarket@1.3.0`
- `dsh-codex-connect@0.1.0-alpha.4.5`
- `reasoning-slider@0.0.2`

本包不包含腾讯 QQ Bot。其 connector 在进入公开聚合包或安装器前，需要另行确认再分发和品牌使用授权。

## 安装

```sh
dsh plugin --profile web add dsh-desktop-base
```

安装后重启对应的 DSH Web profile。

## 从独立安装迁移

添加本聚合包前，请先从同一个 profile 中移除上述插件的独立 bundle。两种形式同时加载可能重复注册相同的 Cordis id。

Codex Connect 会占用 `llm-openai-codex` 路由。启用本聚合包前，请移除或禁用其他 Codex provider。

## 版本策略

所有依赖均锁定到经过桌面版验证的精确版本。上游升级由新的聚合包版本统一同步，避免已有安装被上游新版本静默改变。

## 所有权和许可

所有依赖插件仍由各自上游项目拥有和发布。仓库地址及许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

DeepSeek Harness Desktop 是社区项目，并非 DeepSeek 官方发行版。

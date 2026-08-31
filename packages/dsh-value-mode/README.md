# dsh-value-mode

English | [中文](README.zh.md)

Value Mode (性价比模式) V2 plugin for DeepSeek Harness (DSH): uses an expert controller to understand, split, delegate, review, and deliver each task, with a configured subagent worker model for bounded delegated work.

## Features

- Expert Controller Model (专家主控模型) and Subagent Worker Model (副模型 / 子代理执行模型) are selected from existing DSH providers. If no controller is explicitly configured, the current default model is preselected and used as a runtime fallback.
- Three built-in operating strategies:
  - **Saver (更省)**: Prefer direct controller work; delegate only when a task is clearly split or benefits from parallelism.
  - **Balanced (智能平衡 - Default)**: Delegate complex design, difficult issues, and important changes as needed, then review centrally.
  - **Powerful (更强)**: Delegate parallel subtasks proactively while the controller owns review and risk decisions.
- `subagent` and `subagent_fork` entry points are capped at depth 1; worker agents complete bounded tasks and do not delegate again or call the expert.
- `consult_expert` and `ManualExpertToggle` remain compatibility exports, but are no longer used as the primary route or registered as duplicate visible buttons.
- V2 Session-Scoped Overrides: Supports tuning strategy or expert controller for the active session without mutating global defaults.
- V2 Call Analytics: Real-time tracking of expert-controller and subagent-worker calls, token usage, and worker call share.
- V2 Intelligent Escalation & Risk Triggers: Offers controller review guidance upon consecutive failures and high-risk changes.
- V2 Compatibility Consultation History Drawer: Expandable session drawer for legacy expert-consultation summaries and durations.
- Safe graceful degradation: Automatically falls back to standard model execution when models are unconfigured or unavailable, preventing errors or crashes.
- Seamless Desktop & Web GUI integration: Session header status chip, first-use setup guide, quick-switcher popover, and plugin settings card.

## Install

### DeepSeek Harness Desktop

This plugin is directly built into DeepSeek Harness Desktop 3.2.0+. It is pre-installed in the desktop profile and ready to use.

### Standalone DSH Installation

For a standalone DSH installation, add the package to your profile:

```sh
pnpm install
pnpm --filter @linxin666/dsh-value-mode build
dsh plugin --profile web add link:$(pwd)/packages/dsh-value-mode
```

Restart `dsh web` after installation.

## Configuration

Select **Value Mode** in the session header. On first entry, a non-blocking setup guide opens automatically:

1. Confirm the **Expert Controller Model** (the current default model is preselected).
2. Select the **Subagent Worker Model**.
3. Select a strategy (**Saver**, **Balanced**, or **Powerful**; Balanced is the default).
4. Click **Complete setup and enable**. Model routes, strategy, and `enabled` are committed in order; failures leave the mode disabled.

Use **Settings -> Web UI Plugins -> Value Mode** for full adjustments.

## Development

```sh
pnpm --filter @linxin666/dsh-value-mode typecheck
pnpm --filter @linxin666/dsh-value-mode test
pnpm --filter @linxin666/dsh-value-mode build
```

## License

BSD-3-Clause

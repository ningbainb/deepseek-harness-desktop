# Desktop 2.5 DSH coupling audit

Authoritative Desktop version: 3.0.2.

Stable DSH package version: 0.1.1-rc.1.

Lockfile SHA-256: `90a7cdb56c8c6ce55ff4644bedd703e2c4292d13ac12c7d6b9cb0309c75d1504`.

Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.

## Classification summary

| Classification | Count |
| --- | ---: |
| public-stable | 152 |
| public-experimental | 109 |
| compatibility-patch | 23 |
| private-high-risk | 0 |

## Direct imports, dynamic imports, and requires

| File | Line | Kind | Specifier | Type-only | Classification | Controlled |
| --- | ---: | --- | --- | --- | --- | --- |
| packages/dsh-aionui-panel/src/client/drag/DragFileInlay.tsx | 17 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-aionui-panel/src/client/drag/DragFileInlay.tsx | 19 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-aionui-panel/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/host/gate.ts | 10 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-aionui-panel/src/host/git-service.ts | 11 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-aionui-panel/src/host/git-service.ts | 15 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-aionui-panel/src/host/routes.ts | 9 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 17 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 19 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 20 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 21 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 11 | static-import | @deepseek-ai/dsh-agent | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 13 | static-import | @deepseek-ai/dsh-agent-default-model | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 14 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 15 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 16 | static-import | @deepseek-ai/dsh-session-persistence | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 17 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/index.ts | 1 | static-import | @deepseek-ai/dsh-agent | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/index.ts | 3 | static-import | @deepseek-ai/dsh-agent-default-model | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/index.ts | 4 | static-import | @deepseek-ai/dsh-session | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/index.ts | 5 | static-import | @deepseek-ai/dsh-session-persistence | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/index.ts | 6 | static-import | @deepseek-ai/dsh-tools | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/index.ts | 7 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/recovery.ts | 1 | static-import | @deepseek-ai/dsh-agent | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/recovery.ts | 2 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/recovery.ts | 3 | static-import | @deepseek-ai/dsh-tools | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/recovery.ts | 4 | static-import | @deepseek-ai/dsh-tools | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 3 | static-import | @deepseek-ai/dsh-tools | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 9 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/tests/tool-call-normalization.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/tool-call-normalization.spec.ts | 4 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/tool-call-normalization.spec.ts | 5 | static-import | @deepseek-ai/dsh-tools | no | compatibility-patch | no |
| packages/dsh-desktop-repair/src/index.ts | 3 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | yes |
| packages/dsh-desktop-repair/src/index.ts | 5 | static-import | @deepseek-ai/dsh-llm | no | public-stable | yes |
| packages/dsh-desktop-repair/src/index.ts | 6 | static-import | @deepseek-ai/dsh-session | no | public-stable | yes |
| packages/dsh-desktop-repair/src/index.ts | 7 | static-import | @deepseek-ai/dsh-agent-default-model | yes | public-stable | yes |
| packages/dsh-desktop-repair/src/index.ts | 8 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | yes |
| packages/dsh-desktop-repair/src/index.ts | 9 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | yes |
| packages/dsh-desktop-repair/src/model-runner.ts | 1 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | yes |
| packages/dsh-desktop-repair/src/tools.ts | 1 | static-import | @deepseek-ai/dsh-tools | no | public-stable | yes |
| packages/dsh-git-graph/src/client/chips/BranchChip.tsx | 16 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-git-graph/src/client/chips/BranchChip.tsx | 18 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-git-graph/src/client/chips/BranchPopover.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-git-graph/src/client/chips/BranchPopover.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-git-graph/src/client/chips/Chip.tsx | 6 | static-import | @deepseek-ai/dsh-client-ui-primitives | yes | public-stable | no |
| packages/dsh-git-graph/src/client/chips/CreateBranchDialog.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-git-graph/src/client/chips/error-copy.ts | 8 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-git-graph/src/client/graph/GraphDialog.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-git-graph/src/client/graph/GraphDialog.tsx | 9 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-git-graph/src/client/index.ts | 31 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-git-graph/src/client/index.ts | 32 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-git-graph/src/client/index.ts | 36 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-git-graph/src/client/index.ts | 37 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-git-graph/src/host/git-service.ts | 10 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-git-graph/src/host/git-service.ts | 14 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-git-graph/src/host/routes.ts | 9 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-git-graph/src/index.ts | 12 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-git-graph/src/index.ts | 17 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-git-graph/src/index.ts | 18 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-git-graph/src/invariant.ts | 9 | static-import | @deepseek-ai/dsh-invariants | yes | public-stable | no |
| packages/dsh-git-graph/tests/client.spec.tsx | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-liangshen/src/index.ts | 17 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-live-stats/src/client/LiveStatsSettingsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-live-stats/src/client/LiveStatsSettingsCard.tsx | 8 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 3 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 6 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-live-stats/src/estimator.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/src/estimator.ts | 2 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 3 | static-import | @deepseek-ai/dsh-session-projection | yes | public-stable | no |
| packages/dsh-live-stats/src/invariant.ts | 7 | static-import | @deepseek-ai/dsh-invariants | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 1 | static-import | @deepseek-ai/dsh-session-projection/types | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 6 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 7 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 8 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 9 | static-import | @deepseek-ai/dsh-session-projection | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 10 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/projection.ts | 11 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/projection.ts | 20 | static-export | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/tests/estimator.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 6 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 7 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 8 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 9 | static-import | @deepseek-ai/dsh-session-projection | no | public-stable | no |
| packages/dsh-live-stats/tests/tps-line.spec.tsx | 3 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 2 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/controller.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 2 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-particle-theme/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-particle-theme/tests/controller.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-particle-theme/tests/settings-card.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/PetDockEntry.tsx | 12 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/PetSettingsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/PetSettingsCard.tsx | 8 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/WhalePet.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/pet-store.ts | 9 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-pet/src/client/pet-store.ts | 10 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-pet/src/event-projection.ts | 9 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-pet/src/index.ts | 10 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-pet/src/index.ts | 12 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-pet/src/routes.ts | 10 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-pet/src/service.ts | 11 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-pet/tests/service-enabled.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/FooterRemoteEntry.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/PairFailedNotice.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteEntry.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemotePanel.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemotePanel.tsx | 12 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteSettingsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteSettingsCard.tsx | 8 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/UpdateEntry.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/UpdateEntry.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/UpdatePanel.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/UpdatePanel.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/deep-link.ts | 13 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-sidebar/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-remote-web-ui/src/index.ts | 11 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/index.ts | 16 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/invariant.ts | 7 | static-import | @deepseek-ai/dsh-invariants | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-api.ts | 22 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-api.ts | 24 | static-import | @deepseek-ai/dsh-host-apiproxy | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-api.ts | 25 | static-import | @deepseek-ai/dsh-host-apiproxy/api/rpc | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile-api.ts | 26 | static-import | @deepseek-ai/dsh-host-apiproxy/api/rpc | no | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile-routes.ts | 11 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile/api.ts | 8 | static-import | @deepseek-ai/dsh-host-apiproxy/api/workspace | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/api.ts | 9 | static-import | @deepseek-ai/dsh-host-apiproxy/api/sessions | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/api.ts | 29 | dynamic-import | @deepseek-ai/dsh-host-apiproxy/api/sessions | no | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/mux.ts | 27 | static-import | @deepseek-ai/dsh-host-apiproxy/api/events | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/mux.ts | 28 | static-import | @deepseek-ai/dsh-host-apiproxy/api/events.schema | no | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/mux.ts | 29 | static-import | @deepseek-ai/dsh-host-apiproxy/api/rpc.schema | no | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/App.tsx | 8 | static-import | @deepseek-ai/dsh-host-apiproxy/api/workspace | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/ChatView.test.tsx | 3 | static-import | @deepseek-ai/dsh-host-apiproxy/api/sessions | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/ChatView.tsx | 14 | static-import | @deepseek-ai/dsh-host-apiproxy/api/events | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/ChatView.tsx | 16 | static-import | @deepseek-ai/dsh-host-apiproxy/api/sessions | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/SessionListView.test.tsx | 3 | static-import | @deepseek-ai/dsh-host-apiproxy/api/workspace | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/SessionListView.tsx | 14 | static-import | @deepseek-ai/dsh-host-apiproxy/api/workspace | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/SessionListView.tsx | 16 | static-import | @deepseek-ai/dsh-host-apiproxy/api/sessions | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.test.tsx | 3 | static-import | @deepseek-ai/dsh-host-apiproxy/api/workspace | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.tsx | 8 | static-import | @deepseek-ai/dsh-host-apiproxy/api/workspace | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/routes.ts | 11 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/update-routes.ts | 8 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-api.spec.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-api.spec.ts | 11 | static-import | @deepseek-ai/dsh-host-apiproxy | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-routes.spec.ts | 2 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/routes.spec.ts | 2 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-ssh/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-ssh/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-ssh/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-ssh/src/index.ts | 11 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-ssh/src/index.ts | 13 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-ssh/src/index.ts | 15 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-ssh/src/index.ts | 16 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-ssh/src/routes.ts | 10 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-ssh/src/tools.ts | 7 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-ssh/src/tools.ts | 8 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-ssh/tests/tools.test.ts | 7 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-ssh/tests/tools.test.ts | 9 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-task-board/src/client/TaskBoardSettingsCard.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-task-board/src/client/TaskBoardSettingsCard.tsx | 9 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-task-board/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-task-board/src/host/routes.ts | 2 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-task-board/src/host/v3-routes.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-task-board/src/index.ts | 13 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-task-board/src/index.ts | 18 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-task-board/src/index.ts | 20 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/attach-routes.ts | 16 | static-import | @deepseek-ai/dsh-attachment | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/DescribeImageSettingsCard.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/DescribeImageSettingsCard.tsx | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-tool-describe-image/src/config-resolve.ts | 10 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/config-resolve.ts | 13 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/config-resolve.ts | 14 | static-import | @deepseek-ai/dsh-launch-environment | no | public-stable | no |
| packages/dsh-tool-describe-image/src/config-resolve.ts | 15 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-tool-describe-image/src/index.ts | 17 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/index.ts | 19 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-tool-describe-image/src/index.ts | 20 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/vision-client.ts | 11 | static-import | @deepseek-ai/dsh-attachment | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/attach-routes.spec.ts | 8 | static-import | @deepseek-ai/dsh-attachment | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/attach-routes.spec.ts | 11 | static-import | @deepseek-ai/dsh-attachment | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/loader-composition.spec.ts | 5 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/loader-composition.spec.ts | 14 | static-import | @deepseek-ai/dsh-agent | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/loader-composition.spec.ts | 15 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/loader-composition.spec.ts | 16 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 3 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 10 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 11 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 12 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 13 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 7 | static-import | @deepseek-ai/dsh-attachment | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 8 | static-import | @deepseek-ai/dsh-attachment | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 9 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 10 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 19 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 20 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/vision-cache.spec.ts | 3 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/vision-cache.spec.ts | 9 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/vision-cache.spec.ts | 10 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 15 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 18 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 19 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/WebUIPluginsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 21 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 22 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 23 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 24 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/index.ts | 13 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/index.ts | 18 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 7 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 10 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/skins/skin-center/src/client/SkinCenter.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/skins/skin-center/src/client/SkinCenter.tsx | 13 | static-import | @deepseek-ai/dsh-client-ui-theme/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/background.ts | 16 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-ui-theme/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/skins/skin-center/src/index.ts | 11 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/skins/skin-center/src/index.ts | 13 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/skins/skin-center/src/routes.ts | 21 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/skins/skin-center/tests/routes.spec.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/skins/ths/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/skins/trading/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/skins/trading/src/client/quotes.ts | 22 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| shared/client/settings/settings-form.ts | 10 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| shared/client/settings/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| shared/tests/settings-form.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |

## Slot, Host service, Profile/Home, Workspace, Session, and Runtime lifecycle seams

| Category | File | Line | Operation or identity |
| --- | --- | ---: | --- |
| host-service | apps/dsh-desktop/src/runtime-provider.mjs | 239 | host-service.register |
| host-service | apps/dsh-desktop/test/runtime-provider.test.mjs | 153 | task-board |
| host-service | packages/dsh-aionui-panel/src/client/index.ts | 37 | locale |
| host-service | packages/dsh-aionui-panel/src/index.ts | 28 | subprocess |
| host-service | packages/dsh-desktop-compat/src/index.ts | 18 | tools |
| host-service | packages/dsh-git-graph/src/client/index.ts | 81 | locale |
| host-service | packages/dsh-git-graph/src/index.ts | 27 | subprocess |
| host-service | packages/dsh-git-graph/src/invariant.ts | 17 | invariants |
| host-service | packages/dsh-liangshen/presets/liangshen/tool-bootstrap.mjs | 33 | tools |
| host-service | packages/dsh-live-stats/src/client/index.ts | 58 | remote |
| host-service | packages/dsh-live-stats/src/invariant.ts | 15 | invariants |
| host-service | packages/dsh-mode-switcher/src/client/index.ts | 8 | connection |
| host-service | packages/dsh-particle-theme/src/client/index.ts | 29 | locale |
| host-service | packages/dsh-pet/src/client/index.ts | 70 | remote |
| host-service | packages/dsh-remote-web-ui/src/client/index.ts | 93 | remote |
| host-service | packages/dsh-remote-web-ui/src/invariant.ts | 15 | invariants |
| host-service | packages/dsh-ssh/src/client/index.ts | 35 | locale |
| host-service | packages/dsh-ssh/src/index.ts | 26 | tools |
| host-service | packages/dsh-task-board/src/client/index.ts | 80 | remote |
| host-service | packages/dsh-tool-describe-image/src/client/index.ts | 61 | locale |
| host-service | packages/dsh-tool-describe-image/src/index.ts | 27 | tools |
| host-service | packages/dsh-web-ui-settings/src/client/index.ts | 43 | web-ui-plugins |
| host-service | packages/skins/skin-center/src/client/index.ts | 63 | remote |
| profile-home | apps/dsh-desktop/scripts/capture-startup.mjs | 39 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 108 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 110 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 113 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 144 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 146 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 148 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 149 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 150 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 153 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 160 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 189 | profileDir |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 35 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 38 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 43 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 44 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 50 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-startup-fps.mjs | 23 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/packaged-smoke-runner.mjs | 57 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/preset-deep-link-runner.mjs | 63 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-skills.mjs | 27 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-directory-picker.mjs | 52 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-particle-theme.mjs | 25 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 41 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 68 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 69 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 70 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 76 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 101 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 107 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 140 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 192 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 198 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 202 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 245 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 5 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 5 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 5 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 12 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 13 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 18 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 43 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 43 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-settings-window.mjs | 57 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-star-prompt.mjs | 25 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-terminal.mjs | 105 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 71 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 134 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-window-chrome.mjs | 43 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 105 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 105 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 117 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 117 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 153 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 153 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 67 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 68 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 69 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 121 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 122 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 491 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 799 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 814 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 826 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 827 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 827 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 833 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 846 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 846 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 879 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 995 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 995 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1000 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1000 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1005 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1005 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1077 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1138 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1138 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1226 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1613 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1642 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1705 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1705 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1711 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1711 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 92 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 95 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 213 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 216 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 228 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 310 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 311 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 314 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 316 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 317 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 390 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 394 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 414 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 424 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 424 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 450 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 450 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 473 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 492 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 507 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 537 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 538 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 543 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 556 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 577 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 579 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 593 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 609 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 613 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 738 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 739 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 765 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 766 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 769 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 776 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 780 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 837 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 838 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 841 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 847 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 856 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 864 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 924 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 929 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 951 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 961 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 967 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 973 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 977 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 984 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1020 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1021 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1023 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1032 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1049 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1101 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1104 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1114 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1161 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1168 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1186 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1196 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1224 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1247 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1253 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 83 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 241 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 248 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 248 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 394 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 395 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 521 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 48 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 52 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 58 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 70 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 164 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 165 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 166 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 174 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 186 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 186 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 250 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 264 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 274 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 282 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 301 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 331 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 333 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-baseline-quarantine.mjs | 360 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-migration.mjs | 68 | profileDir |
| profile-home | apps/dsh-desktop/src/profile-migration.mjs | 80 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 665 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 692 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 858 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 863 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 926 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 928 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 953 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/profile.mjs | 955 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 978 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 979 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 980 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 981 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1008 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1009 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1027 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1052 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1070 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1082 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1096 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1147 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1196 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 134 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 145 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 145 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 146 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 170 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-transaction.mjs | 170 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 70 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 74 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 92 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 290 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 298 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 298 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 306 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 306 | profileDir |
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 392 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 419 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 420 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 202 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 206 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 207 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 208 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 209 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 36 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 378 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 379 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 418 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 421 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 426 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 427 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 445 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 447 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 663 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 664 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 664 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 665 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 665 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 666 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 667 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 668 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 669 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 671 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 672 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 696 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 697 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 699 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 823 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 941 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 942 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 994 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1013 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1028 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1072 | profileDir |
| profile-home | apps/dsh-desktop/test/automatic-repair-runner.test.mjs | 37 | profileDir |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 8 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 8 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 16 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 18 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 61 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 63 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 7 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 8 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 15 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 19 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 162 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 170 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 172 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 173 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 174 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 180 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 183 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 185 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 196 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 198 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 199 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 208 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 210 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 211 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 217 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 226 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 238 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 240 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 243 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 256 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 259 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 260 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 270 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 277 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 293 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 296 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 297 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 303 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 326 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 364 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 368 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 369 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 375 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 376 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 402 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 423 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 433 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 444 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 447 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 448 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 454 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 455 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 462 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 502 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 529 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 533 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 534 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 540 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 541 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 581 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 613 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 617 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 619 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 628 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 643 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 659 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 662 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 663 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 665 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 676 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 678 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 703 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 747 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 748 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 749 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 751 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 787 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 790 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 791 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 813 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 820 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 848 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 866 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 870 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 871 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 877 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 896 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 922 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 931 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 956 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1011 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1051 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1055 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1058 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1085 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1087 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1107 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1122 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1126 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1128 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1135 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1156 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1164 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1188 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1204 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1206 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1208 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1210 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1244 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1247 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1253 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1254 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1255 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1266 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1282 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1327 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1365 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1368 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1370 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1381 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1386 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1433 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 65 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 79 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 83 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 122 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 125 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 134 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 138 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 152 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 205 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 207 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 213 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 217 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 221 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 226 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 247 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 265 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 275 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 280 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 289 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 296 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 325 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 330 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 332 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 333 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 334 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 366 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 389 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 394 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 396 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 397 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 418 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 432 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 437 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 441 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 448 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 491 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 496 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 499 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 508 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 536 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 541 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 542 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 543 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 561 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 577 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 588 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 620 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 627 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 645 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 659 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 670 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 675 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 677 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 678 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 698 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 708 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 713 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 715 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 716 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 735 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 749 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 754 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 758 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 779 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 783 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 787 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 793 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 798 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 801 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 810 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 811 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 824 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 832 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 837 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 841 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 848 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 859 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 868 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 877 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 880 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 885 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 887 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 893 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 907 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 912 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 917 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 928 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 937 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 944 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 956 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 961 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 963 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 971 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 976 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 980 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 986 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 990 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 995 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 999 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1010 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1017 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1019 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1022 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1029 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1033 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1039 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1042 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1043 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1052 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1068 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1082 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1121 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1124 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1125 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1134 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1144 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1168 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1169 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1170 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1181 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1185 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1194 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1222 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1223 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1227 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1234 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1236 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1244 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 24 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 29 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 30 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 151 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 152 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 165 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 166 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 171 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 273 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 275 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 275 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 279 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 289 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 349 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 355 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 359 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 362 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 371 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 377 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 379 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 384 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 388 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 391 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 410 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 411 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 412 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 413 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 414 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 415 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 415 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 419 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 421 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 425 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 442 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 446 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 449 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 455 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 465 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 467 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 476 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 488 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 489 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 498 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 504 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 515 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 516 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 521 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 529 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 535 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 545 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 546 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 555 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 567 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 599 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 600 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 604 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 607 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 608 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 610 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 624 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 634 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 640 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 640 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 653 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 666 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 682 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 683 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 687 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 689 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 691 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 707 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 709 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 718 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 719 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 722 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 727 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 730 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 737 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 747 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 749 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 760 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 763 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 767 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 770 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 772 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 773 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 774 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 775 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 787 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 795 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 873 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 891 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 904 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 911 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 25 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 27 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 32 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 13 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 15 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 18 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 32 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 36 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 38 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 52 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-transaction.test.mjs | 61 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 12 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 13 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 15 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 18 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 19 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 37 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 60 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 61 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 63 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 66 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 87 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 89 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 100 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 117 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 118 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 120 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 124 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 126 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-controller.test.mjs | 288 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 23 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 24 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 89 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 98 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 106 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 111 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 300 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 301 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 302 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 304 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 306 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 313 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 318 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 324 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 362 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 364 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 475 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 48 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 121 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 197 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 211 | profileDir |
| profile-home | apps/dsh-desktop/test/session-preservation.test.mjs | 23 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 37 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 38 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 57 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 63 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 77 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 77 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 107 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 114 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 141 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 141 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 173 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 181 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 192 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 192 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 196 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 204 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 292 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 292 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 302 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 306 | profileDir |
| profile-home | packages/dsh-desktop-compat/src/skin-state.ts | 136 | DSH_HOME |
| profile-home | packages/dsh-desktop-compat/src/skin-state.ts | 136 | DSH_PROFILE |
| profile-home | packages/dsh-desktop-compat/src/skin-state.ts | 141 | profileDir |
| profile-home | packages/dsh-desktop-compat/src/skin-state.ts | 142 | profileDir |
| profile-home | packages/dsh-desktop-compat/src/skin-state.ts | 146 | profileDir |
| profile-home | packages/dsh-desktop-compat/src/skin-state.ts | 166 | profileDir |
| profile-home | packages/dsh-desktop-compat/tests/skin-state.spec.ts | 20 | profileDir |
| profile-home | packages/dsh-desktop-compat/tests/skin-state.spec.ts | 21 | profileDir |
| profile-home | packages/dsh-desktop-compat/tests/skin-state.spec.ts | 22 | profileDir |
| profile-home | packages/dsh-desktop-compat/tests/skin-state.spec.ts | 27 | profileDir |
| profile-home | packages/dsh-desktop-compat/tests/skin-state.spec.ts | 33 | profileDir |
| profile-home | packages/dsh-git-graph/src/host/worktree-service.ts | 214 | DSH_HOME |
| profile-home | packages/dsh-git-graph/src/index.ts | 82 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/dsh-home.ts | 3 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/dsh-home.ts | 20 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/dsh-home.ts | 25 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 7 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 27 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 33 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 36 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 42 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 48 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 51 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 57 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.test.ts | 63 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.ts | 53 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.ts | 56 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.test.ts | 7 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.test.ts | 12 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.test.ts | 14 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.test.ts | 19 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.test.ts | 23 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.test.ts | 25 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.test.ts | 31 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.ts | 3 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.ts | 20 | DSH_HOME |
| profile-home | packages/dsh-pet/src/dsh-home.ts | 25 | DSH_HOME |
| profile-home | packages/dsh-pet/src/persist.ts | 3 | DSH_HOME |
| profile-home | packages/dsh-pet/src/persist.ts | 64 | DSH_HOME |
| profile-home | packages/dsh-pet/src/persist.ts | 65 | DSH_HOME |
| profile-home | packages/dsh-pet/src/service.ts | 50 | DSH_HOME |
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 275 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 275 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 209 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 237 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 379 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 416 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 46 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 47 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 52 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 58 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 194 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 195 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 199 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 237 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 243 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 244 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 248 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 302 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 312 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 324 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 338 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 354 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 369 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 389 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 401 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 410 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 425 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 439 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 457 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/update.spec.ts | 475 | profileDir |
| profile-home | packages/dsh-task-board/src/index.ts | 75 | DSH_PROFILE |
| profile-home | packages/dsh-task-board/src/index.ts | 82 | DSH_PROFILE |
| profile-home | packages/dsh-task-board/src/index.ts | 97 | DSH_PROFILE |
| profile-home | packages/dsh-task-board/src/index.ts | 98 | DSH_HOME |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 580 | DSH_HOME |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 589 | DSH_HOME |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 597 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 616 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 639 | DSH_HOME |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 645 | profileDir |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 647 | profileDir |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 649 | profileDir |
| profile-home | packages/skins/skin-center/src/skin-switch.ts | 650 | profileDir |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 290 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 291 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 294 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 306 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 308 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 312 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 317 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 321 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 334 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 347 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 352 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 356 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 376 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 386 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 386 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 391 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 409 | profileDir |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 410 | profileDir |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 412 | profileDir |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 414 | DSH_PROFILE |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 414 | DSH_HOME |
| profile-home | packages/skins/skin-center/tests/skin-switch.spec.ts | 416 | profileDir |
| profile-home | scripts/audit-dsh-coupling.mjs | 33 | ensureDesktopProfile |
| profile-home | scripts/audit-dsh-coupling.mjs | 33 | resolveRuntimePackages |
| profile-home | scripts/audit-dsh-coupling.mjs | 33 | resolveDshCliPath |
| profile-home | scripts/audit-dsh-coupling.mjs | 33 | DSH_HOME |
| profile-home | scripts/audit-dsh-coupling.mjs | 33 | DSH_PROFILE |
| profile-home | scripts/audit-dsh-coupling.mjs | 33 | profileDir |
| profile-home | scripts/audit-dsh-coupling.mjs | 33 | runtimeHome |
| profile-home | scripts/dsh-skin.test.mjs | 21 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 68 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 75 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 87 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 102 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 120 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 126 | DSH_HOME |
| profile-home | shared/host/dsh-home.ts | 2 | DSH_HOME |
| profile-home | shared/host/dsh-home.ts | 19 | DSH_HOME |
| profile-home | shared/host/dsh-home.ts | 24 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 19 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 20 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 21 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 25 | DSH_HOME |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 775 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1140 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1827 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1829 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 153 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 165 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 172 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 215 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 220 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 227 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 246 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 251 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 258 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 286 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 293 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 302 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 346 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 353 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 380 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 513 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 515 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 567 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 574 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 594 | start |
| runtime-lifecycle | apps/dsh-desktop/src/menu.mjs | 58 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 915 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 923 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1033 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1044 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1053 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1066 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1086 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1095 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1109 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1146 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1152 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1162 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1172 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1178 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1183 | start |
| runtime-lifecycle | apps/dsh-desktop/src/repair-runtime-controller.mjs | 90 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/repair-runtime-controller.mjs | 123 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 169 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 173 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 180 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 186 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 187 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 188 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 25 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 69 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 282 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 305 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 327 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 368 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 410 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 416 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 418 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 426 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 443 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 481 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 529 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 562 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 570 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 591 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 601 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 620 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 642 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 668 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 672 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 673 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 685 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 715 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 720 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 721 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 763 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 769 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 770 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 771 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 787 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 817 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 855 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 330 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 370 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 473 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 482 | start |
| runtime-lifecycle | apps/dsh-desktop/test/updater.test.mjs | 71 | start |
| runtime-lifecycle | packages/dsh-particle-theme/src/client/index.ts | 70 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 35 | start |
| runtime-lifecycle | packages/dsh-task-board/src/client/index.ts | 186 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller-use-cases.spec.ts | 170 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 66 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 249 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 347 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 373 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 438 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 479 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 521 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 694 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller.spec.ts | 821 | start |
| session | packages/dsh-live-stats/tests/projection.spec.ts | 28 | create |
| session | packages/dsh-remote-web-ui/src/mobile-api.ts | 245 | list |
| session | packages/dsh-remote-web-ui/src/mobile-api.ts | 286 | create |
| session | packages/dsh-remote-web-ui/src/mobile-api.ts | 289 | prompt |
| session | packages/dsh-remote-web-ui/src/mobile/views/SessionListView.tsx | 9 | create |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 286 | subscribe |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 288 | prompt |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 388 | subscribe |
| session | packages/dsh-tool-describe-image/src/client/send-hook.ts | 81 | prompt |
| session | scripts/dsh-candidate-execution.mjs | 91 | get |
| session | scripts/dsh-candidate-execution.mjs | 160 | subscribe |
| session | scripts/dsh-candidate-execution.mjs | 161 | prompt |
| slot | packages/dsh-aionui-panel/src/client/index.ts | 67 | conversation.input.dock |
| slot | packages/dsh-git-graph/src/client/index.ts | 202 | conversation.input.selector.context |
| slot | packages/dsh-git-graph/src/client/index.ts | 211 | conversation.input.dock |
| slot | packages/dsh-live-stats/src/client/index.ts | 76 | web-ui.plugin.item |
| slot | packages/dsh-live-stats/src/client/index.ts | 88 | conversation.composer.dock |
| slot | packages/dsh-mode-switcher/src/client/index.ts | 20 | conversation.session.header.actions |
| slot | packages/dsh-particle-theme/src/client/index.ts | 75 | web-ui.plugin.item |
| slot | packages/dsh-pet/src/client/index.ts | 128 | web-ui.plugin.item |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 117 | sidebar.remote |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 139 | sidebar.footer.action |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 160 | web-ui.plugin.item |
| slot | packages/dsh-task-board/src/client/index.ts | 110 | web-ui.plugin.item |
| slot | packages/dsh-tool-describe-image/src/client/index.ts | 92 | web-ui.plugin.item |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 57 | settings.section |
| slot | packages/skins/skin-center/src/client/index.ts | 101 | web-ui.plugin.item |
| workspace | gallery/bundles.js | 7 | list |
| workspace | gallery/bundles.js | 13 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile-api.ts | 285 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.tsx | 4 | list |
| workspace | packages/skins/ths/src/client/index.ts | 175 | list |
| workspace | packages/skins/trading/src/client/index.ts | 328 | list |

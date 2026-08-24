# Desktop 2.5 DSH coupling audit

Authoritative Desktop version: 3.0.4.

Stable DSH package version: 0.1.1-rc.1.

Lockfile SHA-256: `3bf52346b14c04b3ad6a6b03eddf248dd5d59575c05965dcb69a744d2c28add6`.

Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.

## Classification summary

| Classification | Count |
| --- | ---: |
| public-stable | 155 |
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
| packages/dsh-web-ui-settings/src/chatgpt-auth-routes.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 1 | static-import | @deepseek-ai/dsh-authorization | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 7 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | yes |
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
| host-service | packages/dsh-web-ui-settings/src/client/index.ts | 62 | web-ui-plugins |
| host-service | packages/skins/skin-center/src/client/index.ts | 63 | remote |
| profile-home | apps/dsh-desktop/scripts/capture-startup.mjs | 39 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 110 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 112 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 146 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 148 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 150 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 152 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 155 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 179 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 219 | profileDir |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 35 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 38 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 43 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 44 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 50 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-startup-fps.mjs | 23 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/packaged-smoke-runner.mjs | 61 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/preset-deep-link-runner.mjs | 63 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-skills.mjs | 27 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-directory-picker.mjs | 53 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-discovery-surfaces.mjs | 60 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 57 | profileDir |
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
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 73 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 74 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 75 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 137 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 138 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 519 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 912 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 926 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 938 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 939 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 939 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 945 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 957 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 957 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 991 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1099 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1099 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1104 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1104 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1109 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1109 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1181 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1242 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1242 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1330 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1759 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1791 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1855 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1855 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1861 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1861 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 92 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 95 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 247 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 248 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 260 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 263 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 275 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 276 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 357 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 358 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 361 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 363 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 364 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 437 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 441 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 461 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 471 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 471 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 497 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 497 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 520 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 539 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 554 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 584 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 585 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 590 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 603 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 624 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 640 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 656 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 660 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 785 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 786 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 812 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 813 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 816 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 823 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 827 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 884 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 885 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 888 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 894 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 903 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 911 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 971 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 976 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 998 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1008 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1014 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1020 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1024 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1031 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1067 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1068 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1077 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1086 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1103 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1155 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1158 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1168 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1215 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1222 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1240 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1250 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1278 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1301 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1307 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 83 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/src/legacy-credential-compat.mjs | 10 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/legacy-credential-compat.mjs | 11 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 241 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 248 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 248 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 395 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 396 | profileDir |
| profile-home | apps/dsh-desktop/src/plugin-recovery.mjs | 522 | profileDir |
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
| profile-home | apps/dsh-desktop/src/profile.mjs | 672 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 699 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 865 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 870 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 932 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 934 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 959 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/profile.mjs | 961 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 984 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 985 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 986 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 987 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1014 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1015 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1033 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1058 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1076 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1088 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1102 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1153 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1202 | resolveDshCliPath |
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
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 679 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 680 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 680 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 681 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 681 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 682 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 683 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 684 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 685 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 687 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 688 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 712 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 713 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 715 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 839 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 957 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 958 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1010 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1029 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1044 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1088 | profileDir |
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
| profile-home | apps/dsh-desktop/test/legacy-credential-compat.test.mjs | 120 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/migration-runtime-environment.test.mjs | 33 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs | 36 | profileDir |
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
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1208 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1210 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1212 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1214 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1248 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1251 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1257 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1258 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1259 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1270 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1286 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1331 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1369 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1372 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1374 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1385 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1390 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1437 | profileDir |
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
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1122 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1123 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1129 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1138 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1161 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1186 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1190 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1191 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1197 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1199 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1224 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1227 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1228 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1237 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1247 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1271 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1272 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1273 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1284 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1288 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1297 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1325 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1326 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1330 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1337 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1339 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1347 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 25 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 30 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 31 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 152 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 153 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 166 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 167 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 170 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 172 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 289 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 291 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 291 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 295 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 365 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 371 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 375 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 378 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 387 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 393 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 395 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 400 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 404 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 407 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 426 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 427 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 428 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 429 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 430 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 431 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 431 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 435 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 437 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 441 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 458 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 462 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 465 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 471 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 481 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 485 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 493 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 500 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 507 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 517 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 519 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 528 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 540 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 541 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 550 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 556 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 567 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 568 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 573 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 581 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 587 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 597 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 598 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 607 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 619 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 651 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 652 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 656 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 659 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 660 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 662 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 676 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 686 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 692 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 692 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 705 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 718 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 734 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 735 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 739 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 741 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 743 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 759 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 761 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 770 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 771 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 774 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 779 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 782 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 789 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 799 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 801 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 812 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 815 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 819 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 822 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 824 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 825 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 826 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 827 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 839 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 847 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 925 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 943 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 956 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 963 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 24 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 25 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 90 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 107 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 112 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 309 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 310 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 311 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 313 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 315 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 322 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 327 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 333 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 371 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 373 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 484 | resolveDshCliPath |
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
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 140 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 140 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 159 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 159 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 187 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 187 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 191 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 199 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 210 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 210 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 214 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 222 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 247 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 247 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 310 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 310 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 320 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 324 | profileDir |
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
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 888 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1244 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1985 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1987 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 169 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 181 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 188 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 231 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 236 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 243 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 262 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 267 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 274 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 302 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 309 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 318 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 362 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 369 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 396 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 529 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 531 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 583 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 590 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 610 | start |
| runtime-lifecycle | apps/dsh-desktop/src/menu.mjs | 58 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 916 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 924 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1034 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1045 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1054 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1067 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1087 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1096 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1110 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1147 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1153 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1163 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1173 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1179 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1184 | start |
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
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 339 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 379 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 482 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 491 | start |
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
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 77 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 85 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 97 | sidebar.footer.action |
| slot | packages/skins/skin-center/src/client/index.ts | 101 | web-ui.plugin.item |
| workspace | gallery/bundles.js | 7 | list |
| workspace | gallery/bundles.js | 13 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile-api.ts | 285 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.tsx | 4 | list |
| workspace | packages/skins/ths/src/client/index.ts | 175 | list |
| workspace | packages/skins/trading/src/client/index.ts | 328 | list |

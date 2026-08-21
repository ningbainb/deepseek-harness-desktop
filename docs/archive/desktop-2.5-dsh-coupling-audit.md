# Desktop 2.5 DSH coupling audit

Authoritative Desktop version: 3.0.0.

Stable DSH package version: 0.1.1-rc.1.

Lockfile SHA-256: `4cc9d609514f88ae5ac585be1a0e2da57b7add629122a1ffa8afd403211fa751`.

Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.

## Classification summary

| Classification | Count |
| --- | ---: |
| public-stable | 144 |
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
| host-service | apps/dsh-desktop/src/runtime-provider.mjs | 230 | host-service.register |
| host-service | apps/dsh-desktop/test/runtime-provider.test.mjs | 152 | task-board |
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
| host-service | packages/dsh-particle-theme/src/client/index.ts | 29 | object |
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
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 35 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 38 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 43 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 44 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 50 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-startup-fps.mjs | 23 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs | 116 | profileDir |
| profile-home | apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs | 120 | profileDir |
| profile-home | apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs | 143 | profileDir |
| profile-home | apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs | 154 | profileDir |
| profile-home | apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs | 157 | profileDir |
| profile-home | apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs | 193 | profileDir |
| profile-home | apps/dsh-desktop/scripts/packaged-smoke-runner.mjs | 57 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/preset-deep-link-runner.mjs | 63 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-skills.mjs | 27 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-directory-picker.mjs | 52 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-particle-theme.mjs | 25 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 39 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 49 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 58 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 87 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 93 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 118 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 124 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 153 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 158 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 210 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 216 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 220 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-profile-migration.mjs | 263 | profileDir |
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
| profile-home | apps/dsh-desktop/scripts/verify-terminal.mjs | 100 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 71 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 134 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-window-chrome.mjs | 43 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 85 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 86 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 87 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 149 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 150 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 431 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 888 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1342 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1379 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1425 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1697 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1850 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1863 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1922 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1926 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1947 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1950 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1950 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2014 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2038 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2038 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2073 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2204 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2204 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2209 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2209 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2224 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2224 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2664 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2664 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2811 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 92 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 95 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 202 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 214 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 217 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 230 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 311 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 312 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 315 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 317 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 318 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 391 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 395 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 415 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 426 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 426 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 454 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 454 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 477 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 491 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 492 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 497 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 510 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 531 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 533 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 547 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 563 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 567 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 719 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 720 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 746 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 747 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 750 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 761 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 765 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 822 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 823 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 826 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 832 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 845 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 853 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 913 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 918 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 940 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 950 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 956 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 962 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 966 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 973 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1010 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1011 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1013 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1022 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1036 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1088 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1091 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1101 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1148 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1155 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1181 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1191 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1219 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1242 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1248 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 83 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-profile-clone.mjs | 38 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/free-mode-profile-clone.mjs | 209 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-profile-clone.mjs | 215 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-profile-clone.mjs | 376 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/free-mode-runtime-service.mjs | 135 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-session.mjs | 539 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/free-mode-session.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-session.mjs | 627 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-session.mjs | 685 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-session.mjs | 685 | profileDir |
| profile-home | apps/dsh-desktop/src/free-mode-session.mjs | 729 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 48 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 677 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 690 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 690 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 691 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 694 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 695 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 696 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 703 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 709 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 710 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 781 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 806 | profileDir |
| profile-home | apps/dsh-desktop/src/migration-assistant.mjs | 1233 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/src/profile.mjs | 632 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 659 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 825 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 830 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 893 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 895 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 920 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/profile.mjs | 922 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 928 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 929 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 930 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 931 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 956 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 957 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 973 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 995 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1013 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1025 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1039 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1090 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1139 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 419 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 420 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 193 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 197 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 198 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 199 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 36 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 378 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 379 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 418 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 421 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 426 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 427 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 445 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 447 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 624 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 627 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 628 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 629 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 630 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 632 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 633 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 657 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 658 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 660 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 784 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 901 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 902 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 954 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 973 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 988 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1032 | profileDir |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 8 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 8 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 16 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 18 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 61 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 63 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/free-mode-electron-integration.test.mjs | 214 | profileDir |
| profile-home | apps/dsh-desktop/test/free-mode-runtime-service.test.mjs | 49 | profileDir |
| profile-home | apps/dsh-desktop/test/free-mode-session.test.mjs | 83 | profileDir |
| profile-home | apps/dsh-desktop/test/free-mode-session.test.mjs | 102 | profileDir |
| profile-home | apps/dsh-desktop/test/free-mode-session.test.mjs | 102 | profileDir |
| profile-home | apps/dsh-desktop/test/free-mode-session.test.mjs | 107 | profileDir |
| profile-home | apps/dsh-desktop/test/free-mode-session.test.mjs | 133 | profileDir |
| profile-home | apps/dsh-desktop/test/free-mode-session.test.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 39 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 42 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 43 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 60 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 68 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 100 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 103 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 105 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 113 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 245 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 251 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 252 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 257 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 439 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 603 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 603 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 697 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-assistant.test.mjs | 697 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-bridge.test.mjs | 9 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/migration-runtime-bridge.test.mjs | 9 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/migration-runtime-bridge.test.mjs | 32 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/migration-runtime-bridge.test.mjs | 50 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/migration-runtime-bridge.test.mjs | 92 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 21 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 21 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 83 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 88 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 110 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 118 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 140 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 159 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 159 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 268 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 280 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 290 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 290 | profileDir |
| profile-home | apps/dsh-desktop/test/migration-runtime-matrix.test.mjs | 291 | profileDir |
| profile-home | apps/dsh-desktop/test/packaged-migration-matrix.test.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/test/packaged-migration-matrix.test.mjs | 44 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 19 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 124 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 131 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 132 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 134 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 135 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 136 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 142 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 145 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 147 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 158 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 160 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 170 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 172 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 173 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 179 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 188 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 202 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 205 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 218 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 221 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 222 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 232 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 239 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 255 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 258 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 259 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 265 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 267 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 288 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 326 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 330 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 331 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 337 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 338 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 364 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 385 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 395 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 406 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 409 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 410 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 416 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 417 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 424 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 464 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 491 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 495 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 496 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 502 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 503 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 543 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 575 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 579 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 581 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 588 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 590 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 605 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 621 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 624 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 627 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 638 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 640 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 665 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 709 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 710 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 711 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 713 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 749 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 752 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 753 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 775 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 782 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 810 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 828 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 832 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 833 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 839 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 858 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 884 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 893 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 918 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 973 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1013 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1017 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1020 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1047 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1049 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1069 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1084 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1088 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1090 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1097 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1118 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1126 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1146 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1162 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1164 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1166 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1168 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1202 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1205 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1211 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1212 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1213 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1224 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1240 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1285 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1323 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1326 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1328 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1339 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1344 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1391 | profileDir |
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
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 327 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 332 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 334 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 335 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 336 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 368 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 391 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 396 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 398 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 399 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 420 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 434 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 439 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 443 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 450 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 493 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 498 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 501 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 509 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 535 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 540 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 541 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 542 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 560 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 576 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 587 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 619 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 624 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 644 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 658 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 669 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 674 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 676 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 677 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 697 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 707 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 712 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 714 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 715 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 734 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 748 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 753 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 757 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 778 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 782 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 786 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 792 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 797 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 801 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 808 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 819 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 828 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 837 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 840 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 845 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 847 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 853 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 867 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 872 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 877 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 888 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 897 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 904 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 916 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 921 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 923 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 931 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 936 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 940 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 946 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 950 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 955 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 959 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 970 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 977 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 979 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 982 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 989 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 993 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 999 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1002 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1003 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1012 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1025 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1039 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1071 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1074 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1075 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1084 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1094 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1118 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1119 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1120 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1131 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1135 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1144 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1162 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1171 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1187 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1188 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1192 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1199 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1201 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1208 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 24 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 29 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 30 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 163 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 165 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 165 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 179 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 239 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 245 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 252 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 261 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 267 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 269 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 274 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 278 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 281 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 300 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 301 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 302 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 303 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 304 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 309 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 311 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 315 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 332 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 336 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 339 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 345 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 355 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 357 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 366 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 378 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 379 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 388 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 394 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 405 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 406 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 411 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 419 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 425 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 435 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 436 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 445 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 457 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 489 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 490 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 494 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 497 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 498 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 500 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 514 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 524 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 530 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 530 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 543 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 556 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 572 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 573 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 577 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 579 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 581 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 597 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 599 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 608 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 609 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 612 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 617 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 620 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 627 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 637 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 639 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 650 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 653 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 657 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 660 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 662 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 663 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 664 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 665 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 677 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 685 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 763 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 781 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 794 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 801 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 25 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 27 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 32 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-controller.test.mjs | 288 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 24 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 25 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 91 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 100 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 108 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 113 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 273 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 275 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 277 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 284 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 287 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 293 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 299 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 299 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 302 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 314 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 317 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 318 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 324 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 327 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 333 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 334 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 340 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 341 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 367 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 372 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 424 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 427 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 438 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 446 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 454 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 481 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 484 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 491 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 499 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 507 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 538 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 539 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 540 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 542 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 544 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 551 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 556 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 562 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 600 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 602 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 713 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 47 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 114 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 120 | profileDir |
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
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1533 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1821 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2336 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2418 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2583 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2609 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2616 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2666 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 3272 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 3288 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 3290 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 154 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 166 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 173 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 221 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 226 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 233 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 252 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 257 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 264 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 292 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 299 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 308 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 352 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 359 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 386 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 519 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 521 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 573 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 580 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 600 | start |
| runtime-lifecycle | apps/dsh-desktop/src/ipc.mjs | 306 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/ipc.mjs | 308 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/ipc.mjs | 310 | start |
| runtime-lifecycle | apps/dsh-desktop/src/menu.mjs | 59 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 910 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 918 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1028 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1039 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1048 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1061 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1083 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1088 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1098 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1111 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1120 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1134 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1155 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1161 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1171 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1181 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1187 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1192 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 168 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 172 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 177 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 178 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 179 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 25 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 69 | start |
| runtime-lifecycle | apps/dsh-desktop/test/migration-runtime-bridge.test.mjs | 41 | start |
| runtime-lifecycle | apps/dsh-desktop/test/migration-runtime-bridge.test.mjs | 86 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 282 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 305 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 344 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 386 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 392 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 394 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 402 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 419 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 457 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 505 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 538 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 546 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 567 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 577 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 596 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 618 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 644 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 648 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 649 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 661 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 691 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 696 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 697 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 739 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 745 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 746 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 747 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 763 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 793 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 831 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 568 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 608 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 711 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 720 | start |
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
| session | apps/dsh-desktop/src/free-mode-plugin-approval.mjs | 150 | get |
| session | apps/dsh-desktop/src/free-mode-plugin-approval.mjs | 243 | get |
| session | apps/dsh-desktop/src/free-mode-plugin-approval.mjs | 259 | get |
| session | apps/dsh-desktop/src/free-mode-plugin-approval.mjs | 296 | get |
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

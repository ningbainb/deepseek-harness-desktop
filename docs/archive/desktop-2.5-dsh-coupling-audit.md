# Desktop 2.5 DSH coupling audit

Authoritative Desktop version: 4.2.1.

Stable DSH package version: 0.1.6-alpha.2.

Lockfile SHA-256: `c54bad458a28fe4a69b6fb34982580885a2026b5f1ad9db1b99247029ecc9e73`.

Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.

## Classification summary

| Classification | Count |
| --- | ---: |
| public-stable | 293 |
| public-experimental | 165 |
| compatibility-patch | 37 |
| private-high-risk | 0 |

## Direct imports, dynamic imports, and requires

| File | Line | Kind | Specifier | Type-only | Classification | Controlled |
| --- | ---: | --- | --- | --- | --- | --- |
| apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 10 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 10 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 16 | static-import | @deepseek-ai/dsh-cmdline | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 17 | static-import | @deepseek-ai/dsh-http-proxy | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 18 | static-import | @deepseek-ai/dsh-launch-environment | no | public-stable | no |
| apps/dsh-desktop/test/conversation-import/session-bridge-transaction.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/conversation-import/transcript-protocol-events.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 1 | static-import | @deepseek-ai/dsh-command-compact | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 6 | static-import | @deepseek-ai/dsh-compaction-basic | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 7 | static-import | @deepseek-ai/dsh-compaction | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 13 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 19 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 20 | static-import | @deepseek-ai/dsh-session-projection | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 21 | static-import | @deepseek-ai/dsh-token-meter | no | public-stable | no |
| packages/dsh-aionui-panel/src/client/drag/DragFileInlay.tsx | 15 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-aionui-panel/src/client/drag/DragFileInlay.tsx | 17 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-session/types | yes | public-stable | no |
| packages/dsh-aionui-panel/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-aionui-panel/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/index.ts | 23 | static-import | @deepseek-ai/dsh-client-ui-sidebar-right/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/native-browser.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-aionui-panel/src/client/native-browser.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-sidebar-right/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/native-panels.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-aionui-panel/src/client/native-panels.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-sidebar-right/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/native-preview.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-sidebar-right/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/session-selection.ts | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/session-selection.ts | 2 | static-import | @deepseek-ai/dsh-session/types | yes | public-stable | no |
| packages/dsh-aionui-panel/src/host/gate.ts | 10 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-aionui-panel/src/host/git-service.ts | 11 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-aionui-panel/src/host/git-service.ts | 15 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-aionui-panel/src/host/routes.ts | 9 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 17 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 19 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 20 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-aionui-panel/src/index.ts | 21 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-chat-artifacts/src/client/ArtifactCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-chat-artifacts/src/client/ArtifactCard.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-tool/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 9 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-tool/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/index.ts | 12 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-chat-artifacts/src/index.ts | 15 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-chat-artifacts/src/index.ts | 16 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-chat-artifacts/tests/tool.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-chat-artifacts/tests/tool.spec.ts | 5 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-chat-artifacts/tests/tool.spec.ts | 6 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 11 | static-import | @deepseek-ai/dsh-agent | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 13 | static-import | @deepseek-ai/dsh-agent-default-model | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 14 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 15 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 16 | static-import | @deepseek-ai/dsh-session-persistence | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 17 | static-import | @deepseek-ai/dsh-session-query | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 18 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/control-tool-approval.ts | 1 | static-import | @deepseek-ai/dsh-tools | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/conversation-import-route.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/conversation-import-route.ts | 9 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/conversation-import-route.ts | 10 | static-import | @deepseek-ai/dsh-session | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/conversation-import-route.ts | 11 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
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
| packages/dsh-desktop-compat/src/session-recovery.ts | 1 | static-import | @deepseek-ai/dsh-session-format-catalog | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/session-recovery.ts | 3 | static-import | @deepseek-ai/dsh-session-persistence | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 3 | static-import | @deepseek-ai/dsh-llm/brand | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 4 | static-import | @deepseek-ai/dsh-tools | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/transcript-balance.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 9 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 5 | static-import | @deepseek-ai/dsh-session | yes | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 6 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/legacy-subagent-recovery.spec.ts | 1 | static-import | @deepseek-ai/dsh-session-format-catalog | no | compatibility-patch | no |
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
| packages/dsh-git-graph/src/client/index.ts | 31 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-git-graph/src/client/index.ts | 33 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-git-graph/src/client/index.ts | 37 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-git-graph/src/client/index.ts | 38 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-git-graph/src/client/index.ts | 39 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-git-graph/src/host/git-service.ts | 10 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-git-graph/src/host/git-service.ts | 14 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-git-graph/src/host/routes.ts | 9 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-git-graph/src/index.ts | 12 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-git-graph/src/index.ts | 17 | static-import | @deepseek-ai/dsh-subprocess | yes | public-stable | no |
| packages/dsh-git-graph/src/index.ts | 18 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-git-graph/src/invariant.ts | 9 | static-import | @deepseek-ai/dsh-invariants | yes | public-stable | no |
| packages/dsh-git-graph/tests/client.spec.tsx | 11 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-liangshen/src/index.ts | 17 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-liangshen/tests/tool-bootstrap.test.ts | 1 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-live-stats/src/balance-service.ts | 11 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-live-stats/src/balance-service.ts | 14 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-live-stats/src/client/LiveStatsSettingsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-live-stats/src/client/LiveStatsSettingsCard.tsx | 8 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-live-stats/src/client/LiveStatsSettingsCard.tsx | 9 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 3 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-live-stats/src/client/TpsLine.tsx | 5 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/balance-selection.ts | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/balance-selection.ts | 2 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-live-stats/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/estimator.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/src/estimator.ts | 2 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 3 | static-import | @deepseek-ai/dsh-session-projection | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 5 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-live-stats/src/invariant.ts | 7 | static-import | @deepseek-ai/dsh-invariants | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 1 | static-import | @deepseek-ai/dsh-session-projection/types | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 6 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 7 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 8 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 9 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 10 | static-import | @deepseek-ai/dsh-session-projection | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 11 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/projection.ts | 12 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/projection.ts | 24 | static-export | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/routes.ts | 8 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-live-stats/tests/estimator.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 8 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 9 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 10 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 11 | static-import | @deepseek-ai/dsh-session-projection | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 12 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 13 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-live-stats/tests/routes.spec.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-live-stats/tests/tps-line.spec.tsx | 3 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemoryActivityPanel.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-memory/src/core/query.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 3 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
| packages/dsh-memory/src/index.ts | 4 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 5 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 6 | static-import | @deepseek-ai/dsh-session-query | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 7 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 8 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 11 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 12 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-memory/src/routes.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-memory/src/store.ts | 1 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-memory/src/store.ts | 4 | static-import | @deepseek-ai/dsh-atomic-write | no | public-stable | no |
| packages/dsh-memory/src/tools.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-memory/src/tools.ts | 2 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-memory/src/tools.ts | 3 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-memory/tests/lock-acquisition.spec.ts | 1 | static-import | @deepseek-ai/dsh-atomic-write | no | public-stable | no |
| packages/dsh-mode-switcher/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-mode-switcher/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/runtime-adapter.ts | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/runtime-adapter.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/runtime-adapter.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 21 | dynamic-import | @deepseek-ai/dsh-client-ui-settings/client | no | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-settings-models/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 5 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 8 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 10 | static-import | @deepseek-ai/dsh-typert-protocol | yes | public-stable | no |
| packages/dsh-model-preferences/src/core/config.ts | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/core/config.ts | 6 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-model-preferences/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-model-preferences/tests/projection.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/controller.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-particle-theme/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-particle-theme/tests/controller.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/tests/settings-card.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/PersonalPromptCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/PersonalPromptCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 3 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 4 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 5 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 6 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-personal-prompt/tests/host-plugin.spec.ts | 1 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
| packages/dsh-personal-prompt/tests/official-assembly.spec.ts | 1 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-personal-prompt/tests/official-assembly.spec.ts | 4 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
| packages/dsh-personal-prompt/tests/official-assembly.spec.ts | 5 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-pet/src/client/PetDockEntry.tsx | 12 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/PetSettingsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/PetSettingsCard.tsx | 8 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-pet/src/client/PetSettingsCard.tsx | 9 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/WhalePet.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/pet-store.ts | 9 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-pet/src/client/pet-store.ts | 10 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-pet/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-pet/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-pet/src/event-projection.ts | 9 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-pet/src/event-projection.ts | 10 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | no |
| packages/dsh-pet/src/index.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-pet/src/index.ts | 12 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-pet/src/routes.ts | 10 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-pet/src/service.ts | 11 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | no |
| packages/dsh-pet/src/service.ts | 13 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-pet/tests/service-enabled.spec.ts | 1 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | no |
| packages/dsh-pet/tests/service-enabled.spec.ts | 7 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-pet/tests/service-enabled.spec.ts | 8 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/FooterRemoteEntry.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/PairFailedNotice.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteEntry.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteEntry.tsx | 13 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/RemoteEntry.tsx | 14 | static-import | @deepseek-ai/dsh-client-ui-session/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/RemoteEntry.tsx | 15 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/RemotePanel.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemotePanel.tsx | 12 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteSettingsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteSettingsCard.tsx | 8 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/RemoteSettingsCard.tsx | 9 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/UpdateEntry.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/UpdateEntry.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/UpdatePanel.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/client/UpdatePanel.tsx | 8 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/deep-link.ts | 13 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/deep-link.ts | 15 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/deep-link.ts | 16 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/deep-link.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-ui-sidebar/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 23 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 24 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/index.ts | 11 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/index.ts | 16 | static-import | @deepseek-ai/dsh-api-gateway | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/index.ts | 18 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/invariant.ts | 7 | static-import | @deepseek-ai/dsh-invariants | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-contract.ts | 3 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-contract.ts | 11 | static-import | @deepseek-ai/dsh-api-workspace-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 3 | static-import | @deepseek-ai/dsh-api-gateway | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 4 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 9 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 20 | static-import | @deepseek-ai/dsh-api-workspace-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-routes.ts | 11 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/routes.ts | 11 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/startup.ts | 12 | static-import | @deepseek-ai/dsh-cmdline | no | public-stable | no |
| packages/dsh-remote-web-ui/src/tunnel.ts | 15 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-remote-web-ui/src/update-routes.ts | 8 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-api.spec.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-isolation.spec.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-routes.spec.ts | 2 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/routes.spec.ts | 2 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-ssh/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-ssh/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-ssh/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
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
| packages/dsh-task-board/src/client/TaskBoardSettingsCard.tsx | 9 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-task-board/src/client/TaskBoardSettingsCard.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-session/types | yes | public-stable | no |
| packages/dsh-task-board/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-task-board/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 23 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/main-session.ts | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/main-session.ts | 2 | static-import | @deepseek-ai/dsh-client-ui-session/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/main-session.ts | 3 | static-import | @deepseek-ai/dsh-session/types | yes | public-stable | no |
| packages/dsh-task-board/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-task-board/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-task-board/src/host/routes.ts | 2 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-task-board/src/host/v3-routes.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-task-board/src/index.ts | 13 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-task-board/src/index.ts | 18 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-task-board/src/index.ts | 20 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/attach-routes.ts | 16 | static-import | @deepseek-ai/dsh-attachment | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/DescribeImageSettingsCard.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/DescribeImageSettingsCard.tsx | 12 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/DescribeImageSettingsCard.tsx | 13 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-tool-describe-image/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/config-resolve.ts | 10 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/config-resolve.ts | 13 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/config-resolve.ts | 14 | static-import | @deepseek-ai/dsh-launch-environment | no | public-stable | no |
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
| packages/dsh-user-scope/src/index.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-user-scope/src/index.ts | 4 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-user-scope/src/store.ts | 1 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-user-scope/src/store.ts | 4 | static-import | @deepseek-ai/dsh-atomic-write | no | public-stable | no |
| packages/dsh-user-scope/tests/lifecycle.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-user-scope/tests/lifecycle.spec.ts | 6 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-value-mode/src/client/ModelPicker.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-value-mode/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/model-catalog.ts | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/model-catalog.ts | 3 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/core/expert.ts | 1 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-value-mode/src/core/expert.ts | 3 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-value-mode/src/core/model-selection.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 15 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 16 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 17 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 18 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 19 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/tests/routing.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 15 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 18 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 19 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/chatgpt-auth-routes.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 1 | static-import | @deepseek-ai/dsh-authorization | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 7 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | yes |
| packages/dsh-web-ui-settings/src/client/DockSettingsPage.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/ProjectDialog.tsx | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/ProjectDialog.tsx | 4 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/ProjectDialog.tsx | 5 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/RelayOnboardingCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/WebUIPluginsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 21 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 22 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 23 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 24 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 25 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/index.ts | 13 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/index.ts | 18 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 11 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 13 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 14 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 15 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 7 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 12 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-web-ui-settings/tests/relay-routes.spec.ts | 1 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/relay-routes.spec.ts | 5 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/skins/skin-center/src/client/SkinCenter.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/skins/skin-center/src/client/SkinCenter.tsx | 13 | static-import | @deepseek-ai/dsh-client-ui-theme/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/background.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-theme/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/skins/skin-center/src/index.ts | 11 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/skins/skin-center/src/index.ts | 13 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/skins/skin-center/src/routes.ts | 21 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/skins/skin-center/tests/routes.spec.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/skins/ths/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/skins/trading/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/skins/trading/src/client/quotes.ts | 22 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| scripts/dsh-import-boundary.test.mjs | 86 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| scripts/dsh-import-boundary.test.mjs | 87 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| scripts/dsh-import-boundary.test.mjs | 88 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| shared/client/settings/settings-form.ts | 10 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| shared/client/settings/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| shared/tests/settings-form.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |

## Slot, Host service, Profile/Home, Workspace, Session, and Runtime lifecycle seams

| Category | File | Line | Operation or identity |
| --- | --- | ---: | --- |
| host-service | apps/dsh-desktop/scripts/history-host-probe.mjs | 66 | string |
| host-service | apps/dsh-desktop/src/runtime-provider.mjs | 283 | host-service.register |
| host-service | apps/dsh-desktop/test/runtime-provider.test.mjs | 176 | task-board |
| host-service | packages/dsh-aionui-panel/src/client/index.ts | 46 | locale |
| host-service | packages/dsh-aionui-panel/src/index.ts | 29 | subprocess |
| host-service | packages/dsh-chat-artifacts/src/client/index.ts | 28 | locale |
| host-service | packages/dsh-chat-artifacts/src/index.ts | 51 | tools |
| host-service | packages/dsh-desktop-compat/src/index.ts | 25 | sessions |
| host-service | packages/dsh-git-graph/src/client/index.ts | 83 | locale |
| host-service | packages/dsh-git-graph/src/index.ts | 27 | subprocess |
| host-service | packages/dsh-git-graph/src/invariant.ts | 17 | invariants |
| host-service | packages/dsh-liangshen/presets/liangshen/tool-bootstrap.mjs | 34 | tools |
| host-service | packages/dsh-live-stats/src/client/index.ts | 67 | remote |
| host-service | packages/dsh-live-stats/src/index.ts | 16 | live-stats |
| host-service | packages/dsh-live-stats/src/invariant.ts | 15 | invariants |
| host-service | packages/dsh-memory/src/client/index.ts | 33 | locale |
| host-service | packages/dsh-memory/src/index.ts | 32 | tools |
| host-service | packages/dsh-mode-switcher/src/client/index.ts | 11 | function |
| host-service | packages/dsh-model-preferences/src/client/index.ts | 64 | sessions |
| host-service | packages/dsh-model-preferences/src/index.ts | 11 | settings |
| host-service | packages/dsh-particle-theme/src/client/index.ts | 31 | object |
| host-service | packages/dsh-personal-prompt/src/client/index.ts | 35 | locale |
| host-service | packages/dsh-personal-prompt/src/index.ts | 25 | sessions |
| host-service | packages/dsh-pet/src/client/index.ts | 74 | remote |
| host-service | packages/dsh-remote-web-ui/src/client/index.ts | 98 | workspaces |
| host-service | packages/dsh-remote-web-ui/src/invariant.ts | 15 | invariants |
| host-service | packages/dsh-ssh/src/client/index.ts | 36 | locale |
| host-service | packages/dsh-ssh/src/index.ts | 26 | tools |
| host-service | packages/dsh-task-board/src/client/index.ts | 86 | remote |
| host-service | packages/dsh-tool-describe-image/src/client/index.ts | 65 | locale |
| host-service | packages/dsh-tool-describe-image/src/index.ts | 28 | tools |
| host-service | packages/dsh-value-mode/src/client/index.ts | 59 | remote.session |
| host-service | packages/dsh-value-mode/src/index.ts | 48 | llm |
| host-service | packages/dsh-web-ui-settings/src/client/index.ts | 77 | remote |
| host-service | packages/skins/skin-center/src/client/index.ts | 64 | remote |
| profile-home | apps/dsh-desktop/scripts/capture-all-surfaces.mjs | 154 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/capture-qqbot-qr-3.3.0.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/capture-startup.mjs | 41 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0-v2.mjs | 17 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0-v3.mjs | 13 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0-v4.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0.mjs | 20 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-qqbot-surface-3.3.0-v2.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-qqbot-surface-3.3.0.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-star-burst-3.3.0.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 117 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 120 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 153 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 155 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 156 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 157 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 160 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 184 | profileDir |
| profile-home | apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs | 225 | profileDir |
| profile-home | apps/dsh-desktop/scripts/history-host-probe.mjs | 70 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/measure-packaged-memory.mjs | 86 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 35 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 38 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 43 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 44 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 50 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-startup-fps.mjs | 23 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/packaged-smoke-runner.mjs | 63 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/preset-deep-link-runner.mjs | 63 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 30 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 110 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 424 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 428 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-skills.mjs | 57 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 10 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 48 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 158 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-directory-picker.mjs | 58 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-discovery-surfaces.mjs | 81 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-dock-model-catalog.mjs | 34 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-dock-settings.mjs | 31 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 9 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 9 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 9 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 112 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 112 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 113 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-large-legacy-history.mjs | 14 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-large-legacy-history.mjs | 41 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-large-legacy-history.mjs | 221 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-native-plugin-pages.mjs | 30 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-agent-work.mjs | 262 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-agent-work.mjs | 354 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-image-drop.mjs | 415 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-local-lan-gateway.mjs | 79 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-model-preferences.mjs | 66 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 57 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-personalization.mjs | 62 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-remote-lan.mjs | 68 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-ssh.mjs | 65 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-particle-theme.mjs | 40 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 16 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 80 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 116 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-preset-export.mjs | 31 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/scripts/verify-proxy-routing.mjs | 89 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 6 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 6 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 57 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 57 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 59 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 7 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 7 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 7 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 17 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 18 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 42 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 134 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 134 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-selected-balance.mjs | 45 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-settings-window.mjs | 58 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-skill-discovery.mjs | 42 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-skin-center.mjs | 61 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-star-prompt.mjs | 30 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-terminal.mjs | 105 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 79 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 142 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-window-chrome.mjs | 54 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 32 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 67 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 150 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 154 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/conversation-import/ledger.mjs | 15 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 108 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 110 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 112 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 208 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 209 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 638 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 639 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1179 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1208 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1239 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1241 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1244 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1282 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1328 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1413 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1448 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1449 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1455 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1503 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1508 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1722 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1730 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1733 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2351 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2404 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2436 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2500 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2506 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 77 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 78 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 79 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 80 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 98 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 100 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 113 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 114 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 845 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 846 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 847 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 851 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 852 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 860 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 861 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 866 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 871 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 884 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 889 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 900 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 129 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 131 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 131 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 132 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 242 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 243 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 243 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 243 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 244 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 244 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 245 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 246 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 400 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 454 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 454 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 462 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 467 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 470 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 475 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 503 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 562 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 562 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 637 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 637 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 274 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 275 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 287 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 290 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 302 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 303 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 419 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 420 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 423 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 425 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 426 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 501 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 516 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 564 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 577 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 577 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 612 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 612 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 615 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 627 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 696 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 715 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 730 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 760 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 767 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 769 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 783 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 804 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 806 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 820 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 836 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 840 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 874 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 959 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1005 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1006 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1043 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1043 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1047 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1048 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1051 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1058 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1062 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1136 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1136 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1140 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1141 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1144 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1150 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1159 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1167 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1222 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1289 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1289 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1309 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1314 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1336 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1347 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1353 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1359 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1363 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1370 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1429 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1473 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1473 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1516 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1517 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1526 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1535 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1552 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1605 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1608 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1618 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1665 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1672 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1690 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1700 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1728 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1751 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1757 | profileDir |
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
| profile-home | apps/dsh-desktop/src/profile.mjs | 591 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 592 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 592 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 593 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 595 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 599 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 600 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 600 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 601 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 604 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 942 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 969 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1152 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1157 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1219 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1221 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1246 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1248 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1271 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1272 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1273 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1274 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1301 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1302 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1322 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1350 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1368 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1380 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1394 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1445 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1494 | resolveDshCliPath |
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
| profile-home | apps/dsh-desktop/src/repair-workspace.mjs | 407 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 680 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 681 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 79 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 130 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 145 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 152 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 191 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 206 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 225 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 250 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 254 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-graph-validator.mjs | 279 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-integrity-audit.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-integrity-audit.mjs | 29 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 219 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 220 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 227 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 231 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 224 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 228 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 230 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 231 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 60 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 402 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 403 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 442 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 445 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 450 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 451 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 469 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 471 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 703 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 704 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 704 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 705 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 705 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 706 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 707 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 708 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 709 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 711 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 712 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 736 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 737 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 739 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 905 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1023 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1024 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1079 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1101 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1116 | profileDir |
| profile-home | apps/dsh-desktop/src/user-plugin-archive.mjs | 1172 | profileDir |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 9 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 11 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 25 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 26 | profileDir |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 27 | profileDir |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 28 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 29 | profileDir |
| profile-home | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 32 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/automatic-repair-runner.test.mjs | 44 | profileDir |
| profile-home | apps/dsh-desktop/test/automatic-repair-runner.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/automatic-repair-runner.test.mjs | 189 | profileDir |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 9 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 9 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 19 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 21 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 65 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 67 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 7 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 7 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 28 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 29 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/desktop-v42-migration.test.mjs | 7 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/desktop-v42-migration.test.mjs | 105 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/desktop-v42-migration.test.mjs | 106 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1723 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1724 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1725 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1726 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1749 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1750 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1751 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1771 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1772 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1773 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1800 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1812 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1815 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1852 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1853 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1854 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1866 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1867 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1878 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1893 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1894 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1895 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1911 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1912 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1927 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1928 | profileDir |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 7 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 8 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 15 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 23 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 25 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 29 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 37 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 40 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 52 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 62 | profileDir |
| profile-home | apps/dsh-desktop/test/legacy-credential-compat.test.mjs | 120 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/migration-runtime-environment.test.mjs | 54 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs | 39 | profileDir |
| profile-home | apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs | 98 | profileDir |
| profile-home | apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs | 129 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-compatibility.test.mjs | 41 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-compatibility.test.mjs | 43 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-compatibility.test.mjs | 53 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 23 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 24 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 31 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 34 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 37 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 46 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 59 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 60 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 63 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 67 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 78 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 79 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 80 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 83 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 88 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 88 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 93 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 98 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 118 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 119 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 123 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 128 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 144 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 146 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 150 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 155 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 171 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 172 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 173 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 194 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 196 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 204 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 207 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 208 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 213 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 217 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 223 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 239 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 240 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 252 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 256 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 258 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 260 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 272 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 273 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 306 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 307 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 319 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 325 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 359 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 19 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 185 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 192 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 193 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 195 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 196 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 197 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 203 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 206 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 208 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 219 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 221 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 222 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 231 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 233 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 234 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 240 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 261 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 263 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 266 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 279 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 282 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 283 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 293 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 300 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 316 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 319 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 320 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 326 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 328 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 349 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 384 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 388 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 389 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 395 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 396 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 422 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 443 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 451 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 462 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 465 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 466 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 472 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 473 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 480 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 520 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 547 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 551 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 552 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 558 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 559 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 599 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 628 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 632 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 634 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 641 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 643 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 658 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 674 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 677 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 678 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 680 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 691 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 693 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 718 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 762 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 763 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 764 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 766 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 799 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 802 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 803 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 825 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 832 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 858 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 876 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 880 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 881 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 887 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 906 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 930 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 939 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 964 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1015 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1055 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1059 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1062 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1089 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1091 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1111 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1126 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1130 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1132 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1139 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1160 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1168 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1192 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1212 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1214 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1216 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1218 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1252 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1255 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1261 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1262 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1263 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1274 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1290 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1335 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1366 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1369 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1371 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1382 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1387 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1431 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 12 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 15 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 16 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 26 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 27 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 28 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 64 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 65 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 84 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 85 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 89 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 104 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 105 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 109 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 110 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 111 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 128 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 141 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 141 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 152 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 164 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 164 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 171 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 171 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 177 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 178 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 190 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 190 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 212 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 232 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 235 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 238 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 238 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 244 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 245 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 261 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 261 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 267 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 65 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 95 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 145 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 148 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 157 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 175 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 228 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 230 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 236 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 240 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 244 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 252 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 270 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 288 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 298 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 303 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 312 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 319 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 362 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 367 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 369 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 370 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 371 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 403 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 426 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 431 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 433 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 434 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 455 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 469 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 474 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 478 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 485 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 528 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 533 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 536 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 545 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 578 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 583 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 584 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 585 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 603 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 619 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 630 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 662 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 667 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 668 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 669 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 687 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 701 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 712 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 717 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 719 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 720 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 740 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 750 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 755 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 757 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 758 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 777 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 791 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 796 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 800 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 821 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 825 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 829 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 835 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 840 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 843 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 852 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 853 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 866 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 874 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 879 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 881 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 890 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 904 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 934 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 939 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 943 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 950 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 961 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 970 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 979 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 982 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 987 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 989 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 995 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1009 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1014 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1019 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1030 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1039 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1046 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1058 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1063 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1065 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1073 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1078 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1082 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1088 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1092 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1097 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1101 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1112 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1119 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1121 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1124 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1131 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1135 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1141 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1144 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1145 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1154 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1170 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1184 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1223 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1224 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1225 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1231 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1240 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1263 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1288 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1292 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1293 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1299 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1301 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1326 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1329 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1330 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1339 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1349 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1373 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1374 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1375 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1386 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1390 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1399 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1427 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1428 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1432 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1439 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1441 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1449 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 11 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 166 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 166 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 168 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 172 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 186 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 187 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 188 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 202 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 204 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 206 | profileDir |
| profile-home | apps/dsh-desktop/test/preset-service.test.mjs | 215 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 34 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 40 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 41 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 48 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 138 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 145 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 326 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 327 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 340 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 341 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 344 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 346 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 479 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 481 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 482 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 489 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 490 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 491 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 492 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 496 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 497 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 498 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 548 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 550 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 550 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 554 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 564 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 624 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 630 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 634 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 637 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 646 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 652 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 654 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 659 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 663 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 666 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 685 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 686 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 687 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 688 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 689 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 690 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 690 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 694 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 696 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 700 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 717 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 721 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 724 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 730 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 740 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 744 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 752 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 759 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 766 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 776 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 778 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 787 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 799 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 800 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 809 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 815 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 826 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 827 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 832 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 840 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 846 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 856 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 857 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 866 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 878 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 910 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 911 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 915 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 918 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 919 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 921 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 935 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 945 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 951 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 951 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 964 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 977 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 993 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 994 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 998 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1000 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1002 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1018 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1020 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1029 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1030 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1030 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1033 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1038 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1038 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1041 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1048 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1048 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1058 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1058 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1065 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1065 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1068 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1080 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1082 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1083 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1085 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1089 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1091 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1094 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1107 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1109 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1120 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1123 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1127 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1130 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1132 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1133 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1134 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1135 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1147 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1155 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1209 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1280 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1298 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1311 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1318 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1349 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1350 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1351 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1357 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1365 | profileDir |
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
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 143 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 146 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 147 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/test/repair-workspace.test.mjs | 153 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-controller.test.mjs | 393 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 19 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 24 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 28 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 44 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 73 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 77 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 147 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 171 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 194 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 196 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 214 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 225 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 228 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-graph-validator.test.mjs | 252 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 26 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 27 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 124 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 132 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 137 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 144 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 382 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 383 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 384 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 386 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 388 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 395 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 400 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 406 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 446 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 448 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 546 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integrity-audit.test.mjs | 11 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integrity-audit.test.mjs | 19 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 53 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 129 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 135 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 222 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 236 | profileDir |
| profile-home | apps/dsh-desktop/test/sdk-contracts.test.mjs | 8 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/sdk-contracts.test.mjs | 18 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/sdk-contracts.test.mjs | 41 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/session-preservation.test.mjs | 23 | profileDir |
| profile-home | apps/dsh-desktop/test/skin-desktop-adaptation.test.mjs | 9 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/skin-desktop-adaptation.test.mjs | 14 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 39 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 40 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 59 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 65 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 79 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 79 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 109 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 116 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 142 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 142 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 189 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 189 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 193 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 212 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 212 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 216 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 224 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 312 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 312 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 322 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 326 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 340 | profileDir |
| profile-home | apps/dsh-desktop/test/user-plugin-archive.test.mjs | 340 | profileDir |
| profile-home | capture-3.3.0-extension-tabs.mjs | 61 | DSH_HOME |
| profile-home | capture-3.3.0-source-surfaces-v3.mjs | 63 | DSH_HOME |
| profile-home | capture-3.3.0-source-surfaces.mjs | 86 | DSH_HOME |
| profile-home | capture-3.3.0-surfaces.mjs | 71 | DSH_HOME |
| profile-home | diagnose-3.3.0-extension-settle.mjs | 58 | DSH_HOME |
| profile-home | diagnose-3.3.0-main.mjs | 65 | DSH_HOME |
| profile-home | diagnose-3.3.0-mode-flow.mjs | 48 | DSH_HOME |
| profile-home | diagnose-3.3.0-mode-flow2.mjs | 48 | DSH_HOME |
| profile-home | diagnose-3.3.0-mode-prompt.mjs | 48 | DSH_HOME |
| profile-home | diagnose-3.3.0-mode-prompt2.mjs | 48 | DSH_HOME |
| profile-home | diagnose-3.3.0-model-menu.mjs | 20 | DSH_HOME |
| profile-home | diagnose-3.3.0-session.mjs | 79 | DSH_HOME |
| profile-home | diagnose-3.3.0-source-mode.mjs | 55 | DSH_HOME |
| profile-home | diagnose-3.3.0-workspace-flow.mjs | 76 | DSH_HOME |
| profile-home | diagnose-3.3.0-workspace-flow2.mjs | 55 | DSH_HOME |
| profile-home | diagnose-3.3.0-workspace-flow3.mjs | 48 | DSH_HOME |
| profile-home | diagnose-3.3.0-workspace-select.mjs | 59 | DSH_HOME |
| profile-home | diagnose-3.3.0-workspace.mjs | 78 | DSH_HOME |
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
| profile-home | packages/dsh-live-stats/src/ledger-store.ts | 89 | DSH_HOME |
| profile-home | packages/dsh-live-stats/src/ledger-store.ts | 91 | DSH_HOME |
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
| profile-home | packages/dsh-pet/src/service.ts | 52 | DSH_HOME |
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 361 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 361 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/tunnel.ts | 89 | DSH_HOME |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 209 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 237 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 379 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/update.ts | 416 | profileDir |
| profile-home | packages/dsh-remote-web-ui/tests/tunnel.spec.ts | 82 | DSH_HOME |
| profile-home | packages/dsh-remote-web-ui/tests/tunnel.spec.ts | 83 | DSH_HOME |
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
| profile-home | packages/dsh-value-mode/src/dsh-home.ts | 3 | DSH_HOME |
| profile-home | packages/dsh-value-mode/src/dsh-home.ts | 20 | DSH_HOME |
| profile-home | packages/dsh-value-mode/src/dsh-home.ts | 25 | DSH_HOME |
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
| profile-home | scripts/audit-dsh-coupling.mjs | 34 | ensureDesktopProfile |
| profile-home | scripts/audit-dsh-coupling.mjs | 34 | resolveRuntimePackages |
| profile-home | scripts/audit-dsh-coupling.mjs | 34 | resolveDshCliPath |
| profile-home | scripts/audit-dsh-coupling.mjs | 34 | DSH_HOME |
| profile-home | scripts/audit-dsh-coupling.mjs | 34 | DSH_PROFILE |
| profile-home | scripts/audit-dsh-coupling.mjs | 34 | profileDir |
| profile-home | scripts/audit-dsh-coupling.mjs | 34 | runtimeHome |
| profile-home | scripts/dsh-skin.test.mjs | 21 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 68 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 75 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 87 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 102 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 120 | DSH_HOME |
| profile-home | scripts/dsh-skin.test.mjs | 126 | DSH_HOME |
| profile-home | scripts/verify-builtin-plugin-adaptation.mjs | 16 | resolveRuntimePackages |
| profile-home | scripts/verify-builtin-plugin-adaptation.mjs | 59 | resolveRuntimePackages |
| profile-home | scripts/verify-builtin-plugin-adaptation.mjs | 60 | resolveRuntimePackages |
| profile-home | shared/host/dsh-home.ts | 2 | DSH_HOME |
| profile-home | shared/host/dsh-home.ts | 19 | DSH_HOME |
| profile-home | shared/host/dsh-home.ts | 24 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 19 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 20 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 21 | DSH_HOME |
| profile-home | shared/tests/dsh-home.spec.ts | 25 | DSH_HOME |
| profile-home | verify-3.3.0-drag-drop.mjs | 103 | DSH_HOME |
| profile-home | verify-3.3.0-source-drag-drop.mjs | 131 | DSH_HOME |
| profile-home | verify-3.3.0-source-mode-selection-v2.mjs | 20 | DSH_HOME |
| profile-home | verify-3.3.0-source-mode-selection-v3.mjs | 20 | DSH_HOME |
| profile-home | verify-3.3.0-source-mode-selection.mjs | 68 | DSH_HOME |
| profile-home | verify-3.3.0-source-paste-large.mjs | 68 | DSH_HOME |
| runtime-lifecycle | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 117 | start |
| runtime-lifecycle | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 69 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1155 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1724 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2065 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2335 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2337 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2352 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2843 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2849 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 865 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 878 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 1019 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 1021 | start |
| runtime-lifecycle | apps/dsh-desktop/src/menu.mjs | 64 | restart |
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
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 8 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 8 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 140 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 208 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 234 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 191 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 195 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 202 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 208 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 209 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 210 | start |
| runtime-lifecycle | apps/dsh-desktop/test/agent-team-runtime.test.mjs | 38 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 28 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 73 | start |
| runtime-lifecycle | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 31 | start |
| runtime-lifecycle | apps/dsh-desktop/test/install-recovery.test.mjs | 24 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 387 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 410 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 432 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 473 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 515 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 521 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 523 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 531 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 548 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 587 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 635 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 668 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 676 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 697 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 707 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 726 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 748 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 774 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 778 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 779 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 791 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 821 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 826 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 827 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 869 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 875 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 876 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 877 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 893 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 923 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 961 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1059 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1064 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1190 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1193 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 412 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 454 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 544 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 553 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-shutdown-control.test.mjs | 93 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-shutdown-control.test.mjs | 103 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 56 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 72 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 94 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 115 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 142 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 160 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 176 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 191 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 205 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-startup-phase.test.mjs | 220 | start |
| runtime-lifecycle | apps/dsh-desktop/test/update-diagnostics.test.mjs | 45 | start |
| runtime-lifecycle | apps/dsh-desktop/test/update-diagnostics.test.mjs | 83 | start |
| runtime-lifecycle | apps/dsh-desktop/test/updater.test.mjs | 81 | start |
| runtime-lifecycle | packages/dsh-particle-theme/src/client/index.ts | 72 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 31 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 57 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 74 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 97 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 127 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 162 | start |
| runtime-lifecycle | packages/dsh-task-board/src/client/index.ts | 220 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/board-persistence.spec.tsx | 21 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller-persistence.spec.ts | 31 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller-persistence.spec.ts | 223 | start |
| runtime-lifecycle | packages/dsh-task-board/tests/controller-persistence.spec.ts | 257 | start |
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
| runtime-lifecycle | packages/dsh-web-ui-settings/tests/relay-connect.spec.ts | 9 | start |
| runtime-lifecycle | packages/dsh-web-ui-settings/tests/relay-connect.spec.ts | 50 | start |
| session | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 65 | create |
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 227 | create |
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 229 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 50 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 167 | get |
| session | apps/dsh-desktop/test/manual-compaction.test.mjs | 84 | create |
| session | packages/dsh-aionui-panel/src/index.ts | 50 | get |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 99 | create |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 285 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 82 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 155 | get |
| session | packages/dsh-live-stats/tests/projection.spec.ts | 47 | create |
| session | packages/dsh-memory/src/index.ts | 157 | list |
| session | packages/dsh-mode-switcher/src/client/mode-controller.ts | 114 | create |
| session | packages/dsh-mode-switcher/src/client/runtime-adapter.ts | 24 | create |
| session | packages/dsh-personal-prompt/src/index.ts | 119 | get |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 340 | create |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 374 | list |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 434 | prompt |
| session | packages/dsh-remote-web-ui/src/mobile/views/SessionListView.tsx | 9 | create |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 286 | subscribe |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 288 | prompt |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 388 | subscribe |
| session | packages/dsh-user-scope/src/index.ts | 383 | list |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 77 | create |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 103 | create |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 121 | create |
| session | packages/dsh-value-mode/src/core/state.ts | 41 | get |
| session | scripts/dsh-candidate-execution.mjs | 91 | get |
| session | scripts/dsh-candidate-execution.mjs | 160 | subscribe |
| session | scripts/dsh-candidate-execution.mjs | 161 | prompt |
| slot | packages/dsh-aionui-panel/src/client/index.ts | 152 | conversation.input.dock |
| slot | packages/dsh-aionui-panel/src/client/native-browser.tsx | 49 | sidebar.right.pane.tab |
| slot | packages/dsh-aionui-panel/src/client/native-browser.tsx | 123 | conversation.input.left |
| slot | packages/dsh-aionui-panel/src/client/native-panels.tsx | 72 | sidebar.right.pane.tab |
| slot | packages/dsh-chat-artifacts/src/client/index.ts | 33 | tool.call.toolview |
| slot | packages/dsh-git-graph/src/client/index.ts | 204 | conversation.input.selector.context |
| slot | packages/dsh-git-graph/src/client/index.ts | 213 | conversation.input.dock |
| slot | packages/dsh-live-stats/src/client/index.ts | 83 | web-ui.plugin.item |
| slot | packages/dsh-live-stats/src/client/index.ts | 93 | conversation.composer.dock |
| slot | packages/dsh-memory/src/client/index.ts | 52 | web-ui.plugin.item |
| slot | packages/dsh-mode-switcher/src/client/index.ts | 30 | conversation.session.header.actions |
| slot | packages/dsh-model-preferences/src/client/index.ts | 121 | settings.models.footer |
| slot | packages/dsh-model-preferences/src/client/index.ts | 178 | conversation.input.model |
| slot | packages/dsh-particle-theme/src/client/index.ts | 77 | web-ui.plugin.item |
| slot | packages/dsh-personal-prompt/src/client/index.ts | 52 | web-ui.plugin.item |
| slot | packages/dsh-pet/src/client/index.ts | 132 | web-ui.plugin.item |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 122 | sidebar.remote |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 148 | sidebar.footer.action |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 174 | web-ui.plugin.item |
| slot | packages/dsh-task-board/src/client/index.ts | 116 | web-ui.plugin.item |
| slot | packages/dsh-tool-describe-image/src/client/index.ts | 98 | web-ui.plugin.item |
| slot | packages/dsh-value-mode/src/client/index.ts | 238 | web-ui.plugin.item |
| slot | packages/dsh-value-mode/src/client/index.ts | 261 | conversation.session.header.actions |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 107 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 115 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 125 | web-ui.plugin.item |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 129 | model-preferences.onboarding |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 140 | sidebar.footer.action |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 147 | sidebar.footer.action |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 154 | sidebar.footer.action |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 169 | root |
| slot | packages/skins/skin-center/src/client/index.ts | 102 | web-ui.plugin.item |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 207 | list |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 217 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 218 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 316 | create |
| workspace | gallery/bundles.js | 7 | list |
| workspace | gallery/bundles.js | 13 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 310 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.tsx | 4 | list |
| workspace | packages/dsh-web-ui-settings/src/client/ProjectDialog.tsx | 63 | create |
| workspace | packages/skins/ths/src/client/index.ts | 175 | list |
| workspace | packages/skins/trading/src/client/index.ts | 328 | list |

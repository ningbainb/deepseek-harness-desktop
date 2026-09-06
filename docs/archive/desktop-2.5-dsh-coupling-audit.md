# Desktop 2.5 DSH coupling audit

Authoritative Desktop version: 3.3.0.

Stable DSH package version: 0.1.1-rc.1.

Lockfile SHA-256: `6077355374fe654635fd57a1f19d48742323b78d03b21f894e15865558e6a496`.

Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.

## Classification summary

| Classification | Count |
| --- | ---: |
| public-stable | 230 |
| public-experimental | 151 |
| compatibility-patch | 31 |
| private-high-risk | 0 |

## Direct imports, dynamic imports, and requires

| File | Line | Kind | Specifier | Type-only | Classification | Controlled |
| --- | ---: | --- | --- | --- | --- | --- |
| apps/dsh-desktop/test/conversation-import/session-bridge-transaction.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/conversation-import/transcript-protocol-events.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
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
| packages/dsh-chat-artifacts/src/client/ArtifactCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-chat-artifacts/src/client/ArtifactCard.tsx | 10 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-primitives | no | public-stable | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-tool/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 8 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/ArtifactToolRow.tsx | 9 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-tool/client | yes | public-experimental | no |
| packages/dsh-chat-artifacts/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
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
| packages/dsh-desktop-compat/src/background-scheduler-runner.ts | 17 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
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
| packages/dsh-desktop-compat/src/session-recovery.ts | 1 | static-import | @deepseek-ai/dsh-session-persistence | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 3 | static-import | @deepseek-ai/dsh-tools | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/transcript-balance.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 9 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 5 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | no |
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
| packages/dsh-live-stats/src/index.ts | 5 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-live-stats/src/invariant.ts | 7 | static-import | @deepseek-ai/dsh-invariants | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 1 | static-import | @deepseek-ai/dsh-session-projection/types | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 6 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 7 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 8 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 9 | static-import | @deepseek-ai/dsh-session-projection | yes | public-stable | no |
| packages/dsh-live-stats/src/projection.ts | 10 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/projection.ts | 11 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/projection.ts | 22 | static-export | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/routes.ts | 8 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-live-stats/tests/estimator.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 8 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 9 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 10 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 11 | static-import | @deepseek-ai/dsh-session-projection | no | public-stable | no |
| packages/dsh-live-stats/tests/routes.spec.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-live-stats/tests/tps-line.spec.tsx | 3 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/core/query.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 3 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
| packages/dsh-memory/src/index.ts | 4 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 5 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 6 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 9 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-memory/src/index.ts | 10 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-memory/src/routes.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-memory/src/store.ts | 1 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-memory/src/store.ts | 4 | static-import | @deepseek-ai/dsh-atomic-write | no | public-stable | no |
| packages/dsh-memory/src/tools.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-memory/src/tools.ts | 2 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-memory/src/tools.ts | 3 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-mode-switcher/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 2 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-mode-switcher/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 18 | dynamic-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 5 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 8 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 9 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/core/config.ts | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/core/config.ts | 6 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-model-preferences/tests/projection.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
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
| packages/dsh-personal-prompt/src/client/PersonalPromptCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/PersonalPromptCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 3 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 4 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 5 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-personal-prompt/src/index.ts | 6 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-personal-prompt/tests/host-plugin.spec.ts | 1 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
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
| packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 9 | static-import | @deepseek-ai/dsh-host-apiproxy | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 10 | static-import | @deepseek-ai/dsh-host-apiproxy/api/rpc | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 11 | static-import | @deepseek-ai/dsh-host-apiproxy/api/rpc | no | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 12 | static-import | @deepseek-ai/dsh-host-apiproxy/api/events | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/mobile-authorization.ts | 9 | static-import | @deepseek-ai/dsh-host-apiproxy/api/events | yes | public-experimental | no |
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
| packages/dsh-remote-web-ui/src/startup.ts | 12 | static-import | @deepseek-ai/dsh-cmdline | no | public-stable | no |
| packages/dsh-remote-web-ui/src/tunnel.ts | 15 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-remote-web-ui/src/update-routes.ts | 8 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-api.spec.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-api.spec.ts | 11 | static-import | @deepseek-ai/dsh-host-apiproxy | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-isolation.spec.ts | 1 | static-import | @deepseek-ai/dsh-host-apiproxy | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-isolation.spec.ts | 6 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
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
| packages/dsh-user-scope/src/index.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-user-scope/src/index.ts | 4 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-user-scope/src/store.ts | 1 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-user-scope/src/store.ts | 4 | static-import | @deepseek-ai/dsh-atomic-write | no | public-stable | no |
| packages/dsh-user-scope/tests/lifecycle.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-user-scope/tests/lifecycle.spec.ts | 6 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-value-mode/src/client/ModelPicker.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-value-mode/src/core/expert.ts | 1 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-value-mode/src/core/expert.ts | 3 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-value-mode/src/core/model-selection.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 15 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 16 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 17 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 18 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 19 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/tests/client.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-value-mode/tests/routing.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 15 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 18 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 19 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/chatgpt-auth-routes.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 1 | static-import | @deepseek-ai/dsh-authorization | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 7 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | yes |
| packages/dsh-web-ui-settings/src/client/RelayOnboardingCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
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
| packages/dsh-web-ui-settings/src/relay-routes.ts | 11 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 13 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 14 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 15 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 16 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 7 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 10 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 12 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-web-ui-settings/tests/relay-routes.spec.ts | 1 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/relay-routes.spec.ts | 5 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
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
| host-service | packages/dsh-chat-artifacts/src/client/index.ts | 27 | locale |
| host-service | packages/dsh-chat-artifacts/src/index.ts | 51 | tools |
| host-service | packages/dsh-desktop-compat/src/index.ts | 24 | sessions |
| host-service | packages/dsh-git-graph/src/client/index.ts | 81 | locale |
| host-service | packages/dsh-git-graph/src/index.ts | 27 | subprocess |
| host-service | packages/dsh-git-graph/src/invariant.ts | 17 | invariants |
| host-service | packages/dsh-liangshen/presets/liangshen/tool-bootstrap.mjs | 33 | tools |
| host-service | packages/dsh-live-stats/src/client/index.ts | 61 | remote |
| host-service | packages/dsh-live-stats/src/index.ts | 16 | live-stats |
| host-service | packages/dsh-live-stats/src/invariant.ts | 15 | invariants |
| host-service | packages/dsh-memory/src/client/index.ts | 30 | locale |
| host-service | packages/dsh-memory/src/index.ts | 31 | tools |
| host-service | packages/dsh-mode-switcher/src/client/index.ts | 8 | connection |
| host-service | packages/dsh-model-preferences/src/client/index.ts | 71 | sessions |
| host-service | packages/dsh-model-preferences/src/index.ts | 11 | settings |
| host-service | packages/dsh-particle-theme/src/client/index.ts | 29 | object |
| host-service | packages/dsh-personal-prompt/src/client/index.ts | 33 | locale |
| host-service | packages/dsh-personal-prompt/src/index.ts | 25 | sessions |
| host-service | packages/dsh-pet/src/client/index.ts | 70 | remote |
| host-service | packages/dsh-remote-web-ui/src/client/index.ts | 93 | remote |
| host-service | packages/dsh-remote-web-ui/src/invariant.ts | 15 | invariants |
| host-service | packages/dsh-ssh/src/client/index.ts | 35 | locale |
| host-service | packages/dsh-ssh/src/index.ts | 26 | tools |
| host-service | packages/dsh-task-board/src/client/index.ts | 80 | remote |
| host-service | packages/dsh-tool-describe-image/src/client/index.ts | 61 | locale |
| host-service | packages/dsh-tool-describe-image/src/index.ts | 27 | tools |
| host-service | packages/dsh-value-mode/src/client/index.ts | 55 | connection |
| host-service | packages/dsh-value-mode/src/index.ts | 48 | llm |
| host-service | packages/dsh-web-ui-settings/src/client/index.ts | 70 | web-ui-plugins |
| host-service | packages/skins/skin-center/src/client/index.ts | 63 | remote |
| profile-home | apps/dsh-desktop/scripts/capture-qqbot-qr-3.3.0.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/capture-startup.mjs | 39 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0-v2.mjs | 17 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0-v3.mjs | 13 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0-v4.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-model-menu-3.3.0.mjs | 20 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-qqbot-surface-3.3.0-v2.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-qqbot-surface-3.3.0.mjs | 12 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/diagnose-star-burst-3.3.0.mjs | 12 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/scripts/verify-packaged-model-preferences.mjs | 59 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 57 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-personalization.mjs | 58 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-remote-lan.mjs | 68 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/conversation-import/ledger.mjs | 15 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 75 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 76 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 77 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 156 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 157 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 536 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 963 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 977 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 996 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 998 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1001 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1014 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1057 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1166 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1171 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1176 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1322 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1851 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1883 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1947 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1953 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 13 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 14 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 15 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 518 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 519 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 520 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 524 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 526 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 530 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 541 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 546 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 557 | profileDir |
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
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 439 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 453 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 501 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 511 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 511 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 537 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 537 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 560 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 579 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 594 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 624 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 630 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 643 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 664 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 666 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 680 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 696 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 700 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 825 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 826 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 852 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 853 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 856 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 863 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 867 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 924 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 925 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 928 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 934 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 943 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 951 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1011 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1016 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1038 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1048 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1054 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1060 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1064 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1071 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1107 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1108 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1117 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1126 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1143 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1195 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1198 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1208 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1255 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1262 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1280 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1290 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1318 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1341 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1347 | profileDir |
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
| profile-home | apps/dsh-desktop/src/profile.mjs | 735 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 762 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 937 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 942 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1004 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1006 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1031 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1033 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1056 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1057 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1058 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1059 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1086 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1087 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1107 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1132 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1150 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1162 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1176 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1227 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1276 | resolveDshCliPath |
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
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 525 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 526 | DSH_PROFILE |
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
| profile-home | apps/dsh-desktop/test/automatic-repair-runner.test.mjs | 38 | profileDir |
| profile-home | apps/dsh-desktop/test/automatic-repair-runner.test.mjs | 155 | profileDir |
| profile-home | apps/dsh-desktop/test/automatic-repair-runner.test.mjs | 183 | profileDir |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 8 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 8 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 16 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 18 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 61 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 63 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1333 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1334 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1335 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1347 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1348 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1357 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1372 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1373 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1374 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1389 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1390 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1401 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1402 | profileDir |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 7 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 8 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 15 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/legacy-credential-compat.test.mjs | 120 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/migration-runtime-environment.test.mjs | 43 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 27 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 32 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 33 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 181 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 182 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 195 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 196 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 199 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 201 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 345 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 347 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 347 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 351 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 361 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 421 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 427 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 431 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 434 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 443 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 449 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 451 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 456 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 460 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 463 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 482 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 483 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 484 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 485 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 486 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 487 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 487 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 491 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 493 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 497 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 514 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 518 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 521 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 527 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 537 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 541 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 549 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 556 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 563 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 573 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 575 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 584 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 596 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 597 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 606 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 612 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 623 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 624 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 629 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 637 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 643 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 653 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 654 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 663 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 675 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 707 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 708 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 712 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 715 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 716 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 718 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 732 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 742 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 748 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 748 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 761 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 774 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 790 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 791 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 795 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 797 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 799 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 815 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 817 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 826 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 827 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 830 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 835 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 838 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 845 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 855 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 862 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 865 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 877 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 879 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 880 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 882 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 886 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 888 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 891 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 904 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 906 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 917 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 920 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 924 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 927 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 929 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 930 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 931 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 932 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 944 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 952 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1035 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1053 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1066 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1073 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/test/runtime-controller.test.mjs | 317 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 24 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 25 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 90 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 107 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 112 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 119 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 316 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 317 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 318 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 320 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 322 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 329 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 334 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 340 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 378 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 380 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 491 | resolveDshCliPath |
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
| profile-home | packages/dsh-live-stats/src/balance-service.ts | 47 | DSH_HOME |
| profile-home | packages/dsh-live-stats/src/balance-service.ts | 74 | DSH_HOME |
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
| profile-home | packages/dsh-pet/src/service.ts | 50 | DSH_HOME |
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 358 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 358 | profileDir |
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
| profile-home | verify-3.3.0-drag-drop.mjs | 103 | DSH_HOME |
| profile-home | verify-3.3.0-source-drag-drop.mjs | 131 | DSH_HOME |
| profile-home | verify-3.3.0-source-mode-selection-v2.mjs | 20 | DSH_HOME |
| profile-home | verify-3.3.0-source-mode-selection-v3.mjs | 20 | DSH_HOME |
| profile-home | verify-3.3.0-source-mode-selection.mjs | 68 | DSH_HOME |
| profile-home | verify-3.3.0-source-paste-large.mjs | 68 | DSH_HOME |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 939 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1324 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1808 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1809 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2231 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2233 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 523 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 536 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 571 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 573 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 625 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 632 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 652 | start |
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
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 129 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 193 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-mutation-coordinator.mjs | 200 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 169 | start |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 173 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 180 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 186 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 187 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/runtime-provider.mjs | 188 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 25 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 69 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 311 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 334 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 356 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 397 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 439 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 445 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 447 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 455 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 472 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 510 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 558 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 591 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 599 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 620 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 630 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 649 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 671 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 697 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 701 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 702 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 714 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 744 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 749 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 750 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 792 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 798 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 799 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 800 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 816 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 846 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 884 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 982 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 987 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1087 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1090 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 346 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 386 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 489 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 498 | start |
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
| runtime-lifecycle | apps/dsh-desktop/test/updater.test.mjs | 78 | start |
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
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 237 | create |
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 239 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 50 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 167 | get |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 99 | create |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 285 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 81 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 154 | get |
| session | packages/dsh-live-stats/tests/projection.spec.ts | 32 | create |
| session | packages/dsh-memory/src/index.ts | 146 | list |
| session | packages/dsh-mode-switcher/src/client/mode-controller.ts | 111 | create |
| session | packages/dsh-personal-prompt/src/index.ts | 119 | get |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 335 | create |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 369 | list |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 429 | prompt |
| session | packages/dsh-remote-web-ui/src/mobile/views/SessionListView.tsx | 9 | create |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 286 | subscribe |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 288 | prompt |
| session | packages/dsh-task-board/src/core/worktree-execution.ts | 388 | subscribe |
| session | packages/dsh-tool-describe-image/src/client/send-hook.ts | 81 | prompt |
| session | packages/dsh-user-scope/src/index.ts | 372 | list |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 63 | create |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 89 | create |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 107 | create |
| session | packages/dsh-value-mode/src/core/state.ts | 41 | get |
| session | scripts/dsh-candidate-execution.mjs | 91 | get |
| session | scripts/dsh-candidate-execution.mjs | 160 | subscribe |
| session | scripts/dsh-candidate-execution.mjs | 161 | prompt |
| slot | packages/dsh-aionui-panel/src/client/index.ts | 92 | conversation.input.dock |
| slot | packages/dsh-chat-artifacts/src/client/index.ts | 32 | tool.call.toolview |
| slot | packages/dsh-git-graph/src/client/index.ts | 202 | conversation.input.selector.context |
| slot | packages/dsh-git-graph/src/client/index.ts | 211 | conversation.input.dock |
| slot | packages/dsh-live-stats/src/client/index.ts | 79 | web-ui.plugin.item |
| slot | packages/dsh-live-stats/src/client/index.ts | 91 | conversation.composer.dock |
| slot | packages/dsh-memory/src/client/index.ts | 49 | web-ui.plugin.item |
| slot | packages/dsh-mode-switcher/src/client/index.ts | 20 | conversation.session.header.actions |
| slot | packages/dsh-model-preferences/src/client/index.ts | 140 | settings.models.content |
| slot | packages/dsh-model-preferences/src/client/index.ts | 197 | conversation.input.model |
| slot | packages/dsh-particle-theme/src/client/index.ts | 75 | web-ui.plugin.item |
| slot | packages/dsh-personal-prompt/src/client/index.ts | 50 | web-ui.plugin.item |
| slot | packages/dsh-pet/src/client/index.ts | 128 | web-ui.plugin.item |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 117 | sidebar.remote |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 139 | sidebar.footer.action |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 160 | web-ui.plugin.item |
| slot | packages/dsh-task-board/src/client/index.ts | 110 | web-ui.plugin.item |
| slot | packages/dsh-tool-describe-image/src/client/index.ts | 92 | web-ui.plugin.item |
| slot | packages/dsh-value-mode/src/client/index.ts | 253 | web-ui.plugin.item |
| slot | packages/dsh-value-mode/src/client/index.ts | 276 | conversation.session.header.actions |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 86 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 94 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 103 | model-preferences.onboarding |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 113 | sidebar.footer.action |
| slot | packages/skins/skin-center/src/client/index.ts | 101 | web-ui.plugin.item |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 217 | list |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 227 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 228 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 326 | create |
| workspace | gallery/bundles.js | 7 | list |
| workspace | gallery/bundles.js | 13 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 305 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.tsx | 4 | list |
| workspace | packages/skins/ths/src/client/index.ts | 175 | list |
| workspace | packages/skins/trading/src/client/index.ts | 328 | list |

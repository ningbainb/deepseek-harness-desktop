# Desktop 2.5 DSH coupling audit

Authoritative Desktop version: 3.3.0.

Stable DSH package version: 0.1.1-rc.1.

Lockfile SHA-256: `7d3e335c387ceb62e2fb326d7edb21fd48683d7c484e5c1881d61b052db8ee9c`.

Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.

## Classification summary

| Classification | Count |
| --- | ---: |
| public-stable | 241 |
| public-experimental | 155 |
| compatibility-patch | 31 |
| private-high-risk | 0 |

## Direct imports, dynamic imports, and requires

| File | Line | Kind | Specifier | Type-only | Classification | Controlled |
| --- | ---: | --- | --- | --- | --- | --- |
| apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 10 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 10 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/conversation-import/session-bridge-transaction.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/conversation-import/transcript-protocol-events.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 1 | static-import | @deepseek-ai/dsh-command-compact | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 6 | static-import | @deepseek-ai/dsh-compaction-basic | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 7 | static-import | @deepseek-ai/dsh-compaction | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 13 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 19 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 20 | static-import | @deepseek-ai/dsh-token-meter | no | public-stable | no |
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
| packages/dsh-memory/src/client/MemoryActivityPanel.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 3 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
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
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 21 | dynamic-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
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
| packages/dsh-web-ui-settings/src/client/DockSettingsPage.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/ProjectDialog.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/RelayOnboardingCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/WebUIPluginsCard.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 21 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 22 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 23 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/compat-settings-scope.ts | 24 | static-import | @deepseek-ai/dsh-client-runtime/client | no | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/desktop-interactions.tsx | 1 | static-import | @deepseek-ai/dsh-client-runtime/client | yes | public-experimental | no |
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
| host-service | packages/dsh-aionui-panel/src/client/index.ts | 38 | locale |
| host-service | packages/dsh-aionui-panel/src/index.ts | 29 | subprocess |
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
| host-service | packages/dsh-memory/src/client/index.ts | 32 | locale |
| host-service | packages/dsh-memory/src/index.ts | 30 | tools |
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
| host-service | packages/dsh-web-ui-settings/src/client/index.ts | 74 | remote |
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
| profile-home | apps/dsh-desktop/scripts/measure-packaged-memory.mjs | 86 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 28 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 63 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 314 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 317 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-skills.mjs | 27 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-directory-picker.mjs | 53 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-discovery-surfaces.mjs | 60 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-dock-settings.mjs | 23 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-image-drop.mjs | 371 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-model-preferences.mjs | 59 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 57 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-personalization.mjs | 60 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-remote-lan.mjs | 68 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-ssh.mjs | 64 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-particle-theme.mjs | 26 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 16 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 80 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 116 | profileDir |
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
| profile-home | apps/dsh-desktop/scripts/verify-proxy-routing.mjs | 86 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 5 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 5 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 5 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 12 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 13 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 18 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 43 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 43 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-settings-window.mjs | 57 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-skin-center.mjs | 60 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-star-prompt.mjs | 25 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-terminal.mjs | 105 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 71 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 134 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-window-chrome.mjs | 43 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 31 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 66 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 173 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/conversation-import/ledger.mjs | 15 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 91 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 92 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 93 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 172 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 173 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 543 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1023 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1037 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1056 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1058 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1061 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1074 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1118 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1227 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1232 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1237 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1387 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1913 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1945 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2009 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2015 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 72 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 73 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 74 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 75 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 77 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 93 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 95 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 108 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 109 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 110 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 636 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 637 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 638 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 641 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 642 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 650 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 651 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 656 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 660 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 672 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 677 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 688 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 97 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 100 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 104 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 104 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 104 | profileDir |
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
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 454 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 502 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 513 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 513 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 543 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 543 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 567 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 586 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 601 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 631 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 632 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 637 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 650 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 671 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 673 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 687 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 703 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 707 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 832 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 833 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 859 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 860 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 863 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 870 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 874 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 931 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 932 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 935 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 941 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 950 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 958 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1018 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1023 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1045 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1055 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1061 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1067 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1071 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1078 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1114 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1115 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1124 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1133 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1150 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1202 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1205 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1215 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1262 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1269 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1287 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1297 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1325 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1348 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1354 | profileDir |
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
| profile-home | apps/dsh-desktop/src/profile.mjs | 738 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 765 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 940 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 945 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1007 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1009 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1034 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1036 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1059 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1060 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1061 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1062 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1089 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1090 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1110 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1135 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1153 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1165 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1179 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1230 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1279 | resolveDshCliPath |
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
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 581 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 582 | DSH_PROFILE |
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
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 9 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 9 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 17 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 19 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 63 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 65 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1380 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1381 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1382 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1383 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1406 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1407 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1408 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1428 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1429 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1430 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1457 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1469 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1472 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1509 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1510 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1511 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1523 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1524 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1535 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1550 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1551 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1552 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1567 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1568 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1579 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1580 | profileDir |
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
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 95 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 99 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 138 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 141 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 150 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 154 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 168 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 221 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 223 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 233 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 237 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 242 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 245 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 263 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 281 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 291 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 296 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 312 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 341 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 346 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 348 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 349 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 350 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 382 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 405 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 410 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 412 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 413 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 434 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 448 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 453 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 457 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 464 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 507 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 512 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 515 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 524 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 552 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 557 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 558 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 559 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 577 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 593 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 604 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 636 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 641 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 642 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 643 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 661 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 675 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 686 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 691 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 693 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 694 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 714 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 724 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 729 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 731 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 732 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 751 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 765 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 770 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 774 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 795 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 799 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 803 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 809 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 814 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 817 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 826 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 827 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 840 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 848 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 853 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 855 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 864 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 878 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 908 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 913 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 917 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 924 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 935 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 944 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 953 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 956 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 961 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 963 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 969 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 983 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 988 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 993 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1004 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1013 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1020 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1032 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1037 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1039 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1047 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1052 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1056 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1062 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1066 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1071 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1075 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1086 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1093 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1095 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1098 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1105 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1109 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1115 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1118 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1119 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1128 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1144 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1158 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1197 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1198 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1199 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1205 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1214 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1237 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1262 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1266 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1267 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1273 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1275 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1300 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1303 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1304 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1313 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1323 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1347 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1348 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1349 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1360 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1364 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1373 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1401 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1402 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1406 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1413 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1415 | profileDir |
| profile-home | apps/dsh-desktop/test/plugins.test.mjs | 1423 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 28 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 33 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 34 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 182 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 183 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 196 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 197 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 200 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 202 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 347 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 349 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 349 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 353 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 363 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 423 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 429 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 433 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 436 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 445 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 451 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 453 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 458 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 462 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 465 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 484 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 485 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 486 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 487 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 488 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 489 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 489 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 493 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 495 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 499 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 516 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 520 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 523 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 529 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 539 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 543 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 551 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 558 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 565 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 575 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 577 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 586 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 598 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 599 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 608 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 614 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 631 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 639 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 645 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 655 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 656 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 665 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 677 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 709 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 710 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 714 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 717 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 718 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 720 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 734 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 744 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 750 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 750 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 763 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 776 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 792 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 793 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 797 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 799 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 801 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 817 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 819 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 828 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 829 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 832 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 837 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 840 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 847 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 857 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 864 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 867 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 879 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 881 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 882 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 884 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 888 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 890 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 893 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 906 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 908 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 919 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 922 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 926 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 929 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 931 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 932 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 933 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 934 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 946 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 954 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 999 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1055 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1073 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1086 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1093 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/test/runtime-controller.test.mjs | 334 | DSH_PROFILE |
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
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 999 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1389 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1870 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1871 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2293 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2295 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 655 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 667 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 702 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 704 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 756 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 763 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 783 | start |
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
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 27 | start |
| runtime-lifecycle | apps/dsh-desktop/test/background-scheduler-runtime.test.mjs | 72 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 328 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 351 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 373 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 414 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 456 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 462 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 464 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 472 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 489 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 527 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 575 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 608 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 616 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 637 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 647 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 666 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 688 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 714 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 718 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 719 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 731 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 761 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 766 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 767 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 809 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 815 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 816 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 817 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 833 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 863 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 901 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 999 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1004 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1130 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1133 | stop |
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
| runtime-lifecycle | apps/dsh-desktop/test/updater.test.mjs | 80 | start |
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
| runtime-lifecycle | packages/dsh-web-ui-settings/tests/relay-connect.spec.ts | 9 | start |
| runtime-lifecycle | packages/dsh-web-ui-settings/tests/relay-connect.spec.ts | 50 | start |
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 237 | create |
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 239 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 50 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 167 | get |
| session | apps/dsh-desktop/test/manual-compaction.test.mjs | 81 | create |
| session | packages/dsh-aionui-panel/src/index.ts | 50 | get |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 99 | create |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 285 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 81 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 154 | get |
| session | packages/dsh-live-stats/tests/projection.spec.ts | 32 | create |
| session | packages/dsh-memory/src/index.ts | 145 | list |
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
| session | packages/dsh-user-scope/src/index.ts | 383 | list |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 77 | create |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 103 | create |
| session | packages/dsh-user-scope/tests/lifecycle.spec.ts | 121 | create |
| session | packages/dsh-value-mode/src/core/state.ts | 41 | get |
| session | scripts/dsh-candidate-execution.mjs | 91 | get |
| session | scripts/dsh-candidate-execution.mjs | 160 | subscribe |
| session | scripts/dsh-candidate-execution.mjs | 161 | prompt |
| slot | packages/dsh-aionui-panel/src/client/index.ts | 113 | conversation.input.dock |
| slot | packages/dsh-chat-artifacts/src/client/index.ts | 32 | tool.call.toolview |
| slot | packages/dsh-git-graph/src/client/index.ts | 202 | conversation.input.selector.context |
| slot | packages/dsh-git-graph/src/client/index.ts | 211 | conversation.input.dock |
| slot | packages/dsh-live-stats/src/client/index.ts | 79 | web-ui.plugin.item |
| slot | packages/dsh-live-stats/src/client/index.ts | 91 | conversation.composer.dock |
| slot | packages/dsh-memory/src/client/index.ts | 51 | web-ui.plugin.item |
| slot | packages/dsh-memory/src/client/index.ts | 61 | conversation.session.header.actions |
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
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 97 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 105 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 115 | model-preferences.onboarding |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 122 | web-ui.plugin.item |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 129 | sidebar.footer.action |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 144 | root |
| slot | packages/skins/skin-center/src/client/index.ts | 101 | web-ui.plugin.item |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 217 | list |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 227 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 228 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 326 | create |
| workspace | gallery/bundles.js | 7 | list |
| workspace | gallery/bundles.js | 13 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 305 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.tsx | 4 | list |
| workspace | packages/dsh-web-ui-settings/src/client/ProjectDialog.tsx | 60 | create |
| workspace | packages/skins/ths/src/client/index.ts | 175 | list |
| workspace | packages/skins/trading/src/client/index.ts | 328 | list |

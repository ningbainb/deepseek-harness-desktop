# Desktop 2.5 DSH coupling audit

Authoritative Desktop version: 5.3.5.

Stable DSH package version: 0.2.2-rc.5.

Lockfile SHA-256: `afaab805bfff8055ea34407cf07f7131df5ec9935ac07fde432dac001787ed96`.

Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.

## Classification summary

| Classification | Count |
| --- | ---: |
| public-stable | 358 |
| public-experimental | 192 |
| compatibility-patch | 50 |
| private-high-risk | 0 |

## Direct imports, dynamic imports, and requires

| File | Line | Kind | Specifier | Type-only | Classification | Controlled |
| --- | ---: | --- | --- | --- | --- | --- |
| apps/dsh-desktop/scripts/conversation-history-fixture.mjs | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/scripts/conversation-history-fixture.mjs | 4 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-sidebar-installed-profile.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-sidebar-package-pipeline.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-window-chrome.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-window-chrome.mjs | 10 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 10 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/src/atomic-write-adapter.mjs | 1 | static-export | @deepseek-ai/dsh-atomic-write | no | public-stable | yes |
| apps/dsh-desktop/src/runtime-community-index.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/src/runtime-config-editor.mjs | 1 | static-import | @deepseek-ai/dsh-config-editor | no | public-stable | no |
| apps/dsh-desktop/src/runtime-config-identity.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 20 | static-import | @deepseek-ai/dsh-cmdline | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 21 | static-import | @deepseek-ai/dsh-http-proxy | no | public-stable | no |
| apps/dsh-desktop/src/runtime-launcher.mjs | 22 | static-import | @deepseek-ai/dsh-launch-environment | no | public-stable | no |
| apps/dsh-desktop/src/runtime-legacy-settings.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/src/runtime-legacy-settings.mjs | 8 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| apps/dsh-desktop/src/runtime-market-team-compat.mjs | 1 | static-import | @deepseek-ai/dsh-agent | no | public-stable | no |
| apps/dsh-desktop/src/runtime-subagent-list-compat.mjs | 1 | static-import | @deepseek-ai/dsh-scope | no | public-stable | yes |
| apps/dsh-desktop/src/skill-market-sdk-adapter.mjs | 1 | static-export | @deepseek-ai/dsh-app-boot | no | public-stable | yes |
| apps/dsh-desktop/src/skill-market-sdk-adapter.mjs | 2 | static-export | @deepseek-ai/dsh-home-paths | no | public-stable | yes |
| apps/dsh-desktop/test/conversation-history-fixture.test.mjs | 29 | dynamic-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/conversation-import/session-bridge-transaction.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/conversation-import/transcript-protocol-events.test.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 1 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 11 | static-import | @deepseek-ai/dsh-scope | no | public-stable | no |
| apps/dsh-desktop/test/fixtures/verify-legacy-user-snapshot.mjs | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 1 | static-import | @deepseek-ai/dsh-command-compact | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 6 | static-import | @deepseek-ai/dsh-compaction-basic | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 7 | static-import | @deepseek-ai/dsh-compaction | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 13 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 19 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 20 | static-import | @deepseek-ai/dsh-session-projection | no | public-stable | no |
| apps/dsh-desktop/test/manual-compaction.test.mjs | 21 | static-import | @deepseek-ai/dsh-token-meter | no | public-stable | no |
| apps/dsh-desktop/test/packaged-runtime-sdk-identity.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/packaged-runtime-sdk-identity.test.mjs | 19 | static-export | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/packaged-runtime-sdk-identity.test.mjs | 51 | static-export | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/packaged-runtime-sdk-identity.test.mjs | 53 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-agent-team-migration.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-client-hmr.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-community-index.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-config-editor.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-legacy-settings.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-permission-presets.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-profile-composition.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/runtime-profile-recovery-order.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| apps/dsh-desktop/test/sidebar-runtime-compatibility.test.mjs | 1 | static-import | @deepseek-ai/dsh-app-boot | no | public-stable | no |
| packages/dsh-aionui-panel/src/client/current-session.ts | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-aionui-panel/src/client/current-session.ts | 2 | static-import | @deepseek-ai/dsh-session/types | yes | public-stable | no |
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
| packages/dsh-chat-artifacts/tests/tool.spec.ts | 7 | static-import | @deepseek-ai/dsh-tool-executor-native | no | public-stable | no |
| packages/dsh-desktop-client-hmr/src/client/bridge.ts | 1 | static-import | @deepseek-ai/dsh-client-modules/client | yes | public-experimental | no |
| packages/dsh-desktop-client-hmr/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-modules/client | yes | public-experimental | no |
| packages/dsh-desktop-client-hmr/src/index.ts | 1 | static-import | @deepseek-ai/dsh-client-connection | yes | public-stable | no |
| packages/dsh-desktop-client-hmr/src/index.ts | 6 | static-import | @deepseek-ai/dsh-client-modules | yes | public-stable | no |
| packages/dsh-desktop-client-hmr/src/index.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-desktop-compat/src/agent-wsl-tool.ts | 1 | static-import | @deepseek-ai/dsh-agent | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/agent-wsl-tool.ts | 6 | static-import | @deepseek-ai/dsh-tools | no | compatibility-patch | yes |
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
| packages/dsh-desktop-compat/src/session-checkpoint-recovery.ts | 1 | static-import | @deepseek-ai/dsh-session-persistence | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/session-checkpoint-recovery.ts | 2 | static-import | @deepseek-ai/dsh-session-projection-cache | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/session-checkpoint-recovery.ts | 3 | static-import | @deepseek-ai/dsh-session | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/session-recovery.ts | 1 | static-import | @deepseek-ai/dsh-session-format-catalog | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/session-recovery.ts | 3 | static-import | @deepseek-ai/dsh-session-persistence | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/session-title-checkpoint.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/session-title-checkpoint.ts | 3 | static-import | @deepseek-ai/dsh-session-projection-cache | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 3 | static-import | @deepseek-ai/dsh-llm/brand | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/tool-call-normalization.ts | 4 | static-import | @deepseek-ai/dsh-tools | no | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/transcript-balance.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/src/workspace-file-open-route.ts | 9 | static-import | @deepseek-ai/dsh-workspace | yes | compatibility-patch | yes |
| packages/dsh-desktop-compat/tests/background-scheduler-runner.spec.ts | 1 | static-import | @deepseek-ai/dsh-agent | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/background-scheduler-runner.spec.ts | 3 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 5 | static-import | @deepseek-ai/dsh-session | yes | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 6 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/legacy-subagent-recovery.spec.ts | 1 | static-import | @deepseek-ai/dsh-session-format-catalog | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/legacy-subagent-recovery.spec.ts | 8 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/session-checkpoint-recovery.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/session-checkpoint-recovery.spec.ts | 4 | static-import | @deepseek-ai/dsh-llm | no | compatibility-patch | no |
| packages/dsh-desktop-compat/tests/session-title-checkpoint.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | compatibility-patch | no |
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
| packages/dsh-git-graph/tests/client.spec.tsx | 11 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-liangshen/src/index.ts | 17 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-liangshen/src/preset-registry.ts | 1 | static-import | @deepseek-ai/dsh-agent-preset-registry | yes | public-stable | no |
| packages/dsh-liangshen/src/preset-registry.ts | 6 | static-import | @deepseek-ai/dsh-agent-preset-registry | yes | public-stable | no |
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
| packages/dsh-live-stats/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-token-meter/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-live-stats/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-live-stats/src/estimator.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/src/estimator.ts | 2 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 1 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 3 | static-import | @deepseek-ai/dsh-session-projection | yes | public-stable | no |
| packages/dsh-live-stats/src/index.ts | 5 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
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
| packages/dsh-live-stats/tests/projection.spec.ts | 9 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 10 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 11 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-live-stats/tests/projection.spec.ts | 12 | static-import | @deepseek-ai/dsh-session-projection | no | public-stable | no |
| packages/dsh-live-stats/tests/routes.spec.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-live-stats/tests/tps-line.spec.tsx | 3 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemoryActivityPanel.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/MemorySettingsCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-memory/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-memory/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-memory/src/core/query.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-memory/src/core/query.ts | 2 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
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
| packages/dsh-mode-switcher/src/client/runtime-adapter.ts | 5 | static-import | @deepseek-ai/dsh-session/types | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/BaiModelAccess.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelPreferencesCard.tsx | 5 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/ModelSelect.tsx | 22 | dynamic-import | @deepseek-ai/dsh-client-ui-settings/client | no | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-settings-models/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 5 | static-import | @deepseek-ai/dsh-client-ui-commands/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 6 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 9 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-model-preferences/src/client/model-projection.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/client/persist-config.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | yes |
| packages/dsh-model-preferences/src/core/config.ts | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-model-preferences/src/core/config.ts | 6 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-model-preferences/tests/composer-bai-policy.spec.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-model-preferences/tests/projection.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/ParticleThemeSettingsCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/controller.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-particle-theme/src/client/index.ts | 9 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-particle-theme/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-particle-theme/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/tests/controller.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-particle-theme/tests/settings-card.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/PersonalPromptCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/PersonalPromptCard.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 4 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 5 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/index.ts | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-personal-prompt/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-personal-prompt/src/client/persist-config.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | yes |
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
| packages/dsh-pet/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-pet/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-pet/src/client/index.ts | 23 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
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
| packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 4 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 5 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 6 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-release-plugin-adapter/src/index.ts | 1 | static-import | @deepseek-ai/dsh-client-connection | yes | public-stable | no |
| packages/dsh-release-plugin-adapter/src/index.ts | 3 | static-import | @deepseek-ai/dsh-client-connection | yes | public-stable | no |
| packages/dsh-release-plugin-adapter/tests/route.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-connection | yes | public-stable | no |
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
| packages/dsh-remote-web-ui/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-client-ui-sidebar/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 23 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 24 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 25 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/index.ts | 26 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/client/settings-form.ts | 11 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-remote-web-ui/src/client/settings-form.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/src/index.ts | 11 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/index.ts | 16 | static-import | @deepseek-ai/dsh-api-gateway | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/index.ts | 18 | static-import | @deepseek-ai/dsh-client-connection | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/index.ts | 19 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-contract.ts | 3 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-contract.ts | 11 | static-import | @deepseek-ai/dsh-api-workspace-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 3 | static-import | @deepseek-ai/dsh-api-gateway | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 4 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 9 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-gateway.ts | 20 | static-import | @deepseek-ai/dsh-api-workspace-controller/types | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/mobile-routes.ts | 11 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/register-routes.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/routes.ts | 11 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/src/startup.ts | 12 | static-import | @deepseek-ai/dsh-cmdline | no | public-stable | no |
| packages/dsh-remote-web-ui/src/tunnel.ts | 15 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-remote-web-ui/src/update-routes.ts | 8 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/host-route-ownership.spec.ts | 2 | static-import | @deepseek-ai/dsh-client-connection | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/host-route-ownership.spec.ts | 6 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-api.spec.ts | 7 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-gateway-peer.spec.ts | 1 | static-import | @deepseek-ai/dsh-client-connection | no | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-gateway-peer.spec.ts | 3 | static-import | @deepseek-ai/dsh-api-gateway | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-gateway-projections.spec.ts | 1 | static-import | @deepseek-ai/dsh-api-gateway | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-isolation.spec.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/mobile-routes.spec.ts | 2 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/register-routes.spec.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-remote-web-ui/tests/remote-entry.spec.tsx | 3 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/tests/remote-entry.spec.tsx | 6 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-remote-web-ui/tests/remote-entry.spec.tsx | 7 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
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
| packages/dsh-task-board/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-workspace/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-api-workspace-controller/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-session/types | yes | public-stable | no |
| packages/dsh-task-board/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-task-board/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 24 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-task-board/src/client/index.ts | 26 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
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
| packages/dsh-tool-describe-image/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 19 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 20 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 21 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-tool-describe-image/src/client/index.ts | 22 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
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
| packages/dsh-tool-describe-image/tests/loader-composition.spec.ts | 17 | static-import | @deepseek-ai/dsh-tool-executor-native | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 3 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 10 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 11 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/settings.spec.ts | 12 | static-import | @deepseek-ai/dsh-tool-executor-native | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 7 | static-import | @deepseek-ai/dsh-attachment | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 8 | static-import | @deepseek-ai/dsh-attachment | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 9 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 10 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 19 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 20 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/tool.spec.ts | 21 | static-import | @deepseek-ai/dsh-tool-executor-native | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/vision-cache.spec.ts | 3 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/vision-cache.spec.ts | 9 | static-import | @deepseek-ai/dsh-system-prompt | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/vision-cache.spec.ts | 10 | static-import | @deepseek-ai/dsh-tools | no | public-stable | no |
| packages/dsh-tool-describe-image/tests/vision-cache.spec.ts | 11 | static-import | @deepseek-ai/dsh-tool-executor-native | no | public-stable | no |
| packages/dsh-user-scope/src/index.ts | 1 | static-import | @deepseek-ai/dsh-session | yes | public-stable | no |
| packages/dsh-user-scope/src/index.ts | 4 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-user-scope/src/store.ts | 1 | static-import | @deepseek-ai/dsh-home-paths | no | public-stable | no |
| packages/dsh-user-scope/src/store.ts | 4 | static-import | @deepseek-ai/dsh-atomic-write | no | public-stable | no |
| packages/dsh-user-scope/tests/lifecycle.spec.ts | 1 | static-import | @deepseek-ai/dsh-session | no | public-stable | no |
| packages/dsh-user-scope/tests/lifecycle.spec.ts | 6 | static-import | @deepseek-ai/dsh-workspace | yes | public-stable | no |
| packages/dsh-value-mode/src/client/ModelPicker.tsx | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 6 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 11 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 12 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-value-mode/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/model-catalog.ts | 1 | static-import | @deepseek-ai/dsh-api-remotes/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/client/model-catalog.ts | 3 | static-import | @deepseek-ai/dsh-client-connection/client | yes | public-experimental | no |
| packages/dsh-value-mode/src/core/expert.ts | 1 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-value-mode/src/core/expert.ts | 3 | static-import | @deepseek-ai/dsh-llm | no | public-stable | no |
| packages/dsh-value-mode/src/core/model-selection.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/src/core/routed-call.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 15 | static-import | @deepseek-ai/dsh-system-prompt | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 16 | static-import | @deepseek-ai/dsh-tools | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 17 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-value-mode/src/index.ts | 18 | static-import | @deepseek-ai/dsh-agent | yes | public-stable | no |
| packages/dsh-value-mode/src/preset-registry.ts | 1 | static-import | @deepseek-ai/dsh-agent-preset-registry | yes | public-stable | no |
| packages/dsh-value-mode/src/preset-registry.ts | 6 | static-import | @deepseek-ai/dsh-agent-preset-registry | yes | public-stable | no |
| packages/dsh-value-mode/tests/routing.spec.ts | 1 | static-import | @deepseek-ai/dsh-llm | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 15 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 18 | static-import | @deepseek-ai/dsh-settings | no | public-stable | no |
| packages/dsh-web-ui-settings/src/bridge.ts | 19 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/chatgpt-auth-routes.ts | 1 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 1 | static-import | @deepseek-ai/dsh-authorization | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/chatgpt-auth.ts | 7 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | yes |
| packages/dsh-web-ui-settings/src/client/CommunityPluginsSettingsCard.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/DockPluginOptions.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
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
| packages/dsh-web-ui-settings/src/client/desktop-extension-dock.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-plugin-market/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/desktop-preset-navigation.ts | 1 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | yes |
| packages/dsh-web-ui-settings/src/client/dock-slot-mirror.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/dock-slot-mirror.tsx | 3 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 8 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 13 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 15 | static-import | @deepseek-ai/dsh-client-ui-settings-models/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 17 | static-import | @deepseek-ai/dsh-client-ui-model-selection/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/relay-auth-failures.ts | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/relay-send-guard.ts | 1 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/relay-send-guard.ts | 2 | static-import | @deepseek-ai/dsh-api-session-controller/types | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/client/relay-send-guard.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/src/client/settings-sdk-adapter.ts | 1 | static-export | @deepseek-ai/dsh-client-store | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/client/settings-sdk-adapter.ts | 2 | static-export | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/client/settings-sdk-adapter.ts | 3 | static-export | @deepseek-ai/dsh-client-ui-renderer/client | yes | public-experimental | yes |
| packages/dsh-web-ui-settings/src/custom-provider-key-sdk-adapter.ts | 1 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/custom-provider-key-sdk-adapter.ts | 3 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | yes |
| packages/dsh-web-ui-settings/src/index.ts | 13 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/index.ts | 18 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/index.ts | 19 | static-import | @deepseek-ai/dsh-cmdline | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-default-on-ready.ts | 1 | static-import | @deepseek-ai/dsh-cmdline | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 11 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 13 | static-import | @deepseek-ai/dsh-credentials | no | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 14 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/src/relay-routes.ts | 15 | static-import | @deepseek-ai/dsh-host-webserver | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 7 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/bridge.spec.ts | 10 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/community-settings.spec.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/compat-scope.spec.ts | 12 | static-import | @deepseek-ai/dsh-client-store | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/dock-plugin-options.spec.tsx | 2 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/dock-slot-mirror.spec.tsx | 1 | static-import | @deepseek-ai/dsh-client-ui-slots | no | public-stable | no |
| packages/dsh-web-ui-settings/tests/dock-slot-mirror.spec.tsx | 4 | static-import | @deepseek-ai/dsh-client-store | no | public-stable | no |
| packages/dsh-web-ui-settings/tests/relay-auth-failures.spec.ts | 2 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/relay-routes.spec.ts | 1 | static-import | @deepseek-ai/dsh-credentials | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/relay-routes.spec.ts | 5 | static-import | @deepseek-ai/dsh-settings | yes | public-stable | no |
| packages/dsh-web-ui-settings/tests/relay-send-guard.spec.ts | 2 | static-import | @deepseek-ai/dsh-api-session-controller/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/relay-send-guard.spec.ts | 3 | static-import | @deepseek-ai/dsh-client-ui-conversation/client | yes | public-experimental | no |
| packages/dsh-web-ui-settings/tests/settings-sdk-adapter.ts | 1 | static-export | @deepseek-ai/dsh-client-ui-slots | no | public-stable | yes |
| packages/dsh-web-ui-settings/tests/settings-sdk-adapter.ts | 2 | static-export | @deepseek-ai/dsh-client-store | no | public-stable | yes |
| packages/skins/skin-center/src/client/SkinCenter.tsx | 11 | static-import | @deepseek-ai/dsh-client-ui-slots | yes | public-stable | no |
| packages/skins/skin-center/src/client/SkinCenter.tsx | 13 | static-import | @deepseek-ai/dsh-client-ui-theme/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/background.ts | 16 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 10 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 14 | static-import | @deepseek-ai/dsh-client-ui-theme/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 16 | static-import | @deepseek-ai/dsh-client-locale/client | yes | public-experimental | no |
| packages/skins/skin-center/src/client/index.ts | 18 | static-import | @deepseek-ai/dsh-client-ui-settings/client | yes | public-experimental | no |
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
| host-service | apps/dsh-desktop/scripts/release-plugins-host-fixture.mjs | 6 | localhost |
| host-service | apps/dsh-desktop/scripts/sidebar-ledger-diagnostic-fixture.mjs | 92 | buffered |
| host-service | apps/dsh-desktop/scripts/skill-market-probe-fixture.mjs | 19 | loader |
| host-service | apps/dsh-desktop/scripts/skill-market-probe-fixture.mjs | 48 | exact |
| host-service | apps/dsh-desktop/scripts/workspace-state-probe-fixture.mjs | 15 | exact |
| host-service | apps/dsh-desktop/src/runtime-browser-component.mjs | 8 | browser |
| host-service | apps/dsh-desktop/src/runtime-provider.mjs | 283 | host-service.register |
| host-service | apps/dsh-desktop/src/runtime-subagent-list-compat.mjs | 7 | loader |
| host-service | apps/dsh-desktop/test/runtime-provider.test.mjs | 176 | task-board |
| host-service | packages/dsh-aionui-panel/src/client/index.ts | 47 | locale |
| host-service | packages/dsh-aionui-panel/src/index.ts | 29 | subprocess |
| host-service | packages/dsh-chat-artifacts/src/client/index.ts | 28 | locale |
| host-service | packages/dsh-chat-artifacts/src/index.ts | 51 | tools |
| host-service | packages/dsh-desktop-client-hmr/src/client/index.ts | 6 | modules |
| host-service | packages/dsh-desktop-client-hmr/src/index.ts | 13 | connection |
| host-service | packages/dsh-desktop-compat/src/index.ts | 28 | sessions |
| host-service | packages/dsh-git-graph/src/client/index.ts | 83 | locale |
| host-service | packages/dsh-git-graph/src/index.ts | 27 | subprocess |
| host-service | packages/dsh-git-graph/src/invariant.ts | 16 | invariants |
| host-service | packages/dsh-liangshen/presets/liangshen/tool-bootstrap.mjs | 34 | tools |
| host-service | packages/dsh-live-stats/src/client/index.ts | 69 | remote |
| host-service | packages/dsh-live-stats/src/index.ts | 17 | live-stats |
| host-service | packages/dsh-live-stats/src/invariant.ts | 14 | invariants |
| host-service | packages/dsh-memory/src/client/index.ts | 34 | locale |
| host-service | packages/dsh-memory/src/index.ts | 31 | tools |
| host-service | packages/dsh-mode-switcher/src/client/index.ts | 11 | conversation |
| host-service | packages/dsh-model-preferences/src/client/index.ts | 65 | sessions |
| host-service | packages/dsh-model-preferences/src/index.ts | 7 | settings |
| host-service | packages/dsh-particle-theme/src/client/index.ts | 33 | object |
| host-service | packages/dsh-personal-prompt/src/client/index.ts | 36 | locale |
| host-service | packages/dsh-personal-prompt/src/index.ts | 23 | sessions |
| host-service | packages/dsh-pet/src/client/index.ts | 76 | remote |
| host-service | packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 53 | locale |
| host-service | packages/dsh-release-plugin-adapter/src/index.ts | 7 | connection |
| host-service | packages/dsh-remote-web-ui/src/client/index.ts | 100 | workspaces |
| host-service | packages/dsh-remote-web-ui/src/index.ts | 62 | connection |
| host-service | packages/dsh-remote-web-ui/src/invariant.ts | 14 | invariants |
| host-service | packages/dsh-ssh/src/client/index.ts | 36 | locale |
| host-service | packages/dsh-ssh/src/index.ts | 26 | tools |
| host-service | packages/dsh-task-board/src/client/index.ts | 94 | remote |
| host-service | packages/dsh-tool-describe-image/src/client/index.ts | 66 | locale |
| host-service | packages/dsh-tool-describe-image/src/index.ts | 28 | tools |
| host-service | packages/dsh-value-mode/src/client/index.ts | 60 | remote.session |
| host-service | packages/dsh-value-mode/src/index.ts | 47 | llm |
| host-service | packages/dsh-web-ui-settings/src/client/index.ts | 101 | remote |
| host-service | packages/skins/skin-center/src/client/index.ts | 66 | remote |
| profile-home | apps/dsh-desktop/scripts/bai-host-probe.mjs | 15 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/capture-all-surfaces.mjs | 157 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/scripts/installed-upgrade-state-fixture.mjs | 225 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/measure-packaged-memory.mjs | 86 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 6 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 35 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 38 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 43 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 44 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/measure-profile.mjs | 50 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/measure-session-startup.mjs | 179 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/measure-startup-fps.mjs | 23 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/packaged-smoke-runner.mjs | 226 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/preset-deep-link-runner.mjs | 65 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/release-plugins-host-fixture.mjs | 43 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/release-plugins-host-fixture.mjs | 63 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/sidebar-ledger-diagnostic-fixture.mjs | 3 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/sidebar-ledger-diagnostic-fixture.mjs | 83 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/skill-market-probe-fixture.mjs | 3 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/skill-market-probe-fixture.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-account-skin-chrome.mjs | 54 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-agent-wsl-real.mjs | 20 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-agent-wsl-real.mjs | 21 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-agent-wsl-real.mjs | 75 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-agent-wsl-real.mjs | 76 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-background-residency.mjs | 94 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-bai-onboarding.mjs | 35 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-beta-usability.mjs | 110 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-context-prompt-customizer.mjs | 53 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-control-approval.mjs | 93 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 30 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 136 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 427 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-scroll.mjs | 432 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-conversation-skills.mjs | 68 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 10 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 48 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 158 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-directory-picker.mjs | 61 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-discovery-surfaces.mjs | 82 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-dock-clarity.mjs | 31 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-dock-model-catalog.mjs | 41 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-dock-settings.mjs | 155 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 9 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 9 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 9 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 112 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 112 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-history-host-performance.mjs | 113 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-large-legacy-history.mjs | 14 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-large-legacy-history.mjs | 41 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-large-legacy-history.mjs | 221 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-native-plugin-pages.mjs | 32 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-native-settings-interactions.mjs | 47 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-agent-work.mjs | 317 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-agent-work.mjs | 427 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-browser-component.mjs | 121 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-browser-component.mjs | 156 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-browser-component.mjs | 170 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-browser-component.mjs | 299 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-image-drop.mjs | 415 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-local-lan-gateway.mjs | 80 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-model-preferences.mjs | 73 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-orphaned-managed-link.mjs | 57 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-personalization.mjs | 62 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-release-browser.mjs | 205 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-release-browser.mjs | 461 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-release-browser.mjs | 633 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-remote-lan.mjs | 68 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-packaged-ssh.mjs | 67 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-particle-theme.mjs | 45 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-options.mjs | 38 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 16 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 80 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs | 116 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-preset-export.mjs | 34 | DSH_HOME |
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
| profile-home | apps/dsh-desktop/scripts/verify-proxy-routing.mjs | 91 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-release-installer.mjs | 293 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-release-plugins.mjs | 12 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-release-plugins.mjs | 160 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-release-plugins.mjs | 314 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 6 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 6 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 58 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 58 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 66 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 7 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 7 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 7 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 17 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 18 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 42 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 139 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-provider.mjs | 139 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-settings-reload.mjs | 212 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-settings-reload.mjs | 215 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-settings-reload.mjs | 221 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/scripts/verify-runtime-settings-reload.mjs | 321 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-selected-balance.mjs | 45 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-settings-window.mjs | 70 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-footer.mjs | 211 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-installed-profile.mjs | 7 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-installed-profile.mjs | 13 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-installed-profile.mjs | 14 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-installed-profile.mjs | 16 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-installed-profile.mjs | 20 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-package-pipeline.mjs | 42 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-package-pipeline.mjs | 43 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-package-pipeline.mjs | 44 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-package-pipeline.mjs | 45 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-package-pipeline.mjs | 48 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-sidebar-package-pipeline.mjs | 48 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-skill-discovery.mjs | 52 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-skill-market.mjs | 43 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-skin-center.mjs | 67 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-star-prompt.mjs | 30 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-terminal.mjs | 105 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 80 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-update-shutdown.mjs | 143 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-window-chrome.mjs | 67 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-workshop-lifecycle.mjs | 79 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 72 | DSH_HOME |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 165 | profileDir |
| profile-home | apps/dsh-desktop/scripts/verify-workspace-relocation.mjs | 170 | profileDir |
| profile-home | apps/dsh-desktop/scripts/workspace-state-probe-fixture.mjs | 3 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/scripts/workspace-state-probe-fixture.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 115 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 127 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/automatic-repair-runner.mjs | 201 | profileDir |
| profile-home | apps/dsh-desktop/src/conversation-import/ledger.mjs | 15 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/desktop-data-location.mjs | 58 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/desktop-data-location.mjs | 58 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/desktop-data-location.mjs | 61 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 112 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 114 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 116 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 219 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 220 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 713 | runtimeHome |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 735 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1287 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1316 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1349 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1351 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1354 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1397 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1448 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1536 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1571 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1572 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1578 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1626 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1631 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1845 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1853 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 1856 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2545 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2599 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2631 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2695 | profileDir |
| profile-home | apps/dsh-desktop/src/electron-app.mjs | 2701 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 87 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 88 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 89 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 91 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 107 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 108 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 109 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 122 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 123 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 124 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1027 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1028 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1029 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1033 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1034 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1036 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1039 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1108 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1122 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1123 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1128 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1133 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1140 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1147 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1152 | profileDir |
| profile-home | apps/dsh-desktop/src/extension-ipc.mjs | 1163 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 129 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 131 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 131 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-compatibility.mjs | 132 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 275 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 276 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 276 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 276 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 277 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 277 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 278 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 279 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 282 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 433 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 487 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 487 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 495 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 501 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 504 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 509 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 537 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 596 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 596 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 671 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugin-staging.mjs | 671 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 284 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 285 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 297 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 300 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 312 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 313 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 429 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 430 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 433 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 435 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 436 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 511 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 526 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 574 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 587 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 587 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 622 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 622 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 635 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 637 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 714 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 733 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 748 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 778 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 785 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 787 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 801 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 822 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 824 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 838 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 854 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 858 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 893 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 979 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1025 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1026 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1063 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1063 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1067 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1068 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1071 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1078 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1083 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1157 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1157 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1161 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1162 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1165 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1171 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1180 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1188 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1243 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1310 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1310 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1330 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1335 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1357 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1368 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1374 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1380 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1384 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1391 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1450 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1494 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1494 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1537 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1538 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1547 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1556 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1573 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1626 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1629 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1639 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1686 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1693 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1711 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1721 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1749 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1772 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/plugins.mjs | 1778 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 168 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 169 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 170 | profileDir |
| profile-home | apps/dsh-desktop/src/extensions/qqbot.mjs | 172 | profileDir |
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
| profile-home | apps/dsh-desktop/src/profile.mjs | 676 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 694 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 718 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 719 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 719 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 720 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 722 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 726 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 727 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 727 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 728 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 731 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1068 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1099 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1340 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1346 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1408 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1410 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1435 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1460 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1461 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1462 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1463 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1472 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1474 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1496 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1497 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1517 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1560 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1578 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1591 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1606 | profileDir |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1658 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/src/profile.mjs | 1732 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/src/prompt-customizer-feature.mjs | 88 | profileDir |
| profile-home | apps/dsh-desktop/src/prompt-customizer-feature.mjs | 89 | profileDir |
| profile-home | apps/dsh-desktop/src/prompt-customizer-feature.mjs | 90 | profileDir |
| profile-home | apps/dsh-desktop/src/prompt-customizer-feature.mjs | 128 | profileDir |
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
| profile-home | apps/dsh-desktop/src/runtime-browser-component.mjs | 27 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-candidate-policy.mjs | 19 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-candidate-policy.mjs | 21 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-community-index.mjs | 111 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-community-index.mjs | 112 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 701 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-controller.mjs | 702 | DSH_PROFILE |
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
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 203 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 204 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 215 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-launcher.mjs | 221 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 224 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 228 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 229 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 230 | profileDir |
| profile-home | apps/dsh-desktop/src/runtime-provider.mjs | 231 | profileDir |
| profile-home | apps/dsh-desktop/src/skill-market-activation.mjs | 91 | profileDir |
| profile-home | apps/dsh-desktop/src/skill-market-activation.mjs | 96 | profileDir |
| profile-home | apps/dsh-desktop/src/skill-market-activation.mjs | 98 | DSH_HOME |
| profile-home | apps/dsh-desktop/src/skill-market-activation.mjs | 137 | ensureDesktopProfile |
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
| profile-home | apps/dsh-desktop/test/browser-component-preflight-carrier.test.mjs | 26 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/browser-component-preflight-carrier.test.mjs | 75 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/browser-preflight-installer.test.mjs | 22 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 14 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 14 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 14 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 19 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 41 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 107 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 140 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 141 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 175 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/desktop-data-location.test.mjs | 25 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/desktop-data-location.test.mjs | 123 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/desktop-data-location.test.mjs | 136 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/desktop-data-location.test.mjs | 150 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/desktop-v42-migration.test.mjs | 7 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/desktop-v42-migration.test.mjs | 105 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/desktop-v42-migration.test.mjs | 106 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 80 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1995 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1996 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1997 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 1998 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2021 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2022 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2023 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2043 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2044 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2045 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2072 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2084 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2087 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2124 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2125 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2126 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2138 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2139 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2150 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2165 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2166 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2167 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2183 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2184 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2199 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2200 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2214 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2215 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2242 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2260 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2271 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2281 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2314 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2315 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2321 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2330 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2333 | profileDir |
| profile-home | apps/dsh-desktop/test/extension-ipc.test.mjs | 2334 | profileDir |
| profile-home | apps/dsh-desktop/test/fixtures/context-suite-host.mjs | 28 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/context-suite-host.mjs | 34 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/context-suite-host.mjs | 41 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/context-suite-host.mjs | 42 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/context-suite-host.mjs | 73 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 7 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 8 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/fixtures/direct-start/probe-package/index.mjs | 15 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/installer-external-runtime-native.test.mjs | 39 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-finish-paths.test.mjs | 21 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-finish-paths.test.mjs | 48 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-finish-paths.test.mjs | 65 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-target-payload.test.mjs | 25 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-target-payload.test.mjs | 56 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-target-payload.test.mjs | 57 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-target-payload.test.mjs | 70 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/installer-target-payload.test.mjs | 199 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 23 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 25 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 29 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 37 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 40 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 52 | profileDir |
| profile-home | apps/dsh-desktop/test/isolated-linker-fixtures.test.mjs | 62 | profileDir |
| profile-home | apps/dsh-desktop/test/legacy-credential-compat.test.mjs | 120 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/market-team-runtime.test.mjs | 7 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/market-team-runtime.test.mjs | 7 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/market-team-runtime.test.mjs | 15 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/market-team-runtime.test.mjs | 17 | resolveDshCliPath |
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
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 110 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 111 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 113 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 117 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 120 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 122 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 122 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 123 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 124 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 137 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 141 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 166 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 167 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 171 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 176 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 192 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 194 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 198 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 203 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 217 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 219 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 220 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 221 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 242 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 244 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 248 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 252 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 255 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 256 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 261 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 265 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 271 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 287 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 288 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 300 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 304 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 306 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 308 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 320 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 321 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 354 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 355 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 367 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 373 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-manager-staging.test.mjs | 407 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 19 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 202 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 209 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 210 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 212 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 213 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 214 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 220 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 223 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 225 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 236 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 238 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 239 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 248 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 250 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 251 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 257 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 266 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 278 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 280 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 283 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 296 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 299 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 300 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 310 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 317 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 333 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 336 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 337 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 343 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 345 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 366 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 401 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 405 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 406 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 412 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 413 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 439 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 460 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 468 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 479 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 482 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 483 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 489 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 490 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 497 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 537 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 564 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 568 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 569 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 575 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 576 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 616 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 645 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 649 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 651 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 658 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 660 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 675 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 691 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 694 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 695 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 697 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 708 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 710 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 735 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 779 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 780 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 781 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 783 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 816 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 819 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 820 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 842 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 849 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 875 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 893 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 897 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 898 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 904 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 923 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 947 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 956 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 981 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1032 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1072 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1076 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1079 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1106 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1108 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1128 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1143 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1147 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1149 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1156 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1177 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1185 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1209 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1229 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1231 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1233 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1235 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1269 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1272 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1278 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1279 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1280 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1291 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1307 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1352 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1383 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1386 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1388 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1399 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1404 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-recovery.test.mjs | 1448 | profileDir |
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
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 140 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 154 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 158 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 160 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 162 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 171 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 172 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 176 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 177 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 178 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 180 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 195 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 208 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 208 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 219 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 228 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 231 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 231 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 238 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 238 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 244 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 245 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 257 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 257 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 267 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 267 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 279 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 299 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 302 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 305 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 311 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 312 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 328 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 328 | profileDir |
| profile-home | apps/dsh-desktop/test/plugin-staging.test.mjs | 334 | profileDir |
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
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 53 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 54 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 63 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 73 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 230 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 237 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 407 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 408 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 412 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 424 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 425 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 428 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 430 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 544 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 548 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 557 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 558 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 559 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 564 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 566 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 607 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 609 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 610 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 617 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 618 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 619 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 620 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 625 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 626 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 627 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 677 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 679 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 679 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 683 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 693 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 753 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 759 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 763 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 766 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 775 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 781 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 783 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 788 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 792 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 795 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 805 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 808 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 812 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 830 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 851 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 852 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 853 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 854 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 855 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 856 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 856 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 860 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 862 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 866 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 883 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 887 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 890 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 896 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 906 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 910 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 918 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 925 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 932 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 942 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 944 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 953 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 965 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 966 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 975 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 981 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 992 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 993 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 998 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1006 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1012 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1022 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1023 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1032 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1044 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1076 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1077 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1081 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1084 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1085 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1087 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1101 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1111 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1117 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1117 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1130 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1143 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1159 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1160 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1164 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1166 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1168 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1183 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1185 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1186 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1187 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1189 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1190 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1200 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1201 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1204 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1204 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1206 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1229 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1231 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1240 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1241 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1241 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1244 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1249 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1249 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1252 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1259 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1259 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1269 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1269 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1276 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1276 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1279 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1291 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1293 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1294 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1296 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1300 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1302 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1305 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1318 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1320 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1331 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1334 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1338 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1341 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1343 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1344 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1345 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1346 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1358 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1366 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1427 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1502 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1520 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1533 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1540 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1574 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1575 | profileDir |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1576 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1582 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/profile.test.mjs | 1590 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 6 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 15 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 16 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 20 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 30 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 30 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 32 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 56 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 60 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 91 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 111 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 118 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 142 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 145 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 150 | profileDir |
| profile-home | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 152 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 21 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 22 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 25 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 27 | profileDir |
| profile-home | apps/dsh-desktop/test/qqbot.test.mjs | 32 | profileDir |
| profile-home | apps/dsh-desktop/test/remote-profile-composition.test.mjs | 9 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/remote-profile-composition.test.mjs | 24 | ensureDesktopProfile |
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
| profile-home | apps/dsh-desktop/test/runtime-candidate-policy.test.mjs | 35 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/runtime-candidate-policy.test.mjs | 58 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/runtime-candidate-policy.test.mjs | 59 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/runtime-candidate-policy.test.mjs | 59 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/runtime-candidate-policy.test.mjs | 60 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/runtime-candidate-policy.test.mjs | 60 | DSH_HOME |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 28 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 31 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 32 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 33 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 34 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 47 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 49 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-config-editor.test.mjs | 57 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-controller.test.mjs | 590 | DSH_PROFILE |
| profile-home | apps/dsh-desktop/test/runtime-frontend-assets.test.mjs | 11 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-frontend-assets.test.mjs | 11 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-frontend-assets.test.mjs | 11 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/runtime-frontend-assets.test.mjs | 58 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/runtime-frontend-assets.test.mjs | 81 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-frontend-assets.test.mjs | 82 | resolveDshCliPath |
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
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 31 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 32 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 120 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 129 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 137 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 142 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 149 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 538 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 539 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 540 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 543 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 545 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 552 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 557 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 563 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 610 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 612 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integration.test.mjs | 713 | resolveDshCliPath |
| profile-home | apps/dsh-desktop/test/runtime-integrity-audit.test.mjs | 11 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-integrity-audit.test.mjs | 19 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-legacy-settings.test.mjs | 508 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-legacy-settings.test.mjs | 509 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-legacy-settings.test.mjs | 510 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-legacy-settings.test.mjs | 523 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-permission-presets.test.mjs | 138 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-permission-presets.test.mjs | 139 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-permission-presets.test.mjs | 140 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-permission-presets.test.mjs | 141 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-permission-presets.test.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-permission-presets.test.mjs | 156 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 53 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 129 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 135 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 222 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-provider.test.mjs | 236 | profileDir |
| profile-home | apps/dsh-desktop/test/runtime-settings-reload.test.mjs | 102 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/sdk-contracts.test.mjs | 9 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/sdk-contracts.test.mjs | 19 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/sdk-contracts.test.mjs | 42 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/session-preservation.test.mjs | 23 | profileDir |
| profile-home | apps/dsh-desktop/test/sidebar-terminal-routing.test.mjs | 7 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/sidebar-terminal-routing.test.mjs | 22 | resolveRuntimePackages |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 28 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 29 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 30 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 35 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 36 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 38 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 40 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 41 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 42 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 58 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 62 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 81 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 82 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 86 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 89 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 92 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 94 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 95 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 129 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 130 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 138 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 139 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 146 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 150 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 151 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 156 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 160 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 161 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 164 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 168 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 176 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 182 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 190 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 191 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 192 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 216 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 224 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 228 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 244 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 249 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 251 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 259 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 263 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market-activation.test.mjs | 265 | profileDir |
| profile-home | apps/dsh-desktop/test/skill-market.test.mjs | 17 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/skill-market.test.mjs | 81 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/skill-market.test.mjs | 85 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/skill-market.test.mjs | 88 | ensureDesktopProfile |
| profile-home | apps/dsh-desktop/test/skill-market.test.mjs | 98 | ensureDesktopProfile |
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
| profile-home | packages/dsh-desktop-compat/src/agent-wsl-permission.ts | 21 | DSH_HOME |
| profile-home | packages/dsh-desktop-compat/src/agent-wsl-permission.ts | 21 | DSH_HOME |
| profile-home | packages/dsh-desktop-compat/src/agent-wsl-permission.ts | 23 | DSH_HOME |
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
| profile-home | packages/dsh-liangshen/src/index.ts | 54 | DSH_HOME |
| profile-home | packages/dsh-liangshen/src/index.ts | 57 | DSH_HOME |
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
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 371 | profileDir |
| profile-home | packages/dsh-remote-web-ui/src/index.ts | 371 | profileDir |
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
| profile-home | packages/dsh-task-board/src/index.ts | 78 | DSH_PROFILE |
| profile-home | packages/dsh-task-board/src/index.ts | 85 | DSH_PROFILE |
| profile-home | packages/dsh-task-board/src/index.ts | 108 | DSH_PROFILE |
| profile-home | packages/dsh-task-board/src/index.ts | 109 | DSH_HOME |
| profile-home | packages/dsh-value-mode/src/dsh-home.ts | 3 | DSH_HOME |
| profile-home | packages/dsh-value-mode/src/dsh-home.ts | 20 | DSH_HOME |
| profile-home | packages/dsh-value-mode/src/dsh-home.ts | 25 | DSH_HOME |
| profile-home | packages/dsh-web-ui-settings/src/client/generated/community.ts | 101 | DSH_HOME |
| profile-home | packages/dsh-web-ui-settings/src/client/generated/community.ts | 101 | DSH_HOME |
| profile-home | packages/dsh-web-ui-settings/src/client/generated/community.ts | 147 | DSH_HOME |
| profile-home | packages/dsh-web-ui-settings/src/client/generated/community.ts | 147 | DSH_HOME |
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
| runtime-lifecycle | apps/dsh-desktop/scripts/verify-runtime-pipe.mjs | 77 | start |
| runtime-lifecycle | apps/dsh-desktop/scripts/verify-runtime-settings-reload.mjs | 233 | start |
| runtime-lifecycle | apps/dsh-desktop/scripts/verify-runtime-settings-reload.mjs | 292 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1262 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 1847 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2197 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2529 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2531 | start |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 2546 | recover |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 3048 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/electron-app.mjs | 3054 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 420 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 439 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 1127 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 1141 | start |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 1337 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/extension-ipc.mjs | 1339 | start |
| runtime-lifecycle | apps/dsh-desktop/src/menu.mjs | 81 | restart |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 916 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 924 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1034 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1045 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1054 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1067 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1087 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1096 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1110 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1148 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1154 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1164 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1174 | stop |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1180 | start |
| runtime-lifecycle | apps/dsh-desktop/src/plugin-recovery.mjs | 1185 | start |
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
| runtime-lifecycle | apps/dsh-desktop/test/custom-presets-runtime.test.mjs | 143 | start |
| runtime-lifecycle | apps/dsh-desktop/test/install-recovery.test.mjs | 24 | start |
| runtime-lifecycle | apps/dsh-desktop/test/market-team-runtime.test.mjs | 18 | start |
| runtime-lifecycle | apps/dsh-desktop/test/packaged-release-browser-readiness.test.mjs | 87 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/packaged-release-browser-readiness.test.mjs | 94 | start |
| runtime-lifecycle | apps/dsh-desktop/test/packaged-release-browser-readiness.test.mjs | 110 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/prompt-customizer-feature.test.mjs | 34 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 139 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 140 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 167 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 168 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 192 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 193 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 501 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 512 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 522 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 584 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 607 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 629 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 670 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 712 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 718 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 720 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 728 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 745 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 784 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 832 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 865 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 873 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 894 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 904 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 923 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 945 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 971 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 975 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 976 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 988 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1018 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1023 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1024 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1066 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1072 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1073 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1074 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1090 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1120 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1158 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1256 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1261 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1387 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-controller.test.mjs | 1390 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-frontend-assets.test.mjs | 85 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 569 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 618 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 711 | stop |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-integration.test.mjs | 720 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-shutdown-control.test.mjs | 120 | start |
| runtime-lifecycle | apps/dsh-desktop/test/runtime-shutdown-control.test.mjs | 132 | stop |
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
| runtime-lifecycle | apps/dsh-desktop/test/updater.test.mjs | 110 | start |
| runtime-lifecycle | packages/dsh-particle-theme/src/client/index.ts | 76 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 31 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 57 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 74 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 97 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 127 | start |
| runtime-lifecycle | packages/dsh-particle-theme/tests/controller.spec.ts | 162 | start |
| runtime-lifecycle | packages/dsh-task-board/src/client/index.ts | 228 | start |
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
| session | apps/dsh-desktop/scripts/release-plugins-host-fixture.mjs | 108 | create |
| session | apps/dsh-desktop/scripts/verify-describe-image-adaptation.mjs | 65 | create |
| session | apps/dsh-desktop/scripts/verify-release-installer.mjs | 75 | get |
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 227 | create |
| session | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 229 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 50 | get |
| session | apps/dsh-desktop/test/conversation-import/batch-service.test.mjs | 167 | get |
| session | apps/dsh-desktop/test/manual-compaction.test.mjs | 84 | create |
| session | apps/dsh-desktop/test/primary-control-approval.test.mjs | 28 | create |
| session | packages/dsh-aionui-panel/src/index.ts | 50 | get |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 99 | create |
| session | packages/dsh-desktop-compat/src/conversation-import-route.ts | 285 | get |
| session | packages/dsh-desktop-compat/src/session-checkpoint-recovery.ts | 55 | get |
| session | packages/dsh-desktop-compat/src/session-checkpoint-recovery.ts | 67 | get |
| session | packages/dsh-desktop-compat/src/session-title-checkpoint.ts | 16 | get |
| session | packages/dsh-desktop-compat/src/session-title-checkpoint.ts | 18 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 82 | get |
| session | packages/dsh-desktop-compat/tests/conversation-import-route.spec.ts | 155 | get |
| session | packages/dsh-live-stats/tests/projection.spec.ts | 33 | create |
| session | packages/dsh-memory/src/index.ts | 192 | list |
| session | packages/dsh-mode-switcher/src/client/mode-controller.ts | 114 | create |
| session | packages/dsh-mode-switcher/src/client/runtime-adapter.ts | 26 | create |
| session | packages/dsh-personal-prompt/src/index.ts | 117 | get |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 340 | create |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 374 | list |
| session | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 434 | prompt |
| session | packages/dsh-remote-web-ui/src/mobile/views/SessionListView.tsx | 9 | create |
| session | packages/dsh-remote-web-ui/tests/mobile-gateway-peer.spec.ts | 21 | list |
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
| slot | packages/dsh-aionui-panel/src/client/index.ts | 153 | conversation.input.dock |
| slot | packages/dsh-aionui-panel/src/client/native-browser.tsx | 49 | sidebar.right.pane.tab |
| slot | packages/dsh-aionui-panel/src/client/native-browser.tsx | 123 | conversation.input.left |
| slot | packages/dsh-aionui-panel/src/client/native-panels.tsx | 72 | sidebar.right.pane.tab |
| slot | packages/dsh-chat-artifacts/src/client/index.ts | 33 | tool.call.toolview |
| slot | packages/dsh-git-graph/src/client/index.ts | 204 | conversation.input.selector.context |
| slot | packages/dsh-git-graph/src/client/index.ts | 213 | conversation.input.dock |
| slot | packages/dsh-live-stats/src/client/index.ts | 85 | web-ui.plugin.item |
| slot | packages/dsh-live-stats/src/client/index.ts | 95 | conversation.composer.dock |
| slot | packages/dsh-memory/src/client/index.ts | 53 | web-ui.plugin.item |
| slot | packages/dsh-mode-switcher/src/client/index.ts | 34 | conversation.session.header.actions |
| slot | packages/dsh-model-preferences/src/client/index.ts | 124 | settings.models.footer |
| slot | packages/dsh-model-preferences/src/client/index.ts | 184 | conversation.input.model |
| slot | packages/dsh-particle-theme/src/client/index.ts | 81 | web-ui.plugin.item |
| slot | packages/dsh-personal-prompt/src/client/index.ts | 53 | web-ui.plugin.item |
| slot | packages/dsh-pet/src/client/index.ts | 134 | web-ui.plugin.item |
| slot | packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 83 | settings.section |
| slot | packages/dsh-release-plugin-adapter/src/client/adapter.tsx | 87 | conversation.composer.dock |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 124 | sidebar.remote |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 150 | sidebar.footer.action |
| slot | packages/dsh-remote-web-ui/src/client/index.ts | 176 | web-ui.plugin.item |
| slot | packages/dsh-task-board/src/client/index.ts | 124 | web-ui.plugin.item |
| slot | packages/dsh-tool-describe-image/src/client/index.ts | 99 | web-ui.plugin.item |
| slot | packages/dsh-value-mode/src/client/index.ts | 239 | web-ui.plugin.item |
| slot | packages/dsh-value-mode/src/client/index.ts | 262 | conversation.session.header.actions |
| slot | packages/dsh-web-ui-settings/src/client/desktop-native-settings.tsx | 218 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/desktop-native-settings.tsx | 223 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/desktop-preset-navigation.ts | 11 | conversation.input.right |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 178 | web-ui.plugin.item |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 183 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 191 | settings.section |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 201 | web-ui.plugin.item |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 211 | settings.models.footer |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 226 | settings.models.footer |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 232 | sidebar.footer.action |
| slot | packages/dsh-web-ui-settings/src/client/index.ts | 247 | root |
| slot | packages/skins/skin-center/src/client/index.ts | 104 | web-ui.plugin.item |
| slot | packages/skins/skin-center/src/client/index.ts | 112 | settings.section |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 207 | list |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 217 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 218 | create |
| workspace | apps/dsh-desktop/src/conversation-import/session-bridge.mjs | 316 | create |
| workspace | gallery/bundles.js | 7 | list |
| workspace | gallery/bundles.js | 13 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile-api-secure.ts | 310 | list |
| workspace | packages/dsh-remote-web-ui/src/mobile/views/WorkspaceView.tsx | 4 | list |
| workspace | packages/dsh-remote-web-ui/tests/mobile-gateway-peer.spec.ts | 22 | list |
| workspace | packages/dsh-web-ui-settings/src/client/ProjectDialog.tsx | 63 | create |
| workspace | packages/skins/ths/src/client/index.ts | 175 | list |
| workspace | packages/skins/trading/src/client/index.ts | 328 | list |

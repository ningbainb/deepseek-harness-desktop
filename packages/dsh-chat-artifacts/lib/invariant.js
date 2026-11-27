//#region src/invariant.ts
/** Stable package identity exposed to diagnostics and bundle tooling. */
const CHAT_ARTIFACTS_PLUGIN_ID = "@ningbainb/dsh-chat-artifacts";
/** Wire tool name owned by this plugin. */
const CHAT_ARTIFACTS_TOOL_NAME = "render_artifact";
/** Wire tool name for updating an existing artifact. */
const CHAT_ARTIFACTS_PATCH_TOOL_NAME = "patch_artifact";
//#endregion
export { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_PLUGIN_ID, CHAT_ARTIFACTS_TOOL_NAME };

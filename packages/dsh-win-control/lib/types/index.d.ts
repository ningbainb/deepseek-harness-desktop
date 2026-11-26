import type { Context } from '@deepseek-ai/cordis';
export { BRIDGE_ROW_ID, EXCLUDABLE_TOOLS, MIRROR_IDS, PACKAGE_ID, PINNED_WINDOWS_MCP_VERSION, ROUTE_PREFIX, SCREENSHOT_BACKENDS, SCREENSHOT_SCALES, defaultSettings, normalizeSettings, } from './core/settings.ts';
export { readSettings, resolveDshHome, writeSettingsAtomic, } from './host/settings-store.ts';
export type { WinControlSettings } from './core/settings.ts';
export { MIRROR_CANDIDATES, parseSimpleIndex, pickWheelEntry, probeMirrors } from './host/mirrors.ts';
export { PROBE_TIMEOUT_MS, UPSTREAM_UIA_ISSUE, describeProbe, parseProbeOutput, probeDesktop } from './host/desktop-probe.ts';
export { PROFILE_BLOCK_BEGIN, PROFILE_BLOCK_END, buildBridgeOverrideBlock, createToolchainInstaller, executableIn, listManagedVersions, managedExecutable, managedToolchainRoot, parseProcessLines, processesUnder, upsertBridgeOverride, } from './host/toolchain.ts';
export { BRIDGE_TOOL_PREFIX, DOCTOR_TOOL_NAME, REVEAL_TOOL_NAME, WinControlGate, collectBridgedCatalog, isBridgedToolName, } from './host/tool-gate.ts';
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map
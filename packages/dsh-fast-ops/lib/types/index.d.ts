import type { Context } from '@deepseek-ai/cordis';
export { INLINE_BYTE_OPTIONS, PACKAGE_ID, ROUTE_PREFIX, SETTINGS_FILE, TTL_MS_OPTIONS, defaultSettings, normalizeSettings, } from './core/settings.ts';
export type { FastOpsSettings } from './core/settings.ts';
export { readSettings, resolveDshHome, writeSettingsAtomic } from './host/settings-store.ts';
export { resolveSafeWorkspacePath, sha256Hex } from './host/workspace-path.ts';
export { ResultCache } from './host/result-cache.ts';
export { buildCompactDiff, diffPreview, editFilesBatch, parseDelimitedTable, readFilesBatch, readTableFile, replaceAcrossFiles, searchWorkspace, statFile, } from './host/file-ops.ts';
export { ALL_FAST_OPS_TOOLS, FAST_OPS_RESULTS_SERVICE, FastOpsController, RESIDENT_TOOLS, SPECIALIZED_TOOLS, type FastOpsResultsService, } from './host/tool-registry.ts';
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map
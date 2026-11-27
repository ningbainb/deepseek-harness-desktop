import type { FastOpsSettings } from '../core/settings.ts';
/** Produce a shorter projection only. The caller must retain original output before using it. */
export declare function denoiseCommandOutput(raw: string, command: string, settings: FastOpsSettings['denoise']): string | undefined;
//# sourceMappingURL=command-output.d.ts.map
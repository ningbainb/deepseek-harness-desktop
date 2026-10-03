import type { Context } from '@deepseek-ai/cordis';
export declare function parseWslDistributions(output: string): string[];
export declare function selectWslDistribution(installed: readonly string[], requested?: string): string;
export declare function createWslCommandArgs(distribution: string, command: string, workdir?: string): string[];
/** Register a separate, explicitly approved WSL tool; never replace the official sandboxed pwsh executor. */
export declare function installAgentWslTool(ctx: Context): void;

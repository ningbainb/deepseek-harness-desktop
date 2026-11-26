import { type FastOpsSettings } from '../core/settings.ts';
export declare function resolveDshHome(env?: NodeJS.ProcessEnv): string;
export declare function settingsFilePath(home?: string): string;
export declare function readSettings(home?: string): Promise<FastOpsSettings>;
export declare function writeSettingsAtomic(input: unknown, home?: string, platform?: NodeJS.Platform): Promise<{
    settings: FastOpsSettings;
    problems: string[];
}>;
//# sourceMappingURL=settings-store.d.ts.map
import { type WinControlSettings } from '../core/settings.ts';
export declare function resolveDshHome(env?: NodeJS.ProcessEnv): string;
export declare function settingsFilePath(home?: string): string;
export declare function readSettings(home?: string): Promise<WinControlSettings>;
export declare function writeSettingsAtomic(input: unknown, home?: string, platform?: NodeJS.Platform): Promise<{
    settings: WinControlSettings;
    problems: string[];
}>;
//# sourceMappingURL=settings-store.d.ts.map
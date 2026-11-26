import { type ImHubSettings } from '../core/settings.ts';
export declare function resolveDshHome(env?: NodeJS.ProcessEnv): string;
export declare function settingsFilePath(home?: string): string;
export declare function readSettings(home?: string): Promise<ImHubSettings>;
export declare function writeSettingsAtomic(input: unknown, home?: string, platform?: NodeJS.Platform): Promise<{
    settings: ImHubSettings;
    problems: string[];
}>;
//# sourceMappingURL=settings-store.d.ts.map
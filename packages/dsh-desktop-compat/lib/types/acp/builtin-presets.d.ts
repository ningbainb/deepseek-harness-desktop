import type { AcpAgentDefinition, AcpPresetDefinition } from './types.ts';
export declare const ANTIGRAVITY_ACP_AGENT: AcpPresetDefinition;
export declare const BUILTIN_ACP_PRESETS: readonly AcpPresetDefinition[];
export declare function getAcpPreset(id: string): AcpPresetDefinition | undefined;
interface LaunchResolutionOptions {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    managedPrefix?: string;
    commandOverride?: string;
    signal?: AbortSignal;
}
export interface ResolvedAcpLaunch {
    command: string;
    args: string[];
    fingerprint: string;
}
export declare function isWindowsNetworkPath(path: string, platform?: NodeJS.Platform): boolean;
export declare function resolveAcpLaunch(agent: AcpAgentDefinition, options?: LaunchResolutionOptions): Promise<ResolvedAcpLaunch | undefined>;
export declare function getAcpAuthHint(agentId: string, env?: NodeJS.ProcessEnv): Promise<'credentials-present' | undefined>;
export {};

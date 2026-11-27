import { spawn } from 'node:child_process';
import type { Context } from '@deepseek-ai/cordis';
import { ANTIGRAVITY_ACP_AGENT, BUILTIN_ACP_PRESETS, resolveAcpLaunch } from './builtin-presets.ts';
import type { AcpAgentDefinition, AcpInvocationSource, AcpMcpServerParam, AcpPermissionRequest, AcpPermissionResponse, AcpProbeResult, AcpSessionInfo, AcpStreamEvent } from './types.ts';
export declare class AcpComplianceError extends Error {
    constructor(message: string);
}
export { ANTIGRAVITY_ACP_AGENT, BUILTIN_ACP_PRESETS };
export declare function assertAcpUsageAllowed(agent: AcpAgentDefinition, invocationSource: AcpInvocationSource): void;
export interface AcpAgentManagerDeps {
    dshHome?: string;
    launch?: typeof spawn;
    resolveLaunch?: typeof resolveAcpLaunch;
}
export declare class AcpAgentManager {
    private readonly ctx;
    private readonly acpDir;
    private readonly agentsPath;
    private readonly sessionsPath;
    private readonly launch?;
    private readonly launchResolver;
    private readonly transcripts;
    private readonly probes;
    private customAgents;
    private persistedSessions;
    private sessionWrites;
    private activeSessions;
    private readonly startingSessions;
    private loading?;
    constructor(ctx: Context, deps?: AcpAgentManagerDeps);
    private ensureLoaded;
    private load;
    private principalId;
    sessionKey(sessionId: string): string;
    private saveCustomAgents;
    private saveSessions;
    listAgents(): Promise<AcpAgentDefinition[]>;
    getAgent(agentId: string): Promise<AcpAgentDefinition>;
    upsertCustomAgent(agent: Omit<AcpAgentDefinition, 'custom'>): Promise<AcpAgentDefinition>;
    removeCustomAgent(agentId: string): Promise<boolean>;
    listActiveSessions(): AcpSessionInfo[];
    getSessionInfo(sessionId: string): AcpSessionInfo | undefined;
    private resolveLaunch;
    probeAllAgents(opts?: {
        deep?: boolean;
        cwd?: string;
    }): Promise<AcpProbeResult[]>;
    probeAgent(agentId: string, opts?: {
        cwd?: string;
        commandOverride?: string;
        force?: boolean;
    }): Promise<AcpProbeResult>;
    private probeResolvedAgent;
    private runProbe;
    private bridgePermission;
    startSession({ agentId, cwd, dshSessionId, resume, invocationSource, mcpServers, commandOverride, authModeOverride, onPermissionRequest, onFsWriteApprove, allowSensitiveOptions, }: {
        agentId: string;
        cwd: string;
        dshSessionId?: string;
        resume?: boolean;
        invocationSource: AcpInvocationSource;
        mcpServers?: AcpMcpServerParam[];
        commandOverride?: string;
        authModeOverride?: AcpAgentDefinition['authMode'];
        onPermissionRequest?: (request: AcpPermissionRequest) => Promise<AcpPermissionResponse>;
        onFsWriteApprove?: (path: string, content: string) => Promise<boolean>;
        allowSensitiveOptions?: () => boolean;
    }): Promise<AcpSessionInfo>;
    setModel(sessionId: string, modelId: string): Promise<void>;
    setConfigOption(sessionId: string, configId: string, value: string): Promise<void>;
    private applyConfigOptions;
    assertPromptAllowed(sessionId: string, source: AcpInvocationSource): void;
    sendPrompt({ sessionId, text, invocationSource, signal, onEvent, }: {
        sessionId: string;
        text: string;
        invocationSource: AcpInvocationSource;
        signal?: AbortSignal;
        onEvent?: (event: AcpStreamEvent) => void;
    }): Promise<{
        stopReason: string;
    }>;
    cancelSession(sessionId: string): boolean;
    closeSession(sessionId: string): Promise<boolean>;
    dispose(): Promise<void>;
}

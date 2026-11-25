import type { Context } from '@deepseek-ai/cordis';
import { ConnectorSecretVault } from './secret-vault.ts';
import { type ConnectorCatalogEntry, type ConnectorDiagnosticResult, type ConnectorEnvironmentDiagnostic, type ConnectorInstallResult, type ConnectorLoginSession, type ConnectorRiskMatch, type ConnectorStateSnapshot, type ConnectorStatus } from './types.ts';
export interface LoginChildProcessLike {
    stdout?: {
        on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
    } | null;
    stderr?: {
        on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
    } | null;
    once(event: 'close', listener: (code: number | null) => void): unknown;
    once(event: 'error', listener: (error: Error) => void): unknown;
    kill?(signal?: NodeJS.Signals | number): boolean;
}
export interface ConnectorInstallRunnerSpec {
    connectorId: string;
    kind: 'npm' | 'github-release' | 'skill';
    target: string;
    managedDir: string;
    binary?: string;
    assetTemplates?: Record<string, string>;
}
export interface ConnectorRegistryDeps {
    dshHome?: string;
    platform?: NodeJS.Platform;
    probeCli?: (command: string, args: string[], timeoutMs: number, env?: NodeJS.ProcessEnv) => Promise<{
        ok: boolean;
        stdout: string;
        stderr: string;
    }>;
    installRunner?: (spec: ConnectorInstallRunnerSpec) => Promise<{
        ok: boolean;
        binaryPath?: string;
        version?: string;
        sourceUsed?: string;
        error?: string;
    }>;
    loginLauncher?: (command: string, args: string[], env: NodeJS.ProcessEnv) => LoginChildProcessLike;
    secretVault?: ConnectorSecretVault;
}
export declare function resolveConnectorsHome(explicitHome?: string): string;
export declare function unwrapWindowsCmdToNode(cmdPath: string): Promise<string | undefined>;
export declare function resolveDirectCommand(command: string, args: string[], env: NodeJS.ProcessEnv, platform?: NodeJS.Platform): Promise<{
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    shell: boolean;
}>;
export declare function ensureManagedNodeShim(homeDir: string, platform?: NodeJS.Platform, execPath?: string, isElectronRuntime?: boolean): Promise<string>;
export declare function withManagedBinPath(baseEnv: NodeJS.ProcessEnv, binDir: string, platform?: NodeJS.Platform): NodeJS.ProcessEnv;
export declare function resolveBundledPnpmCli(platform?: NodeJS.Platform): string | undefined;
export declare function classifyInstallError(rawError: string): {
    zh: string;
    en: string;
};
export declare function classifyConnectorFailure(entry: ConnectorCatalogEntry, rawError: string): {
    status: ConnectorStatus;
    friendlyCause: ConnectorDiagnosticResult['friendlyCause'];
    friendlyFix: ConnectorDiagnosticResult['friendlyFix'];
};
export declare class ConnectorRegistryService {
    private readonly ctx;
    private readonly homeDir;
    private readonly configPath;
    private readonly platform;
    private readonly probeCli;
    private readonly installRunner?;
    private readonly loginLauncher;
    private readonly secretVault;
    private readonly catalog;
    private persisted;
    private statuses;
    private diagnostics;
    private mcpDisposers;
    private loginSessions;
    private loginChildren;
    private skillControl?;
    private loaded;
    constructor(ctx: Context, deps?: ConnectorRegistryDeps);
    init(): Promise<void>;
    dispose(): void;
    private ensureLoaded;
    private saveConfig;
    private activeDriverFor;
    private getEntryOrThrow;
    private installSkillProvider;
    private installPromptSection;
    private reconcileActiveConnectors;
    private mountMcpIfApplicable;
    private unmountMcp;
    private connectedEntries;
    snapshot(): Promise<ConnectorStateSnapshot>;
    detectEnvironment(connectorId: string): Promise<ConnectorEnvironmentDiagnostic>;
    installConnector(connectorId: string): Promise<ConnectorInstallResult>;
    configure(connectorId: string, patch: {
        enabled?: boolean;
        selectedDriverId?: string;
        customBinaryPath?: string;
        activeProfileId?: string;
        nonSecretFields?: Record<string, string>;
        secretFields?: Record<string, string>;
        accountLabel?: string;
        consentAccepted?: boolean;
    }): Promise<ConnectorStateSnapshot>;
    startLogin(connectorId: string): Promise<ConnectorLoginSession>;
    getLoginStatus(connectorId: string): Promise<ConnectorLoginSession>;
    verifyConnection(connectorId: string, opts?: {
        simulateOutcome?: 'ok' | string;
    }): Promise<ConnectorDiagnosticResult>;
    disconnect(connectorId: string): Promise<ConnectorStateSnapshot>;
    matchToolRisk(toolName: string): ConnectorRiskMatch | undefined;
}

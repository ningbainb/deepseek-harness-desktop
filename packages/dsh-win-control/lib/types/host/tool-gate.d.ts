import type { Context } from '@deepseek-ai/cordis';
import type { AgentLike, ToolsServiceLike } from '../core/host-types.ts';
import type { WinControlSettings } from '../core/settings.ts';
import { probeDesktop, type DesktopProbeOutcome } from './desktop-probe.ts';
export declare const BRIDGE_TOOL_PREFIX = "mcp__windows__";
export declare const REVEAL_TOOL_NAME = "win_control_reveal";
export declare const DOCTOR_TOOL_NAME = "windows_mcp_doctor";
export interface BridgedToolDescriptor {
    readonly name: string;
    readonly description: string;
    readonly parameters?: unknown;
}
export declare function isBridgedToolName(name: unknown): name is string;
export declare function collectBridgedCatalog(tools: ToolsServiceLike | undefined): BridgedToolDescriptor[];
/**
 * Ephemeral per-session gate controlling whether `mcp__windows__*` schemas are
 * exposed and dispatched, plus lazy schema reveal to minimize token overhead.
 */
export declare class WinControlGate {
    private readonly grants;
    private readonly revealed;
    private readonly applied;
    private readonly liveAgents;
    private applying;
    private readonly ctx;
    private readonly getSettings;
    private readonly home;
    private readonly probeImpl;
    constructor(options: {
        ctx: Context;
        getSettings: () => WinControlSettings;
        home: string;
        probeImpl?: typeof probeDesktop;
    });
    private lookupSession;
    private grantChainOf;
    isGrantedForAgent(agent: AgentLike | undefined): boolean;
    isGrantedForSessionId(sessionId: string): boolean;
    setSessionGrant(sessionId: string, enabled: boolean): void;
    private revealStateFor;
    isToolRevealed(agent: AgentLike | undefined, name: string): boolean;
    private denyListFor;
    private releaseAgent;
    /** Guard against synchronous `tools/change` re-entry emitted by `scoped.restrict()`. */
    applyToAgent(agent: AgentLike | undefined): void;
    reapply(agent?: AgentLike): void;
    buildDoctorReport(agent?: AgentLike): Promise<{
        report: string;
        probe: DesktopProbeOutcome;
        bridgedCount: number;
    }>;
    mount(): () => void;
}
//# sourceMappingURL=tool-gate.d.ts.map
import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import { type AgentWslPermission } from './agent-wsl-permission.ts';
import type { ConnectorRiskMatch } from './connectors/types.ts';
export interface ControlToolApprovalOptions {
    readonly fullAccessUnattended?: boolean;
}
/**
 * Return true only when the active session runs under `danger-full-access` with
 * `approval` set to `'never'` (i.e. full unattended control without prompts).
 * Keeps `desktop-full-access-ask` (`approval: 'ask'`) and non-full-access
 * sandboxes gated by one-shot prompts.
 */
export declare function isFullAccessUnattendedSession(ctx: Context, exec: ToolExecution): boolean;
export declare function isFullAccessUnattendedForSession(ctx: Context, session: unknown): boolean;
/** Classify Desktop control tools without inspecting arguments or page/window data. */
export declare function controlToolApprovalDecision(name: string, wslPermission?: AgentWslPermission, options?: ControlToolApprovalOptions): PreToolDecision | undefined;
/** Classify office connector MCP calls into L0-L3 approval gates. */
export declare function connectorToolApprovalDecision(name: string, lookupRisk?: (toolName: string) => ConnectorRiskMatch | undefined): PreToolDecision | undefined;
/** Require one-shot approval for mutating Browser Use, Computer Use, WSL, and office connector actions. */
export declare function installControlToolApproval(ctx: Context, options?: {
    lookupConnectorRisk?: (toolName: string) => ConnectorRiskMatch | undefined;
}): void;

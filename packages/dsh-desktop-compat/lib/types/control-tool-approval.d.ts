import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision } from '@deepseek-ai/dsh-tools';
import { type AgentWslPermission } from './agent-wsl-permission.ts';
import type { ConnectorRiskMatch } from './connectors/types.ts';
/** Classify Desktop control tools without inspecting arguments or page/window data. */
export declare function controlToolApprovalDecision(name: string, wslPermission?: AgentWslPermission): PreToolDecision | undefined;
/** Classify office connector MCP calls into L0-L3 approval gates. */
export declare function connectorToolApprovalDecision(name: string, lookupRisk?: (toolName: string) => ConnectorRiskMatch | undefined): PreToolDecision | undefined;
/** Require one-shot approval for mutating Browser Use, Computer Use, WSL, and office connector actions. */
export declare function installControlToolApproval(ctx: Context, options?: {
    lookupConnectorRisk?: (toolName: string) => ConnectorRiskMatch | undefined;
}): void;

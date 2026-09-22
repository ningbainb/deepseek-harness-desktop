import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision } from '@deepseek-ai/dsh-tools';
import { type AgentWslPermission } from './agent-wsl-permission.ts';
/** Classify Desktop control tools without inspecting arguments or page/window data. */
export declare function controlToolApprovalDecision(name: string, wslPermission?: AgentWslPermission): PreToolDecision | undefined;
/** Require one-shot approval for mutating Browser Use and Computer Use actions. */
export declare function installControlToolApproval(ctx: Context): void;

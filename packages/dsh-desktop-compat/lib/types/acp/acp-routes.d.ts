import type { Context } from '@deepseek-ai/cordis';
import { type AcpAgentManager } from './acp-agent-manager.ts';
export declare function registerAcpRoutes(ctx: Context, manager: AcpAgentManager): () => void;

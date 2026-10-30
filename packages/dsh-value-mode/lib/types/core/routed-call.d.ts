import type { LlmCallConfig, LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { ModelRouteSelection } from './config.ts';
/** Reapply source reasoning controls only when the exact destination supports them. */
export declare function routedCallConfig(source: LlmCallConfig, route: ModelRouteSelection & {
    provider: string;
    model: string;
}, llm: LlmRuntime, signal?: AbortSignal): Promise<LlmCallConfig>;
//# sourceMappingURL=routed-call.d.ts.map
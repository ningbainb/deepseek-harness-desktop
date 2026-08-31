import type { LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { ModelRouteSelection, ValueModeConfig } from './config.ts';
export type ModelHealthStatus = 'ready' | 'unconfigured' | 'unavailable';
export interface ValueModeHealth {
    status: 'active' | 'disabled' | 'unconfigured' | 'degraded';
    executorHealth: ModelHealthStatus;
    expertHealth: ModelHealthStatus;
    reason?: string;
}
export declare function isRouteConfigured(route?: ModelRouteSelection): boolean;
export declare function checkRouteAvailability(llm: LlmRuntime | undefined, route?: ModelRouteSelection): Promise<ModelHealthStatus>;
export declare function assessValueModeHealth(config: ValueModeConfig | undefined, llm: LlmRuntime | undefined): Promise<ValueModeHealth>;
//# sourceMappingURL=model-selection.d.ts.map
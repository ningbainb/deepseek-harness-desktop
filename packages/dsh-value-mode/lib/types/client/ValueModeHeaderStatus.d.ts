import React from 'react';
import type { ValueModeConfig, SessionOverrideConfig, ModelRouteSelection, ValueModeSettingsScope } from '../core/config.ts';
import { type ValueModeModelCatalog } from './ModelPicker.tsx';
export interface ConsultationHistoryItem {
    id: string;
    timestamp: number;
    purpose: string;
    question: string;
    summary: string;
    tokens?: {
        inputTokens: number;
        outputTokens: number;
    };
}
export interface ValueModeHeaderStatusProps {
    config: ValueModeConfig;
    sessionId: string;
    useSessions: <T>(selector: (state: {
        byId: Record<string, {
            agentPreset?: string;
        }>;
    }) => T) => T;
    settingsScope?: ValueModeSettingsScope<ValueModeConfig>;
    defaultModelScope?: ValueModeSettingsScope<ModelRouteSelection>;
    sessionMetrics?: {
        controllerCalls?: number;
        subagentCalls?: number;
        expertCalls: number;
        executorCalls: number;
        inputTokens?: number;
        outputTokens?: number;
        estimatedSavingsPercent?: number;
        consultations?: ConsultationHistoryItem[];
    };
    sessionOverride?: SessionOverrideConfig;
    onChange: (patch: Partial<ValueModeConfig>) => Promise<void> | void;
    onSessionOverrideChange?: (override?: SessionOverrideConfig) => void;
    fetchModels?: () => Promise<ValueModeModelCatalog>;
    onOpenSettings?: () => void;
}
export declare const ValueModeHeaderStatus: React.FC<ValueModeHeaderStatusProps>;
//# sourceMappingURL=ValueModeHeaderStatus.d.ts.map
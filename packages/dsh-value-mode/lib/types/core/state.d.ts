import type { SessionOverrideConfig } from './config.ts';
export interface ConsultationRecord {
    id: string;
    timestamp: number;
    purpose: 'architecture' | 'plan' | 'debug' | 'review';
    question: string;
    summary: string;
    tokens: {
        inputTokens: number;
        outputTokens: number;
    };
    durationMs: number;
}
export interface SessionValueModeMetrics {
    executorCalls: number;
    expertCalls: number;
    executorTokens: {
        inputTokens: number;
        outputTokens: number;
    };
    expertTokens: {
        inputTokens: number;
        outputTokens: number;
    };
    manualExpertArmed: boolean;
    currentDepth: number;
    turnExpertCount: Map<number, number>;
    consecutiveFailures: number;
    override?: SessionOverrideConfig;
    consultations: ConsultationRecord[];
}
declare class ValueModeStateManager {
    private sessions;
    private globalExecutorCalls;
    private globalExpertCalls;
    private getSessionState;
    recordExecutorCall(sessionId?: string, usage?: {
        inputTokens?: number;
        outputTokens?: number;
    }): void;
    /** Record a delegated child-agent call while retaining the legacy field name. */
    recordSubagentCall(sessionId?: string, usage?: {
        inputTokens?: number;
        outputTokens?: number;
    }): void;
    recordExpertCall(sessionId?: string, turn?: number, usage?: {
        inputTokens?: number;
        outputTokens?: number;
    }): void;
    /** Record a top-level expert-controller call while retaining model metrics compatibility. */
    recordControllerCall(sessionId?: string, usage?: {
        inputTokens?: number;
        outputTokens?: number;
    }): void;
    recordConsultation(sessionId: string, record: Omit<ConsultationRecord, 'id' | 'timestamp'>): void;
    getConsultationHistory(sessionId: string): ConsultationRecord[];
    recordExecutorFailure(sessionId: string): void;
    resetExecutorFailure(sessionId: string): void;
    getConsecutiveFailures(sessionId: string): number;
    setSessionOverride(sessionId: string, override?: SessionOverrideConfig): void;
    getSessionOverride(sessionId: string): SessionOverrideConfig | undefined;
    clearSessionOverride(sessionId: string): void;
    getTurnExpertCalls(sessionId: string, turn: number): number;
    getDepth(sessionId: string): number;
    enterExpertCall(sessionId: string): void;
    exitExpertCall(sessionId: string): void;
    setManualExpertArmed(sessionId: string, armed: boolean): void;
    isManualExpertArmed(sessionId: string): boolean;
    getSessionMetrics(sessionId: string): {
        controllerCalls: number;
        subagentCalls: number;
        executorCalls: number;
        expertCalls: number;
        controllerTokens: {
            inputTokens: number;
            outputTokens: number;
        };
        subagentTokens: {
            inputTokens: number;
            outputTokens: number;
        };
        executorTokens: {
            inputTokens: number;
            outputTokens: number;
        };
        expertTokens: {
            inputTokens: number;
            outputTokens: number;
        };
        inputTokens: number;
        outputTokens: number;
        manualExpertArmed: boolean;
        consecutiveFailures: number;
        consultationsCount: number;
        estimatedSavingsPercent: number;
    };
    getGlobalMetrics(): {
        controllerCalls: number;
        subagentCalls: number;
        executorCalls: number;
        expertCalls: number;
        activeSessions: number;
    };
    resetAll(): void;
}
export declare const valueModeState: ValueModeStateManager;
export {};
//# sourceMappingURL=state.d.ts.map
class ValueModeStateManager {
    sessions = new Map();
    globalExecutorCalls = 0;
    globalExpertCalls = 0;
    getSessionState(sessionId) {
        let state = this.sessions.get(sessionId);
        if (!state) {
            state = {
                executorCalls: 0,
                expertCalls: 0,
                executorTokens: { inputTokens: 0, outputTokens: 0 },
                expertTokens: { inputTokens: 0, outputTokens: 0 },
                manualExpertArmed: false,
                currentDepth: 0,
                turnExpertCount: new Map(),
                consecutiveFailures: 0,
                consultations: [],
            };
            this.sessions.set(sessionId, state);
        }
        return state;
    }
    recordExecutorCall(sessionId, usage) {
        this.globalExecutorCalls++;
        if (sessionId) {
            const state = this.getSessionState(sessionId);
            state.executorCalls++;
            if (usage) {
                state.executorTokens.inputTokens += usage.inputTokens ?? 0;
                state.executorTokens.outputTokens += usage.outputTokens ?? 0;
            }
        }
    }
    /** Record a delegated child-agent call while retaining the legacy field name. */
    recordSubagentCall(sessionId, usage) {
        this.recordExecutorCall(sessionId, usage);
    }
    recordExpertCall(sessionId, turn, usage) {
        this.globalExpertCalls++;
        if (sessionId) {
            const state = this.getSessionState(sessionId);
            state.expertCalls++;
            if (usage) {
                state.expertTokens.inputTokens += usage.inputTokens ?? 0;
                state.expertTokens.outputTokens += usage.outputTokens ?? 0;
            }
            if (turn !== undefined) {
                const count = state.turnExpertCount.get(turn) ?? 0;
                state.turnExpertCount.set(turn, count + 1);
            }
            // Consume the armed manual flag once an expert call is recorded
            state.manualExpertArmed = false;
        }
    }
    /** Record a top-level expert-controller call while retaining model metrics compatibility. */
    recordControllerCall(sessionId, usage) {
        this.recordExpertCall(sessionId, undefined, usage);
    }
    recordConsultation(sessionId, record) {
        const state = this.getSessionState(sessionId);
        const entry = {
            ...record,
            id: `consult-${Date.now()}-${state.consultations.length + 1}`,
            timestamp: Date.now(),
        };
        state.consultations.unshift(entry);
        if (state.consultations.length > 20) {
            state.consultations.length = 20;
        }
    }
    getConsultationHistory(sessionId) {
        return this.getSessionState(sessionId).consultations;
    }
    recordExecutorFailure(sessionId) {
        const state = this.getSessionState(sessionId);
        state.consecutiveFailures++;
    }
    resetExecutorFailure(sessionId) {
        const state = this.getSessionState(sessionId);
        state.consecutiveFailures = 0;
    }
    getConsecutiveFailures(sessionId) {
        return this.getSessionState(sessionId).consecutiveFailures;
    }
    setSessionOverride(sessionId, override) {
        const state = this.getSessionState(sessionId);
        state.override = override ? { ...override } : undefined;
    }
    getSessionOverride(sessionId) {
        return this.getSessionState(sessionId).override;
    }
    clearSessionOverride(sessionId) {
        const state = this.getSessionState(sessionId);
        state.override = undefined;
    }
    getTurnExpertCalls(sessionId, turn) {
        const state = this.getSessionState(sessionId);
        return state.turnExpertCount.get(turn) ?? 0;
    }
    getDepth(sessionId) {
        return this.getSessionState(sessionId).currentDepth;
    }
    enterExpertCall(sessionId) {
        const state = this.getSessionState(sessionId);
        state.currentDepth++;
    }
    exitExpertCall(sessionId) {
        const state = this.getSessionState(sessionId);
        state.currentDepth = Math.max(0, state.currentDepth - 1);
    }
    setManualExpertArmed(sessionId, armed) {
        const state = this.getSessionState(sessionId);
        state.manualExpertArmed = armed;
    }
    isManualExpertArmed(sessionId) {
        return this.getSessionState(sessionId).manualExpertArmed;
    }
    getSessionMetrics(sessionId) {
        const state = this.getSessionState(sessionId);
        const totalCalls = state.executorCalls + state.expertCalls;
        const estimatedSavingsPercent = totalCalls > 0
            ? Math.min(99, Math.round((state.executorCalls / totalCalls) * 100))
            : 0;
        return {
            controllerCalls: state.expertCalls,
            subagentCalls: state.executorCalls,
            executorCalls: state.executorCalls,
            expertCalls: state.expertCalls,
            controllerTokens: { ...state.expertTokens },
            subagentTokens: { ...state.executorTokens },
            executorTokens: { ...state.executorTokens },
            expertTokens: { ...state.expertTokens },
            inputTokens: state.expertTokens.inputTokens + state.executorTokens.inputTokens,
            outputTokens: state.expertTokens.outputTokens + state.executorTokens.outputTokens,
            manualExpertArmed: state.manualExpertArmed,
            consecutiveFailures: state.consecutiveFailures,
            consultationsCount: state.consultations.length,
            estimatedSavingsPercent,
        };
    }
    getGlobalMetrics() {
        return {
            controllerCalls: this.globalExpertCalls,
            subagentCalls: this.globalExecutorCalls,
            executorCalls: this.globalExecutorCalls,
            expertCalls: this.globalExpertCalls,
            activeSessions: this.sessions.size,
        };
    }
    resetAll() {
        this.sessions.clear();
        this.globalExecutorCalls = 0;
        this.globalExpertCalls = 0;
    }
}
export const valueModeState = new ValueModeStateManager();

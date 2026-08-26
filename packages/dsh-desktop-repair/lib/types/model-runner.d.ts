import type { ModelSelection } from '@deepseek-ai/dsh-agent';
import type { RepairAttemptSummary, RepairJobSettings, RepairModelSelection } from './job.ts';
interface DefaultModelFace {
    currentSelection(): ModelSelection;
}
export interface RepairCandidateResult {
    status: 'candidate-ready' | 'failed';
}
export interface RepairModelRunResult {
    status: 'candidate-ready' | 'model-unavailable' | 'failed' | 'timed-out';
    attempts: RepairAttemptSummary[];
    selection?: RepairModelSelection;
}
export declare function repairModelCandidates(defaultModel: DefaultModelFace, settings?: RepairJobSettings): RepairModelSelection[];
export declare function runRepairModelCandidates({ defaultModel, settings, runCandidate, timeoutMs, }: {
    defaultModel: DefaultModelFace;
    settings?: RepairJobSettings;
    runCandidate: (selection: RepairModelSelection, attempt: number) => Promise<RepairCandidateResult>;
    timeoutMs?: number;
}): Promise<RepairModelRunResult>;
export {};

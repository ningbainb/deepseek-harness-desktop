export interface RepairJobRoot {
    id: string;
    kind: 'profile' | 'plugin';
    relativePath: string;
}
export interface RepairJobCommand {
    name: string;
    executable: string;
    args: string[];
    cwd: string;
}
export interface RepairModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export interface RepairJobSettings {
    fallbackModels?: RepairModelSelection[];
}
export interface RepairJob {
    schemaVersion: 1;
    jobId: string;
    fingerprint: string;
    sessionId: string;
    workspace: string;
    resultPath: string;
    roots: RepairJobRoot[];
    commands: RepairJobCommand[];
    settings: RepairJobSettings;
    timeoutMs: number;
    /** Internal host boundary; never sent to the model. */
    incidentDir: string;
    /** Internal host boundary; never sent to the model. */
    jobPath: string;
}
export interface RepairAttemptSummary {
    provider: string;
    model: string;
    outcome: string;
}
export interface RepairActionSummary {
    tool: string;
    outcome: string;
    path?: string;
}
export interface RepairResult {
    status: 'candidate-ready' | 'model-unavailable' | 'failed' | 'timed-out';
    diagnosis: string;
    summary: string;
    changedFiles: string[];
    checksRequested: string[];
    attempts: RepairAttemptSummary[];
    actions: RepairActionSummary[];
}
export declare function safeRepairRelativePath(value: unknown, label?: string): string;
export declare function loadRepairJob(jobPath: string): Promise<RepairJob>;
export declare function claimRepairJob(job: RepairJob): Promise<{
    claimed?: true;
    duplicate?: true;
    result?: RepairResult;
}>;
export declare function readRepairResult(job: Pick<RepairJob, 'resultPath'>): Promise<RepairResult>;
export declare function writeRepairResult(job: Pick<RepairJob, 'resultPath'>, result: RepairResult): Promise<RepairResult>;

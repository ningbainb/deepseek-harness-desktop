import { type RepairActionSummary, type RepairJobCommand, type RepairJobRoot } from './job.ts';
interface RepairToolJob {
    jobId: string;
    workspace: string;
    resultPath: string;
    roots: RepairJobRoot[];
    commands: RepairJobCommand[];
}
export interface RepairCheckResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
type CommandRunner = (command: RepairJobCommand, cwd: string) => Promise<RepairCheckResult>;
export declare class RepairToolController {
    private readonly job;
    private readonly roots;
    private readonly commands;
    private readonly runCommand;
    private readonly actionsPath;
    private readonly actionSummaries;
    private finished;
    constructor({ job, runCommand }: {
        job: RepairToolJob;
        runCommand?: CommandRunner;
    });
    get actions(): readonly RepairActionSummary[];
    private root;
    private candidatePath;
    private action;
    list(rootId: string, relativePath: string): Promise<string[]>;
    read(rootId: string, relativePath: string): Promise<string>;
    write(rootId: string, relativePath: string, content: string): Promise<{
        bytes: number;
    }>;
    move(rootId: string, from: string, to: string): Promise<{
        moved: true;
    }>;
    delete(rootId: string, relativePath: string): Promise<{
        deleted: true;
    }>;
    runCheck(name: string): Promise<RepairCheckResult>;
    finish(value: {
        diagnosis: string;
        changedFiles: string[];
        checksRequested: string[];
        summary: string;
    }): Promise<{
        accepted: true;
    }>;
}
export declare function createRepairTools(controller: RepairToolController): import("@deepseek-ai/dsh-tools").ToolDefinition[];
export {};

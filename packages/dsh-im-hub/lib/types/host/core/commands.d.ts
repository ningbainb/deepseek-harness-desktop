import type { ChannelId } from '../../core/settings.ts';
export type ControlCommand = {
    kind: 'new';
} | {
    kind: 'stop';
} | {
    kind: 'status';
} | {
    kind: 'help';
} | {
    kind: 'approve';
    approvalId?: string;
} | {
    kind: 'reject';
    approvalId?: string;
} | {
    kind: 'workspace';
    path?: string;
};
export declare function parseControlCommand(rawText: string): ControlCommand | null;
export declare function splitMessageChunks(text: string, maxChars?: number): string[];
export declare function formatHelpMessage(channel: ChannelId): string;
//# sourceMappingURL=commands.d.ts.map
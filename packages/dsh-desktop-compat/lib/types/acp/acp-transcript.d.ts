export interface AcpTranscriptMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
}
export declare function scopedAcpSessionKey(principalId: string, sessionId: string): string;
export declare class AcpTranscriptStore {
    private readonly directory;
    constructor(directory: string);
    private filename;
    read(principalId: string, sessionId: string): Promise<AcpTranscriptMessage[]>;
    append(principalId: string, sessionId: string, user: string, assistant: string): Promise<void>;
}

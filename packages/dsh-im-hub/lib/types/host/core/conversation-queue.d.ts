export declare class ConversationQueue {
    private readonly lanes;
    private readonly maxQueued;
    constructor(maxQueued?: number);
    depth(key: string): number;
    isBusy(key: string): boolean;
    clear(key: string): void;
    enqueue<T>(key: string, task: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=conversation-queue.d.ts.map
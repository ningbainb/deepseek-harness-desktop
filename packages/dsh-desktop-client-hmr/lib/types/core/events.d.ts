export type Frame = {
    type: 'graph';
    graph: object;
} | {
    type: 'rebuilt';
    id: string;
    rev: string;
};
export type ParsedFrame = {
    kind: 'frame';
    frame: Frame;
} | {
    kind: 'invalid' | 'unknown';
};
export declare function parseFrame(value: unknown): ParsedFrame;
export declare function createSseDecoder(receive: (data: string) => void): {
    push(chunk: string): void;
};
//# sourceMappingURL=events.d.ts.map
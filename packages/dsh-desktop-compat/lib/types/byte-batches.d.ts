/** Coalesce small stream writes without changing bytes or buffering the input. */
export declare function coalesceByteChunks(input: AsyncIterable<Buffer>, targetBytes?: number): AsyncGenerator<Buffer>;

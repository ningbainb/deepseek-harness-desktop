import { type MemorySnapshot } from './core/schema.ts';
import type { PrincipalId } from '@ningbainb/dsh-user-scope';
export declare const MEMORY_DIR_MODE = 448;
export declare const MEMORY_FILE_MODE = 384;
export declare class MemoryStoreError extends Error {
    readonly code: 'corrupt' | 'unsupported-version' | 'io';
    readonly filename?: string | undefined;
    constructor(message: string, code: 'corrupt' | 'unsupported-version' | 'io', filename?: string | undefined);
}
export interface MemoryStoreOptions {
    rootDir?: string;
    lockWaitMs?: number;
}
/** One private JSON file per principal; no file is shared between owners. */
export declare class MemoryStore {
    readonly rootDir: string;
    private readonly lockWaitMs;
    constructor(options?: MemoryStoreOptions);
    filenameForPrincipal(principalId: PrincipalId): string;
    load(principalId: PrincipalId): Promise<MemorySnapshot>;
    private loadUnlocked;
    save(principalId: PrincipalId, snapshot: MemorySnapshot): Promise<MemorySnapshot>;
    update(principalId: PrincipalId, update: (current: MemorySnapshot) => MemorySnapshot | Promise<MemorySnapshot>): Promise<MemorySnapshot>;
    private withLock;
    private ensureRoot;
    private ensureOwnerDirectory;
    private readRaw;
    /** Keep the first invalid snapshot for recovery without replacing the source file. */
    private backupCorruptFile;
    private writeJson;
}
//# sourceMappingURL=store.d.ts.map
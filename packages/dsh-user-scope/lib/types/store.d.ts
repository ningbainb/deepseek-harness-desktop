import { type OwnershipSnapshot, type Principal } from './core/schema.ts';
export declare const USER_SCOPE_DIR_MODE = 448;
export declare const USER_SCOPE_FILE_MODE = 384;
export declare class UserScopeStoreError extends Error {
    readonly code: 'corrupt' | 'unsupported-version' | 'io';
    constructor(message: string, code: 'corrupt' | 'unsupported-version' | 'io');
}
export declare class UnsupportedSchemaVersionError extends UserScopeStoreError {
    readonly filename: string;
    readonly version: number;
    constructor(filename: string, version: number);
}
export declare class CorruptUserScopeError extends UserScopeStoreError {
    readonly filename: string;
    constructor(filename: string);
}
export interface UserScopeStoreOptions {
    /** Injected only by tests or an explicitly managed host profile. */
    rootDir?: string;
    lockWaitMs?: number;
}
/** Official-SDK-backed private persistence for principal and ownership files. */
export declare class UserScopeStore {
    readonly rootDir: string;
    readonly principalFilename: string;
    readonly ownershipFilename: string;
    private readonly lockWaitMs;
    constructor(options?: UserScopeStoreOptions);
    ensureLocalPrincipal(create: () => Principal): Promise<Principal>;
    loadOwnership(): Promise<OwnershipSnapshot | undefined>;
    saveOwnership(snapshot: OwnershipSnapshot): Promise<void>;
    updateOwnership(update: (current: OwnershipSnapshot | undefined) => OwnershipSnapshot | Promise<OwnershipSnapshot>): Promise<OwnershipSnapshot>;
    private ensureRoot;
    private readPrincipalUnlocked;
    private readOwnershipUnlocked;
    private readJson;
    /** Keep the first invalid snapshot for operator recovery without touching the source file. */
    private backupCorruptFile;
    private writeJson;
    private throwParseFailure;
}
//# sourceMappingURL=store.d.ts.map
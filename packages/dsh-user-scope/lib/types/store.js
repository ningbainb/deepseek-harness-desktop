import { readFile, mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { CURRENT_SCHEMA_VERSION, parseOwnershipSnapshot, parsePrincipalFile, } from "./core/schema.js";
export const USER_SCOPE_DIR_MODE = 0o700;
export const USER_SCOPE_FILE_MODE = 0o600;
export class UserScopeStoreError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'UserScopeStoreError';
    }
}
export class UnsupportedSchemaVersionError extends UserScopeStoreError {
    filename;
    version;
    constructor(filename, version) {
        super(`unsupported user-scope schema version ${String(version)}`, 'unsupported-version');
        this.filename = filename;
        this.version = version;
        this.name = 'UnsupportedSchemaVersionError';
    }
}
export class CorruptUserScopeError extends UserScopeStoreError {
    filename;
    constructor(filename) {
        super('user-scope state is invalid', 'corrupt');
        this.filename = filename;
        this.name = 'CorruptUserScopeError';
    }
}
function errorCode(error) {
    if (!error || typeof error !== 'object')
        return undefined;
    const code = error.code;
    return typeof code === 'string' ? code : undefined;
}
/** Official-SDK-backed private persistence for principal and ownership files. */
export class UserScopeStore {
    rootDir;
    principalFilename;
    ownershipFilename;
    lockWaitMs;
    constructor(options = {}) {
        this.rootDir = resolve(options.rootDir ?? dshHomePath('user-scope'));
        this.principalFilename = resolve(this.rootDir, 'principal.json');
        this.ownershipFilename = resolve(this.rootDir, 'ownership.json');
        this.lockWaitMs = options.lockWaitMs ?? 10_000;
    }
    async ensureLocalPrincipal(create) {
        await this.ensureRoot();
        return withFileLock(this.principalFilename, async () => {
            const existing = await this.readPrincipalUnlocked();
            if (existing !== undefined)
                return existing;
            const principal = create();
            const parsed = parsePrincipalFile({ version: CURRENT_SCHEMA_VERSION, principal });
            if (!parsed.ok)
                throw new CorruptUserScopeError(this.principalFilename);
            await this.writeJson(this.principalFilename, parsed.value);
            return principal;
        }, { waitMs: this.lockWaitMs });
    }
    async loadOwnership() {
        await this.ensureRoot();
        return withFileLock(this.ownershipFilename, async () => this.readOwnershipUnlocked(), {
            waitMs: this.lockWaitMs,
        });
    }
    async saveOwnership(snapshot) {
        await this.ensureRoot();
        const parsed = parseOwnershipSnapshot(snapshot);
        if (!parsed.ok)
            this.throwParseFailure(this.ownershipFilename, parsed);
        await withFileLock(this.ownershipFilename, async () => {
            await this.writeJson(this.ownershipFilename, parsed.value);
        }, { waitMs: this.lockWaitMs });
    }
    async updateOwnership(update) {
        await this.ensureRoot();
        return withFileLock(this.ownershipFilename, async () => {
            const current = await this.readOwnershipUnlocked();
            const next = await update(current);
            const parsed = parseOwnershipSnapshot(next);
            if (!parsed.ok)
                this.throwParseFailure(this.ownershipFilename, parsed);
            await this.writeJson(this.ownershipFilename, parsed.value);
            return parsed.value;
        });
    }
    async ensureRoot() {
        await mkdir(this.rootDir, { recursive: true, mode: USER_SCOPE_DIR_MODE });
        try {
            await chmod(this.rootDir, USER_SCOPE_DIR_MODE);
        }
        catch (error) {
            if (process.platform !== 'win32')
                throw error;
        }
    }
    async readPrincipalUnlocked() {
        const value = await this.readJson(this.principalFilename);
        if (value === undefined)
            return undefined;
        const parsed = parsePrincipalFile(value);
        if (!parsed.ok && parsed.kind === 'invalid')
            await this.backupCorruptFile(this.principalFilename);
        if (!parsed.ok)
            this.throwParseFailure(this.principalFilename, parsed);
        return parsed.value.principal;
    }
    async readOwnershipUnlocked() {
        const value = await this.readJson(this.ownershipFilename);
        if (value === undefined)
            return undefined;
        const parsed = parseOwnershipSnapshot(value);
        if (!parsed.ok && parsed.kind === 'invalid')
            await this.backupCorruptFile(this.ownershipFilename);
        if (!parsed.ok)
            this.throwParseFailure(this.ownershipFilename, parsed);
        return parsed.value;
    }
    async readJson(filename) {
        let raw;
        try {
            raw = await readFile(filename, 'utf8');
        }
        catch (error) {
            if (errorCode(error) === 'ENOENT')
                return undefined;
            throw new UserScopeStoreError('unable to read user-scope state', 'io');
        }
        try {
            return JSON.parse(raw);
        }
        catch {
            await this.backupCorruptFile(filename, raw);
            throw new CorruptUserScopeError(filename);
        }
    }
    /** Keep the first invalid snapshot for operator recovery without touching the source file. */
    async backupCorruptFile(filename, content) {
        const backupFilename = filename + '.corrupt';
        let backupContent = content;
        if (backupContent === undefined) {
            try {
                backupContent = await readFile(filename, 'utf8');
            }
            catch {
                return;
            }
        }
        try {
            await readFile(backupFilename, 'utf8');
            return;
        }
        catch (error) {
            if (errorCode(error) !== 'ENOENT')
                return;
        }
        try {
            await writeFileAtomic(backupFilename, backupContent, {
                mode: USER_SCOPE_FILE_MODE,
                dirMode: USER_SCOPE_DIR_MODE,
            });
        }
        catch {
            // A backup is best effort; the original invalid document remains untouched.
        }
    }
    async writeJson(filename, value) {
        try {
            await writeFileAtomic(filename, `${JSON.stringify(value, null, 2)}\n`, {
                mode: USER_SCOPE_FILE_MODE,
                dirMode: USER_SCOPE_DIR_MODE,
            });
        }
        catch {
            throw new UserScopeStoreError('unable to write user-scope state', 'io');
        }
    }
    throwParseFailure(filename, failure) {
        if (failure.kind === 'unsupported-version')
            throw new UnsupportedSchemaVersionError(filename, failure.version);
        throw new CorruptUserScopeError(filename);
    }
}

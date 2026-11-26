import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
function isInside(baseDir, candidate) {
    const rel = relative(baseDir, candidate);
    return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'));
}
function nearestExistingRealpath(path) {
    let cursor = path;
    while (!existsSync(cursor)) {
        const parent = dirname(cursor);
        if (parent === cursor)
            break;
        cursor = parent;
    }
    return existsSync(cursor) ? realpathSync(cursor) : cursor;
}
/** Resolve a user-supplied path strictly within `rootDir`, blocking traversals and symlink escapes. */
export function resolveSafeWorkspacePath(rootDir, relPath = '.') {
    if (typeof relPath !== 'string' || relPath.includes('\0')) {
        return { ok: false, error: 'invalid-path' };
    }
    const rootResolved = resolve(rootDir);
    let rootReal = rootResolved;
    try {
        rootReal = realpathSync(rootResolved);
    }
    catch { }
    const target = resolve(rootResolved, relPath.trim() === '' ? '.' : relPath);
    if (!isInside(rootResolved, target)) {
        return { ok: false, error: 'path-outside-workspace' };
    }
    const targetAncestorReal = nearestExistingRealpath(target);
    if (!isInside(rootReal, targetAncestorReal)) {
        return { ok: false, error: 'symlink-outside-workspace' };
    }
    const rel = relative(rootResolved, target).replaceAll('\\', '/') || '.';
    return { ok: true, absolutePath: target, relativePath: rel };
}
export function sha256Hex(content) {
    return createHash('sha256').update(content).digest('hex');
}
export function isLikelyBinary(buf) {
    const sampleLen = Math.min(buf.byteLength, 4096);
    for (let i = 0; i < sampleLen; i++) {
        if (buf[i] === 0)
            return true;
    }
    return false;
}

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SETTINGS_FILE, defaultSettings, normalizeSettings, } from "../core/settings.js";
export function resolveDshHome(env = process.env) {
    const fromEnv = String(env.DSH_HOME ?? '').trim();
    return fromEnv === '' ? join(homedir(), '.dsh') : fromEnv;
}
export function settingsFilePath(home = resolveDshHome()) {
    return join(home, SETTINGS_FILE);
}
export async function readSettings(home = resolveDshHome()) {
    try {
        const raw = await readFile(settingsFilePath(home), 'utf8');
        return normalizeSettings(JSON.parse(raw)).settings;
    }
    catch {
        return defaultSettings();
    }
}
export async function writeSettingsAtomic(input, home = resolveDshHome(), platform = process.platform) {
    const existing = await readSettingsIfPresent(home);
    const normalized = normalizeSettings(input, existing);
    const target = settingsFilePath(home);
    await mkdir(dirname(target), { recursive: true });
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tmpPath = `${target}.tmp-${suffix}`;
    const backupPath = `${target}.backup-${suffix}`;
    const content = `${JSON.stringify(normalized.settings, null, 2)}\n`;
    await writeFile(tmpPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    let backedUp = false;
    try {
        try {
            await rename(target, backupPath);
            backedUp = true;
        }
        catch (error) {
            if (error?.code !== 'ENOENT' && platform !== 'win32')
                throw error;
        }
        await rename(tmpPath, target).catch(async (error) => {
            if (platform !== 'win32' || error?.code !== 'EEXIST')
                throw error;
            if (!backedUp) {
                await rename(target, backupPath);
                backedUp = true;
            }
            await rename(tmpPath, target);
        });
        if (backedUp)
            await rm(backupPath, { force: true });
    }
    catch (error) {
        await rm(tmpPath, { force: true }).catch(() => { });
        if (backedUp)
            await rename(backupPath, target).catch(() => { });
        throw error;
    }
    return normalized;
}
async function readSettingsIfPresent(home) {
    try {
        const raw = await readFile(settingsFilePath(home), 'utf8');
        return normalizeSettings(JSON.parse(raw)).settings;
    }
    catch {
        return undefined;
    }
}

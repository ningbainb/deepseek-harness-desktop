import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
function readObject(path) {
    const value = parse(readFileSync(path, 'utf8'), { uniqueKeys: true });
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`preset metadata must be a mapping: ${path}`);
    }
    return value;
}
function rowsAt(path, directory) {
    const value = parse(readFileSync(path, 'utf8'), { uniqueKeys: true });
    if (!Array.isArray(value))
        throw new Error(`preset composition must be a list: ${path}`);
    const normalize = (rows) => rows.map((item) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`preset composition has an invalid row: ${path}`);
        }
        const row = item;
        const name = typeof row.name === 'string' && row.name.startsWith('./')
            ? pathToFileURL(resolve(directory, row.name)).href : row.name;
        const config = Array.isArray(row.config) ? normalize(row.config) : row.config;
        return { ...row, name, config };
    });
    return normalize(value);
}
/** Declare the bundled composition through the official rc.2 registry. */
export function declareBundledPreset(ctx, id, directory) {
    let closed = false;
    let pending;
    let release;
    const start = () => {
        if (closed || pending)
            return;
        const registry = ctx.get('agentPresets');
        if (!registry)
            return;
        pending = (async () => {
            const metadata = readObject(join(directory, 'preset.yml'));
            const definition = {
                id,
                name: typeof metadata.name === 'string' ? metadata.name : id,
                description: typeof metadata.description === 'string' ? metadata.description : undefined,
                order: typeof metadata.order === 'number' ? metadata.order : undefined,
                plugins: rowsAt(join(directory, 'agent.cordis.yml'), directory),
            };
            const dispose = await registry.register(definition);
            if (closed)
                await dispose();
            else
                release = dispose;
        })().catch(error => {
            ctx.logger?.warn?.(`${id}: preset declaration failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };
    ctx.inject(['agentPresets'], start);
    ctx.effect(() => {
        start();
        return async () => {
            closed = true;
            await pending;
            await release?.();
        };
    }, `${id}: preset declaration`);
}

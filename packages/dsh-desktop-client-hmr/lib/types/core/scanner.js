function sameMetadata(first, second) {
    return first.mtimeMs === second.mtimeMs && first.ctimeMs === second.ctimeMs && first.size === second.size;
}
function missing(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
export function createBundleWatcher(options) {
    const watched = new Map();
    let disposed = false;
    let cancelNext;
    const report = (error) => {
        if (disposed)
            return;
        try {
            options.report(error);
        }
        catch { }
    };
    const current = (id, watch) => !disposed && watched.get(id) === watch;
    const refresh = () => {
        if (disposed)
            return;
        const rows = new Map(options.snapshot());
        for (const id of watched.keys())
            if (!rows.has(id))
                watched.delete(id);
        for (const [id, baseline] of rows) {
            const previous = watched.get(id);
            const unchanged = previous?.baseline.path === baseline.path && sameMetadata(previous.baseline, baseline);
            watched.set(id, { baseline: { ...baseline }, dirty: unchanged ? previous.dirty : false });
        }
    };
    const batch = async () => {
        const rows = [...watched];
        const changed = new Map();
        let publicationAdvanced = false;
        let nextIndex = 0;
        const worker = async () => {
            while (!disposed && nextIndex < rows.length) {
                const [id, watch] = rows[nextIndex++];
                if (!current(id, watch))
                    continue;
                try {
                    const metadata = await options.stat(watch.baseline.path);
                    if (current(id, watch) && (watch.dirty || !sameMetadata(metadata, watch.baseline)))
                        changed.set(id, watch);
                }
                catch (error) {
                    if (!current(id, watch))
                        continue;
                    watch.dirty = true;
                    if (!missing(error))
                        report(error);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
        for (const [id, watch] of changed) {
            if (!current(id, watch))
                continue;
            await options.yieldControl();
            if (!current(id, watch))
                continue;
            try {
                const baseline = options.publish(id);
                if (!current(id, watch)) {
                    const refreshed = watched.get(id)?.baseline;
                    publicationAdvanced ||= baseline !== undefined && refreshed !== undefined
                        && baseline.path === watch.baseline.path && baseline.path === refreshed.path
                        && sameMetadata(baseline, refreshed) && !sameMetadata(baseline, watch.baseline);
                    continue;
                }
                if (baseline !== undefined && baseline.path === watch.baseline.path) {
                    watch.baseline = { ...baseline };
                    watch.dirty = false;
                }
                else
                    watch.dirty = true;
            }
            catch (error) {
                if (!current(id, watch))
                    continue;
                watch.dirty = true;
                if (!missing(error))
                    report(error);
            }
        }
        return publicationAdvanced && [...changed].some(([id, watch]) => {
            const refreshed = watched.get(id);
            return refreshed !== undefined && refreshed !== watch
                && refreshed.baseline.path === watch.baseline.path && sameMetadata(refreshed.baseline, watch.baseline);
        });
    };
    const run = async () => {
        let rescan = false;
        try {
            rescan = await batch();
        }
        catch (error) {
            report(error);
        }
        if (!disposed)
            cancelNext = options.schedule(() => { cancelNext = undefined; void run(); }, rescan ? 0 : options.pollIntervalMs);
    };
    refresh();
    void run();
    return {
        refresh,
        dispose() {
            if (disposed)
                return;
            disposed = true;
            cancelNext?.();
            watched.clear();
        },
    };
}

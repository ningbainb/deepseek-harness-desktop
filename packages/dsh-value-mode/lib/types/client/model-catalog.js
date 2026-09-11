export const MODEL_CATALOG_TIMEOUT_MS = 10_000;
/** A bounded advisory read, not a replacement for the native selection directory. */
export function createModelCatalogLoader(ctx, translate) {
    let revision = 0;
    let disposed = false;
    let cached;
    let pending;
    let cancel;
    const invalidate = () => { revision++; cached = undefined; pending = undefined; cancel?.(); cancel = undefined; };
    const removers = [
        ctx.on('connection/reset', invalidate),
        ctx.remote.$on('llm/adapters-updated', invalidate),
        ctx.remote.$on('settings/document-updated', invalidate),
        ctx.remote.$on('credentials/reference-updated', invalidate),
        ctx.get('connection').generation.subscribe(invalidate),
    ];
    ctx.effect(() => () => { disposed = true; invalidate(); removers.forEach(remove => remove()); }, 'value-mode: model catalog lifetime');
    return function fetchModels() {
        if (disposed)
            return Promise.reject(new Error(translate('catalogUnavailable')));
        if (cached && cached.expires > Date.now())
            return Promise.resolve(cached.value);
        if (pending)
            return pending;
        const started = revision;
        let timer;
        const interrupted = new Promise((_, reject) => {
            cancel = () => reject(new Error(translate('catalogChanged')));
            timer = setTimeout(() => reject(new Error(translate('catalogTimeout'))), MODEL_CATALOG_TIMEOUT_MS);
        });
        const operation = Promise.race([
            Promise.resolve().then(async () => {
                const response = await ctx.remote.session.modelCatalog();
                if (!response.ok)
                    throw new Error(response.error.message || translate('catalogLoadFailed'));
                return { groups: response.value.groups ?? [], failures: response.value.failures ?? [] };
            }),
            interrupted,
        ]).then(value => {
            if (disposed || started !== revision)
                throw new Error(translate('catalogChanged'));
            // Short-lived UI reuse only. The Host remains the source of models and permissions.
            cached = { value, expires: Date.now() + 30_000 };
            return value;
        }).finally(() => {
            clearTimeout(timer);
            if (pending === operation) {
                pending = undefined;
                cancel = undefined;
            }
        });
        pending = operation;
        return operation;
    };
}

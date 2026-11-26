export function getHostService(ctx, name) {
    const candidate = ctx;
    try {
        return (candidate.get?.(name) ?? candidate[name]);
    }
    catch {
        return undefined;
    }
}

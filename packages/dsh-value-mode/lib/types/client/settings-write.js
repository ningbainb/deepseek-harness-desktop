/** Compare settings values after JSON transport omits optional undefined keys. */
function sameSetting(actual, expected) {
    if (Object.is(actual, expected))
        return true;
    if (Array.isArray(expected)) {
        return Array.isArray(actual) && actual.length === expected.length
            && expected.every((value, index) => sameSetting(actual[index], value));
    }
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)
        || typeof expected !== 'object' || expected === null)
        return false;
    const actualRecord = actual;
    const entries = Object.entries(expected).filter(([, value]) => value !== undefined);
    return Object.values(actualRecord).filter(value => value !== undefined).length === entries.length
        && entries.every(([key, value]) => sameSetting(actualRecord[key], value));
}
/**
 * SettingsScope resolves after refusals as well as accepted writes. Verify the
 * host read-back before callers close onboarding or emit successful telemetry.
 * Serialize patches so another local edit cannot hide an intermediate read-back.
 */
export function createValueModeSettingsWriter(scope, t) {
    let tail = Promise.resolve();
    return (patch) => {
        const entries = Object.entries(structuredClone(patch));
        const task = tail.then(async () => {
            for (const [key, value] of entries) {
                const before = scope.getSnapshot();
                if (before.status !== 'ready' || !before.writable)
                    throw new Error(t('settingsNotWritable'));
                await scope.set(key, value);
                const accepted = scope.getSnapshot();
                const user = accepted.user;
                // An equal inherited value does not prove that this explicit override
                // was saved. The raw user layer must acknowledge the requested field.
                if (accepted.status !== 'ready' || typeof user !== 'object' || user === null
                    || !Object.hasOwn(user, key) || !sameSetting(user[key], value)) {
                    throw new Error(t('settingsSaveFailed'));
                }
            }
        });
        tail = task.catch(() => { });
        return task;
    };
}

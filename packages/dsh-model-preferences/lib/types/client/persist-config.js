export function persistModelPreferencesConfig(form, config, revision) {
    return form.mutate([
        { op: 'set', path: ['pinnedModels'], value: config.pinnedModels.map(key => ({ ...key })) },
        { op: 'set', path: ['providerOrder'], value: config.providerOrder },
        { op: 'set', path: ['disabledProviders'], value: config.disabledProviders },
        { op: 'set', path: ['recentModels'], value: config.recentModels.map(key => ({ ...key })) },
    ], revision);
}

export function persistPersonalPromptConfig(form, config, revision) {
    const profiles = config.profiles.map(profile => {
        const value = {
            id: profile.id, name: profile.name, content: profile.content,
            enabled: profile.enabled, scope: profile.scope, updatedAt: profile.updatedAt,
        };
        if (profile.workspaceId !== undefined)
            value.workspaceId = profile.workspaceId;
        if (profile.sessionId !== undefined)
            value.sessionId = profile.sessionId;
        return value;
    });
    return form.mutate([
        { op: 'set', path: ['profiles'], value: profiles },
        { op: 'set', path: ['enabled'], value: config.enabled },
        config.activeProfileId === undefined
            ? { op: 'unset', path: ['activeProfileId'] }
            : { op: 'set', path: ['activeProfileId'], value: config.activeProfileId },
    ], revision);
}

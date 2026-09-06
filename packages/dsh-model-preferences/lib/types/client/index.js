/**
 * Browser half of model preferences. The official ModelDirectory remains the
 * state machine and Host transport; this package only supplies a preference
 * projection inside the official Models page and a preference-aware composer seat.
 */
import { MODEL_PREFERENCES_SETTINGS_NAMESPACE, normalizeModelPreferences, } from "../core/config.js";
import { ModelPreferencesCard } from "./ModelPreferencesCard.js";
import { ModelSelect } from "./ModelSelect.js";
import { commandOptions, selectionFromOptionId, selectModelWithPreferences } from "./model-projection.js";
import { en, zh } from "./locales.js";
export * from "./locales.js";
export { ModelPreferencesCard } from "./ModelPreferencesCard.js";
export { ModelSelect } from "./ModelSelect.js";
export * from "./model-projection.js";
// The nested composer/command injections inherit `sessions` from this
// package fiber while resolving the official model directory service.
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote', 'sessions'];
const EMPTY_CONFIG = {
    version: 1,
    pinnedModels: [],
    providerOrder: [],
    disabledProviders: [],
    recentModels: [],
};
function settingsBinder(ctx) {
    const compatibility = ctx.get('webUiSettings');
    if (typeof compatibility === 'object' && compatibility !== null && typeof compatibility.bind === 'function') {
        return compatibility;
    }
    return ctx.settingsScope;
}
function currentConfig(scope) {
    try {
        return normalizeModelPreferences(scope.getSnapshot().value);
    }
    catch {
        return { ...EMPTY_CONFIG };
    }
}
function catalogLoader(ctx) {
    return async () => {
        const api = ctx.get('connection')?.api;
        const models = api?.llm?.models;
        if (models === undefined)
            throw new Error('model catalog is unavailable');
        const response = await models({});
        if (!response.result.ok)
            throw new Error(response.result.error?.message || 'model catalog request failed');
        return {
            groups: response.result.value.groups ?? [],
            failures: response.result.value.failures ?? [],
        };
    };
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('model-preferences', { zh, en }), 'model-preferences: dictionaries');
    const binder = settingsBinder(ctx);
    const settingsScope = binder.bind({
        namespace: MODEL_PREFERENCES_SETTINGS_NAMESPACE,
        decode: value => {
            try {
                return normalizeModelPreferences(value);
            }
            catch {
                return undefined;
            }
        },
    });
    const loadCatalog = catalogLoader(ctx);
    ctx.inject(['slots'], scope => {
        // The official Models page owns this extension slot.
        scope.slots.inject('settings.models.content', () => scope.slots.register({
            name: 'settings.models.content',
            id: 'model-preferences',
            order: 10,
            locale: 'model-preferences',
            children: { 'model-preferences.onboarding': { kind: 'list', scope: 'root' } },
            inject: () => ({
                config: currentConfig(settingsScope),
                settingsScope,
                loadCatalog,
            }),
        }, ModelPreferencesCard));
    });
    // This injection waits for the official command and ModelDirectory services.
    // The public command seam can decorate a Host command. It cannot replace a
    // same-name client contribution, and the current official model-selection
    // plugin registers `/model` as exactly such a contribution.
    ctx.inject(['commandUi', 'modelDirectories'], (scope) => {
        const command = scope.get('commandUi');
        const models = scope.modelDirectories;
        const sessions = scope.sessions;
        const translate = ctx.locale.bind('model-preferences');
        const available = session => sessions.subagentAddress(session.sessionId) === undefined;
        const ui = {
            kind: 'popupSelect',
            options: async (session, signal) => {
                if (signal.aborted || sessions.subagentAddress(session.sessionId) !== undefined)
                    return [];
                const directory = models.directoryFor(session.sessionId);
                await directory.load();
                if (signal.aborted)
                    return [];
                return commandOptions(directory.store.getSnapshot(), currentConfig(settingsScope), (key, params) => translate(key, params));
            },
            onSelect: async (option, session) => {
                if (sessions.subagentAddress(session.sessionId) !== undefined)
                    throw new Error('model selection is unavailable for addressed subagent sessions');
                const directory = models.directoryFor(session.sessionId);
                const selection = selectionFromOptionId(directory.store.getSnapshot(), option.id, currentConfig(settingsScope));
                if (selection === undefined)
                    throw new Error('the selected model is no longer available');
                await selectModelWithPreferences(directory, settingsScope, selection);
            },
        };
        scope.effect(() => {
            // Do not register a same-name contribution or inspect/mutate the
            // command runtime's private live registry. On SDK versions where
            // `/model` is a Host command this public decoration takes effect; on
            // current versions it is inert because `/model` is a client
            // contribution. The official command remains untouched until the SDK
            // exposes a public contribution-replacement seam.
            return command.decorate({ name: 'model', available, ui });
        }, 'model-preferences: decorate /model when supported');
    });
    ctx.inject(['slots', 'modelDirectories'], (scope) => {
        const models = scope.modelDirectories;
        const sessions = scope.sessions;
        scope.slots.inject('conversation.input.model', () => scope.slots.register({
            name: 'conversation.input.model',
            priority: -10,
            locale: 'model-preferences',
            inject: (sessionId) => {
                const directory = models.directoryFor(sessionId);
                const available = sessions.subagentAddress(sessionId) === undefined;
                return {
                    available,
                    directory: directory.store,
                    settingsScope,
                    load: () => {
                        if (available)
                            directory.load().catch(() => { });
                    },
                    select: selection => available
                        ? selectModelWithPreferences(directory, settingsScope, selection).then(() => true, () => false)
                        : Promise.resolve(false),
                };
            },
        }, ModelSelect));
    });
}

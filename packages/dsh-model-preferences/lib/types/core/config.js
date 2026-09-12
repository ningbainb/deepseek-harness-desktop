/** Settings namespace registered by the Host half. */
export const MODEL_PREFERENCES_SETTINGS_NAMESPACE = 'model-preferences';
/** The built-in bai route stays first on every projected model surface. */
export const PRIMARY_PROVIDER_ID = 'project-relay';
export const DEFAULT_MODEL_PREFERENCES = {
    version: 1,
    pinnedModels: [],
    providerOrder: [],
    disabledProviders: [],
    recentModels: [],
};
export const MAX_PINNED_MODELS = 2;
export const MAX_RECENT_MODELS = 8;
export const MAX_PREFERENCE_STRING_LENGTH = 128;
export class InvalidModelPreferencesError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidModelPreferencesError';
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isBoundedString(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_PREFERENCE_STRING_LENGTH
        && value.trim() === value
        && !/\s/u.test(value);
}
function keyOf(value) {
    if (!isRecord(value) || !isBoundedString(value.provider) || !isBoundedString(value.model))
        return undefined;
    return { provider: value.provider, model: value.model };
}
/** Compare two structured identities. */
export function sameModelKey(left, right) {
    return left !== undefined && right !== undefined
        && left.provider === right.provider
        && left.model === right.model;
}
function uniqueModels(values, limit) {
    const result = [];
    for (const value of values) {
        const key = keyOf(value);
        if (key === undefined || result.some(candidate => sameModelKey(candidate, key)))
            continue;
        result.push(key);
        if (result.length >= limit)
            break;
    }
    return result;
}
function uniqueStrings(values) {
    const result = [];
    for (const value of values) {
        if (!isBoundedString(value) || result.includes(value))
            continue;
        result.push(value);
    }
    return result;
}
/** Normalize a value received from a settings scope or an older profile. */
export function normalizeModelPreferences(value) {
    if (value === undefined)
        return { ...DEFAULT_MODEL_PREFERENCES };
    if (!isRecord(value))
        throw new InvalidModelPreferencesError('model-preferences must be an object');
    if (value.version !== undefined && value.version !== 1) {
        throw new InvalidModelPreferencesError('unsupported model-preferences version');
    }
    return {
        version: 1,
        pinnedModels: uniqueModels(Array.isArray(value.pinnedModels) ? value.pinnedModels : [], MAX_PINNED_MODELS),
        providerOrder: uniqueStrings(Array.isArray(value.providerOrder) ? value.providerOrder : []),
        disabledProviders: uniqueStrings(Array.isArray(value.disabledProviders) ? value.disabledProviders : []),
        recentModels: uniqueModels(Array.isArray(value.recentModels) ? value.recentModels : [], MAX_RECENT_MODELS),
    };
}
/** Strict validation used by the Host settings section before persistence. */
export function assertModelPreferences(value) {
    if (!isRecord(value) || value.version !== 1) {
        throw new InvalidModelPreferencesError('model-preferences.version must be 1');
    }
    if (!Array.isArray(value.pinnedModels) || value.pinnedModels.length > MAX_PINNED_MODELS) {
        throw new InvalidModelPreferencesError('model-preferences.pinnedModels must contain at most two models');
    }
    if (!Array.isArray(value.recentModels) || value.recentModels.length > MAX_RECENT_MODELS) {
        throw new InvalidModelPreferencesError('model-preferences.recentModels must contain at most eight models');
    }
    const normalized = normalizeModelPreferences(value);
    if (normalized.pinnedModels.length !== value.pinnedModels.length) {
        throw new InvalidModelPreferencesError('model-preferences.pinnedModels contains an invalid or duplicate model');
    }
    if (normalized.recentModels.length !== value.recentModels.length) {
        throw new InvalidModelPreferencesError('model-preferences.recentModels contains an invalid or duplicate model');
    }
    if (!Array.isArray(value.providerOrder) || normalized.providerOrder.length !== value.providerOrder.length) {
        throw new InvalidModelPreferencesError('model-preferences.providerOrder contains an invalid or duplicate provider');
    }
    if (!Array.isArray(value.disabledProviders) || normalized.disabledProviders.length !== value.disabledProviders.length) {
        throw new InvalidModelPreferencesError('model-preferences.disabledProviders contains an invalid or duplicate provider');
    }
}
/** Record a successful selection without disturbing pinned/provider settings. */
export function recordRecentModel(config, selection) {
    const normalized = normalizeModelPreferences(config);
    return {
        ...normalized,
        recentModels: [selection, ...normalized.recentModels.filter(candidate => !sameModelKey(candidate, selection))]
            .slice(0, MAX_RECENT_MODELS),
    };
}
/** JSON-safe opaque command-row identity; decoding retains both structured fields. */
export function modelOptionId(key) {
    return JSON.stringify([key.provider, key.model]);
}
/** Decode a command option identity without treating a display string as authority. */
export function modelKeyFromOptionId(id) {
    try {
        const value = JSON.parse(id);
        if (!Array.isArray(value) || value.length !== 2)
            return undefined;
        return keyOf({ provider: value[0], model: value[1] });
    }
    catch {
        return undefined;
    }
}
function modelForCurrent(group, current) {
    if (current === null || current.provider !== group.id)
        return undefined;
    return group.models.find(model => model.id === current.model);
}
function currentFallbackGroup(groups, current) {
    if (current === null)
        return groups.map(group => ({ ...group, models: [...group.models] }));
    const result = groups.map(group => ({ ...group, models: [...group.models] }));
    const group = result.find(candidate => candidate.id === current.provider);
    if (group === undefined) {
        result.push({
            id: current.provider,
            name: current.provider,
            models: [{ id: current.model, name: current.model }],
        });
        return result;
    }
    if (modelForCurrent(group, current) === undefined) {
        group.models.push({ id: current.model, name: current.model });
    }
    return result;
}
/**
 * Apply pinned models, provider ordering, and disabled-provider filtering to a
 * Host catalog. Official provider/model order is preserved for all ties.
 */
export function sortModelCatalog(snapshot, config, options = {}) {
    const normalized = normalizeModelPreferences(config);
    const includeDisabled = options.includeDisabled === true;
    const disabled = new Set(normalized.disabledProviders);
    const providerOrder = new Map(normalized.providerOrder.map((provider, index) => [provider, index]));
    const groups = currentFallbackGroup(snapshot.groups, snapshot.current)
        .map((group, index) => ({ group, index }))
        .sort((left, right) => {
        if (left.group.id === PRIMARY_PROVIDER_ID && right.group.id !== PRIMARY_PROVIDER_ID)
            return -1;
        if (right.group.id === PRIMARY_PROVIDER_ID && left.group.id !== PRIMARY_PROVIDER_ID)
            return 1;
        const leftRank = providerOrder.get(left.group.id);
        const rightRank = providerOrder.get(right.group.id);
        if (leftRank !== undefined && rightRank !== undefined)
            return leftRank - rightRank;
        if (leftRank !== undefined)
            return -1;
        if (rightRank !== undefined)
            return 1;
        return left.index - right.index;
    });
    const pinned = [];
    const visibleGroups = [];
    for (const { group } of groups) {
        const providerDisabled = disabled.has(group.id);
        const isCurrentProvider = snapshot.current?.provider === group.id;
        if (providerDisabled && !isCurrentProvider && !includeDisabled)
            continue;
        const modelOptions = group.models.map(model => ({
            provider: group.id,
            providerName: group.name || group.id,
            model,
            pinned: normalized.pinnedModels.some(key => key.provider === group.id && key.model === model.id),
            current: snapshot.current?.provider === group.id && snapshot.current.model === model.id,
            providerDisabled,
        }));
        // A disabled current provider remains visible only for the active route;
        // other routes must not become selectable through a stale directory.
        const visibleModels = providerDisabled && isCurrentProvider && !includeDisabled
            ? modelOptions.filter(option => option.current)
            : modelOptions;
        for (const option of visibleModels) {
            if (option.pinned && (!providerDisabled || option.current || includeDisabled))
                pinned.push(option);
        }
        visibleGroups.push({
            id: group.id,
            name: group.name || group.id,
            providerDisabled,
            models: visibleModels.filter(option => !option.pinned),
        });
    }
    // The preference list is authoritative for the order of the pinned shelf;
    // a stale pin simply remains persisted and reappears when its provider
    // advertises the model again.
    pinned.sort((left, right) => {
        const leftIndex = normalized.pinnedModels.findIndex(key => key.provider === left.provider && key.model === left.model.id);
        const rightIndex = normalized.pinnedModels.findIndex(key => key.provider === right.provider && key.model === right.model.id);
        return leftIndex - rightIndex;
    });
    return { pinned, groups: visibleGroups, failures: snapshot.failures };
}
/** Flatten a projection in the same order used by both UI entry points. */
export function flattenModelOptions(catalog) {
    return [
        ...catalog.pinned,
        ...catalog.groups.flatMap(group => group.models),
    ];
}
/** Build the complete Host selection, retaining the current effort only for the same route. */
export function selectionForModel(option, current, reasoningEffort) {
    const effort = reasoningEffort
        ?? (current?.provider === option.provider && current.model === option.model.id
            ? current.reasoningEffort
            : option.model.reasoning?.defaultEffort);
    return {
        provider: option.provider,
        model: option.model.id,
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
    };
}
/** Return all catalog providers in effective settings order, including disabled rows. */
export function providerIdsInOrder(groups, config) {
    const normalized = normalizeModelPreferences(config);
    const known = [];
    for (const group of groups)
        if (!known.includes(group.id))
            known.push(group.id);
    const result = normalized.providerOrder.filter(provider => provider !== PRIMARY_PROVIDER_ID && known.includes(provider));
    for (const provider of known)
        if (!result.includes(provider))
            result.push(provider);
    const primary = result.indexOf(PRIMARY_PROVIDER_ID);
    if (primary > 0)
        result.unshift(...result.splice(primary, 1));
    return result;
}
/** Move one provider in the effective order while preserving unknown providers. */
export function moveProvider(config, provider, direction, knownProviders) {
    const order = providerIdsInOrder(knownProviders.map(id => ({ id, name: id, models: [] })), config);
    const index = order.indexOf(provider);
    const target = index + direction;
    const firstMovable = order[0] === PRIMARY_PROVIDER_ID ? 1 : 0;
    if (provider === PRIMARY_PROVIDER_ID || index < firstMovable || target < firstMovable || target >= order.length) {
        return normalizeModelPreferences(config);
    }
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return { ...normalizeModelPreferences(config), providerOrder: next };
}

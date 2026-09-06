import { normalizeMemoryConfig } from "../core/config.js";
import { MEMORY_SETTINGS_NAMESPACE } from "../core/schema.js";
import { MemorySettingsCard } from "./MemorySettingsCard.js";
import { en, zh } from "./locales.js";
export * from "./locales.js";
export { MemorySettingsCard } from "./MemorySettingsCard.js";
export const inject = ['slots', 'locale', 'settingsScope'];
function settingsBinder(ctx) {
    const compatibility = ctx.get('webUiSettings');
    if (compatibility !== undefined && typeof compatibility.bind === 'function') {
        return compatibility;
    }
    return ctx.settingsScope;
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('memory', { zh, en }), 'memory: dictionaries');
    const settingsScope = settingsBinder(ctx).bind({
        namespace: MEMORY_SETTINGS_NAMESPACE,
        decode: value => {
            try {
                return normalizeMemoryConfig(value);
            }
            catch {
                return undefined;
            }
        },
    });
    ctx.inject(['slots'], scope => {
        scope.slots.inject('web-ui.plugin.item', () => scope.slots.register({
            name: 'web-ui.plugin.item',
            id: 'memory',
            order: 118,
            locale: 'memory',
            inject: () => ({
                config: normalizeMemoryConfig(settingsScope.getSnapshot().value),
                settingsScope,
            }),
        }, MemorySettingsCard));
    });
}

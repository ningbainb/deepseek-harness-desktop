import { PERSONAL_PROMPT_SETTINGS_NAMESPACE, normalizePersonalPrompt, } from "../core/config.js";
import { PersonalPromptCard } from "./PersonalPromptCard.js";
import { en, zh } from "./locales.js";
export * from "./locales.js";
export { PersonalPromptCard } from "./PersonalPromptCard.js";
export const inject = ['slots', 'locale', 'settingsScope'];
function settingsBinder(ctx) {
    const compatibility = ctx.get('webUiSettings');
    if (compatibility !== undefined && typeof compatibility.bind === 'function')
        return compatibility;
    return ctx.settingsScope;
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('personal-prompt', { zh, en }), 'personal-prompt: dictionaries');
    const settingsScope = settingsBinder(ctx).bind({
        namespace: PERSONAL_PROMPT_SETTINGS_NAMESPACE,
        decode: value => {
            try {
                return normalizePersonalPrompt(value);
            }
            catch {
                return undefined;
            }
        },
    });
    ctx.inject(['slots'], scope => {
        scope.slots.inject('web-ui.plugin.item', () => scope.slots.register({
            name: 'web-ui.plugin.item',
            id: 'personal-prompt',
            order: 117,
            locale: 'personal-prompt',
            inject: () => ({ config: normalizePersonalPrompt(settingsScope.getSnapshot().value), settingsScope }),
        }, PersonalPromptCard));
    });
}

import { ImHubCard } from "./ImHubCard.js";
import { en, zh } from "./locales.js";
export { ImHubCard } from "./ImHubCard.js";
export { en, zh } from "./locales.js";
export const inject = ['slots', 'locale'];
const NAMESPACE = 'im-hub';
export function apply(ctx) {
    const accessor = ctx;
    const locale = accessor.get?.('locale');
    const slots = accessor.get?.('slots');
    if (locale?.register) {
        accessor.effect(() => locale.register(NAMESPACE, { zh, en }), 'im-hub: locales');
    }
    if (!slots?.inject || !slots?.register)
        return;
    accessor.effect(() => slots.inject('web-ui.plugin.item', () => slots.register({
        name: 'web-ui.plugin.item',
        id: 'im-hub',
        order: 116,
        locale: NAMESPACE,
        inject: () => ({}),
    }, ImHubCard)), 'im-hub: settings card');
}

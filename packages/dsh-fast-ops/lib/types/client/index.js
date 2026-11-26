import { FastOpsCard } from "./FastOpsCard.js";
import { en, zh } from "./locales.js";
export { FastOpsCard } from "./FastOpsCard.js";
export { en, zh } from "./locales.js";
export const inject = ['slots', 'locale'];
const NAMESPACE = 'fast-ops';
export function apply(ctx) {
    const accessor = ctx;
    const locale = accessor.get?.('locale');
    const slots = accessor.get?.('slots');
    if (locale?.register) {
        accessor.effect(() => locale.register(NAMESPACE, { zh, en }), 'fast-ops: locales');
    }
    if (!slots?.inject || !slots?.register)
        return;
    accessor.effect(() => slots.inject('web-ui.plugin.item', () => slots.register({
        name: 'web-ui.plugin.item',
        id: 'fast-ops',
        order: 117,
        locale: NAMESPACE,
        inject: () => ({}),
    }, FastOpsCard)), 'fast-ops: settings card');
}

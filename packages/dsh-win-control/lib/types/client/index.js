import { WinControlCard } from "./WinControlCard.js";
import { WinControlPill } from "./WinControlPill.js";
import { en, zh } from "./locales.js";
export { WinControlCard } from "./WinControlCard.js";
export { WinControlPill } from "./WinControlPill.js";
export { en, zh } from "./locales.js";
export const inject = ['slots', 'locale'];
const NAMESPACE = 'win-control';
export function apply(ctx) {
    const accessor = ctx;
    const locale = accessor.get?.('locale');
    const slots = accessor.get?.('slots');
    if (locale?.register) {
        accessor.effect(() => locale.register(NAMESPACE, { zh, en }), 'win-control: locales');
    }
    if (!slots?.inject || !slots?.register)
        return;
    accessor.effect(() => slots.inject('conversation.input.left', () => slots.register({
        name: 'conversation.input.left',
        id: 'win-control-pill',
        order: 95,
        locale: NAMESPACE,
        inject: (sessionId) => ({ sessionId }),
    }, WinControlPill)), 'win-control: composer pill');
    accessor.effect(() => slots.inject('web-ui.plugin.item', () => slots.register({
        name: 'web-ui.plugin.item',
        id: 'win-control',
        order: 118,
        locale: NAMESPACE,
        inject: () => ({}),
    }, WinControlCard)), 'win-control: settings card');
}

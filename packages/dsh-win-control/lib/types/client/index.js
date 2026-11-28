import { WinControlCard } from "./WinControlCard.js";
import { WinControlMenuOption, WinControlPill } from "./WinControlPill.js";
import { en, zh } from "./locales.js";
export { WinControlCard } from "./WinControlCard.js";
export { WinControlMenuOption, WinControlPill } from "./WinControlPill.js";
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
    accessor.effect(() => slots.inject('conversation.input.model.options', () => slots.register({
        name: 'conversation.input.model.options',
        id: 'win-control-option',
        order: 70,
        locale: NAMESPACE,
        inject: (sessionId) => ({ sessionId }),
    }, WinControlMenuOption)), 'win-control: model menu option');
    accessor.effect(() => slots.inject('model-preferences.menu.options', () => slots.register({
        name: 'model-preferences.menu.options',
        id: 'win-control-option',
        order: 70,
        locale: NAMESPACE,
        inject: (sessionId) => ({ sessionId }),
    }, WinControlMenuOption)), 'win-control: model-preferences menu option');
    accessor.effect(() => slots.inject('web-ui.plugin.item', () => slots.register({
        name: 'web-ui.plugin.item',
        id: 'win-control',
        order: 118,
        locale: NAMESPACE,
        inject: () => ({}),
    }, WinControlCard)), 'win-control: settings card');
}

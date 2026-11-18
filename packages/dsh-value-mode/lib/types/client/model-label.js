import { isCompleteModelRoute, isPendingBaiModel } from "../core/config.js";
import { en, zh } from "./locales.js";
export function formatValueModeModelLabel(route) {
    const copy = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? en : zh;
    if (isPendingBaiModel(route))
        return copy.modelRequiresBaiSignIn;
    return isCompleteModelRoute(route) ? `${route.provider} / ${route.model}` : copy.notSelected;
}

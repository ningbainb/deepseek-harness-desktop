import { isCompleteModelRoute, isPendingBaiModel, type ModelRouteSelection } from '../core/config.ts'
import { en, zh } from './locales.ts'

export function formatValueModeModelLabel(route?: ModelRouteSelection): string {
  const copy = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? en : zh
  if (isPendingBaiModel(route)) return copy.modelRequiresBaiSignIn
  return isCompleteModelRoute(route) ? `${route.provider} / ${route.model}` : copy.notSelected
}

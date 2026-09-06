/**
 * Compatibility entry for the owner-aware mobile API.
 *
 * Keep a single implementation so future changes cannot accidentally route
 * production traffic through the retired pairing-only API.
 */
export { makeMobileApiRoutes, MOBILE_API_PATHS } from './mobile-api-secure.ts'
export type { MobileApiDeps } from './mobile-api-secure.ts'

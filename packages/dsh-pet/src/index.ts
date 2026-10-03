/**
 * dsh-pet host half — mounts the pet service and its HTTP routes. The
 * browser half (the `./client` entry) renders the whale-girl companion and
 * drives it through the same-origin `/api/pet/*` JSON endpoints plus the
 * `/pet/whale/*` media route. Install via `dsh plugin --profile web add
 * link:<dsh-web-ui>/packages/dsh-pet`; the cordis.patch.yml inserts this plugin row.
 * @module @linxin666/dsh-pet
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { PetService, PET_SETTINGS_NAMESPACE, type PetConfig, type PetSettingsSection } from './service.ts'
import { makePetRoutes, petPackageRoot } from './routes.ts'
import {
  DEFAULT_PET_NAME,
  DISPLAY_INSET_MAX,
  DISPLAY_SIZE_MAX,
  DISPLAY_SIZE_MIN,
  PET_NAME_MAX_LENGTH,
} from './persist.ts'

export { PetService } from './service.ts'
export type {
  PetConfig,
  PetInteractResult,
  PetStateView,
} from './service.ts'
export {
  AFFINITY_MAX,
  AFFINITY_RANKS,
  applyInteraction,
  applyTurnReward,
  emptyAffinity,
  rankOf,
} from './affinity.ts'
export type {
  AffinityConfig,
  AffinityState,
  InteractionOutcome,
  PetInteraction,
} from './affinity.ts'
export {
  animationForPhase,
  PetStateMachine,
  rowOf,
} from './state.ts'
export type {
  ActivityPhase,
  PetAnimation,
  PetStateConfig,
  PetStateInput,
  PetStateSnapshot,
} from './state.ts'
export {
  consumeTreat,
  defaultTreatConfig,
  emptyTreatLedger,
  settleTreatGrants,
} from './treats.ts'
export type { TreatConfig, TreatLedger, TreatSettlement } from './treats.ts'
export {
  defaultDisplayConfig,
  emptyPersist,
  loadPetPersist,
  petHomeDir,
  savePetPersist,
} from './persist.ts'
export type { PetDisplayConfig, PetPersist } from './persist.ts'

export {
  makePetRoutes,
  petPackageRoot,
  PET_API_PREFIX,
  PET_ASSET_PREFIX,
} from './routes.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'pet'

/** Services required before the pet can mount its surfaces. */
export const inject = ['webServer']

/** Settings section schema: the display fields and name the web settings surface edits. */
export const Config = z.object({
  affinity: z.any(),
  state: z.any(),
  treats: z.any(),
  persistDir: z.string(),
  visible: z.boolean().volatile(),
  size: z.number().step(1).min(DISPLAY_SIZE_MIN).max(DISPLAY_SIZE_MAX).volatile(),
  right: z.number().step(1).min(0).max(DISPLAY_INSET_MAX).volatile(),
  bottom: z.number().step(1).min(0).max(DISPLAY_INSET_MAX).volatile(),
  name: z.string().min(1).max(PET_NAME_MAX_LENGTH).pattern(/\S/).volatile(),
  enabled: z.boolean().volatile(),
})
export const PET_SETTINGS_SCHEMA = Config

/** Register the pet service and its API + asset routes on the context. */
export function apply(ctx: Context, config: PetConfig = {}): void {
  const initial = Object.fromEntries(Object.entries(config).map(([key, field]) => [key,
    typeof field === 'object' && field !== null && 'get' in field && typeof field.get === 'function'
      ? field.get() : field])) as PetConfig
  const service = new PetService(ctx, initial)

  // The settings surface edits the display config through the `pet`
  // namespace. The composition `base` starts as the persisted pet.json
  // values (clamped to schema bounds), so an empty user layer resolves to
  // exactly what the pet already shows — a fresh deployment never
  // overwrites a customized layout, and reset re-inherits it. Runtime drag
  // interactions mirror back into the settings document through the service
  // (see syncSettingsFromPet), keeping both views consistent.
  let current: () => PetSettingsSection = () => base
  const base: PetSettingsSection = {
    visible: service.display().visible,
    size: service.display().size,
    right: service.display().right,
    bottom: service.display().bottom,
    name: service.petName(),
    enabled: initial.enabled ?? true,
  }
  // The browser half talks to the pet through same-origin JSON endpoints and
  // loads the atlas from the pet's own media route (RPC domains are
  // platform-registered, so the pet serves its own API — the same pattern as
  // dsh-remote-web-ui's /api/pair family). The routes are registered while
  // the plugin is enabled; toggling the setting off makes the pet API
  // disappear until it is re-enabled.
  const routes = makePetRoutes({ service, packageRoot: petPackageRoot(import.meta.url) })
  let disposeRoutes: (() => void) | undefined
  const syncRoutes = (): void => {
    const enabled = current().enabled ?? true
    if (disposeRoutes === undefined && enabled) {
      disposeRoutes = ctx.effect(
        () => {
          const disposers = routes.map((route) => ctx.webServer.register(route))
          return () => { for (const dispose of disposers) dispose() }
        },
        'pet: routes',
      )
    } else if (disposeRoutes !== undefined && !enabled) {
      disposeRoutes()
      disposeRoutes = undefined
    }
  }
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings
    let seeding = false
    const refresh = (): void => {
      const form = settings.describe().find(item => item.ns === PET_SETTINGS_NAMESPACE)
      if (form === undefined) return
      const user = form.user as Partial<PetSettingsSection>
      if (Object.keys(user).length === 0) {
        if (seeding) return
        seeding = true
        // The profile has no pet overrides yet. Seed it from pet.json once so
        // the form reflects the user's actual layout instead of schema defaults.
        void settings.update(PET_SETTINGS_NAMESPACE, base).catch(error =>
          ctx.logger?.warn?.(`pet: could not migrate saved layout: ${String(error)}`)).finally(() => {
            seeding = false
          })
        return
      }
      current = () => ({ ...base, ...(form.value as Partial<PetSettingsSection>) })
      const section = current()
      if (section.visible !== service.display().visible
        || section.size !== service.display().size
        || section.right !== service.display().right
        || section.bottom !== service.display().bottom
        || section.name !== service.petName()) service.applySettingsSection(section)
      if (service.isEnabled() !== (section.enabled ?? true)) service.setEnabled(section.enabled ?? true)
      syncRoutes()
    }
    ctx.on('settings/document-updated', (namespace) => {
      if (namespace === PET_SETTINGS_NAMESPACE) refresh()
    })
    refresh()
    const loader = (ctx.root as Context & { loader?: { await(): Promise<void> } }).loader
    void loader?.await().then(refresh).catch((error: unknown) =>
      ctx.logger?.warn?.(`pet: settings initialization failed: ${String(error)}`))
  })
  syncRoutes()
}

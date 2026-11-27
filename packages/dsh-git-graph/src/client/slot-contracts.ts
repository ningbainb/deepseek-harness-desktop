import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the conversation
// slots); the selector-context hole is spelled locally below because the
// published npm SDK (rc.6) dropped it while the running shell still renders it.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitGraphKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The git-graph chip copy. */
    'git-graph': GitGraphKey
  }

  interface SlotMap {
    /**
     * The input selector context-chip hole: feature chips rendered right
     * after the workspace selector (the git branch selector's seat).
     * Session-maybe: entries stay mounted without a session and hide
     * themselves when their data source is absent.
     *
     * Declared and rendered by the running dsh web shell
     * (ui-conversation's InputSelectorRow); the published npm SDK (rc.6)
     * dropped this hole, so it is spelled locally to keep the chip's
     * registration type-checked without depending on the sibling SDK surface.
     */
    'conversation.input.selector.context': {
      kind: 'list'
      scope: 'session-maybe'
      owner: InputSelectorContextOwnerProps
    }
  }
}

/** Owner share of the input selector context-chip hole (empty by contract). */
export interface InputSelectorContextOwnerProps {}

export type BranchSlotProps =
  (PropsRuntime<'conversation.input.selector.context'> | PropsRuntime<'conversation.input.dock'>)
  & PropsLocale<'git-graph'>
